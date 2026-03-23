import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // send httpOnly cookie on every request
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Skip for the logout endpoint itself and the landing page.
      const url: string = err.config?.url ?? "";
      const onLanding = typeof window !== "undefined" && window.location.pathname === "/";
      if (!url.includes("/auth/logout") && !onLanding && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      }
    }
    const message =
      err.response?.data?.detail ?? err.message ?? "An unexpected error occurred";
    return Promise.reject(new Error(typeof message === "string" ? message : JSON.stringify(message)));
  }
);

export default api;

// ─── Auth API ─────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenOut {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export const authApi = {
  register: (name: string, email: string, password: string) =>
    api.post<TokenOut>("/auth/register", { name, email, password }).then((r) => r.data),

  login: (email: string, password: string) =>
    api.post<TokenOut>("/auth/login", { email, password }).then((r) => r.data),

  logout: () => api.post("/auth/logout").then((r) => r.data),

  me: () => api.get<AuthUser>("/auth/me").then((r) => r.data),
};

// ─── Cluster API ──────────────────────────────────────────────────────────────

export const clusterApi = {
  list: (status?: string) =>
    api.get("/clusters/", { params: status ? { status } : {} }).then((r) => r.data),

  get: (id: string) => api.get(`/clusters/${id}`).then((r) => r.data),

  create: (data: ClusterCreatePayload) =>
    api.post("/clusters/", data).then((r) => r.data),

  update: (id: string, data: { description?: string; tags?: Record<string, string> }) =>
    api.patch(`/clusters/${id}`, data).then((r) => r.data),

  delete: (id: string) => api.delete(`/clusters/${id}`).then((r) => r.data),

  start: (id: string) => api.post(`/clusters/${id}/start`).then((r) => r.data),
  stop: (id: string) => api.post(`/clusters/${id}/stop`).then((r) => r.data),
  restart: (id: string) => api.post(`/clusters/${id}/restart`).then((r) => r.data),

  health: (id: string) => api.get(`/clusters/${id}/health`).then((r) => r.data),
  stats: (id: string) => api.get(`/clusters/${id}/stats`).then((r) => r.data),

  query: (id: string, query: string, nodeId?: string, database?: string) =>
    api
      .post(`/clusters/${id}/query`, { query, node_id: nodeId, database })
      .then((r) => r.data),

  nodeLogs: (clusterId: string, nodeId: string, tail = 100) =>
    api
      .get(`/clusters/${clusterId}/nodes/${nodeId}/logs`, { params: { tail } })
      .then((r) => r.data),
};

export interface ClusterCreatePayload {
  name: string;
  description?: string;
  cluster_type: string;
  db_type: "postgres" | "mysql" | "redis";
  db_version: string;
  db_user?: string;
  db_name?: string;
  db_password?: string;
  node_count: number;
  cpu_limit?: string;
  memory_limit?: string;
  base_port?: number;
  tags?: Record<string, string>;
}

// ─── Database Browser API ─────────────────────────────────────────────────────

export const browserApi = {
  listDatabases: (clusterId: string) =>
    api.get(`/clusters/${clusterId}/browser/databases`).then((r) => r.data),

  getFullSchema: (clusterId: string, database: string) =>
    api.get(`/clusters/${clusterId}/browser/schema`, { params: { database } }).then((r) => r.data),

  listTables: (clusterId: string, database: string) =>
    api.get(`/clusters/${clusterId}/browser/databases/${encodeURIComponent(database)}/tables`).then((r) => r.data),

  getStructure: (clusterId: string, database: string, table: string, schema = "public") =>
    api.get(`/clusters/${clusterId}/browser/databases/${encodeURIComponent(database)}/tables/${encodeURIComponent(table)}/structure`, {
      params: { schema },
    }).then((r) => r.data),

  getData: (
    clusterId: string, database: string, table: string,
    opts: { schema?: string; page?: number; page_size?: number; sort?: string; dir?: string } = {}
  ) =>
    api.get(`/clusters/${clusterId}/browser/databases/${encodeURIComponent(database)}/tables/${encodeURIComponent(table)}/data`, {
      params: { schema: "public", page: 1, page_size: 50, ...opts },
    }).then((r) => r.data),

  insertRow: (clusterId: string, database: string, table: string, row: Record<string, unknown>, schema = "public") =>
    api.post(
      `/clusters/${clusterId}/browser/databases/${encodeURIComponent(database)}/tables/${encodeURIComponent(table)}/data`,
      { row },
      { params: { schema } }
    ).then((r) => r.data),

  updateRow: (
    clusterId: string, database: string, table: string,
    pk_column: string, pk_value: string,
    row: Record<string, unknown>, schema = "public"
  ) =>
    api.put(
      `/clusters/${clusterId}/browser/databases/${encodeURIComponent(database)}/tables/${encodeURIComponent(table)}/data`,
      { pk_column, pk_value, row },
      { params: { schema } }
    ).then((r) => r.data),

  deleteRow: (
    clusterId: string, database: string, table: string,
    pk_column: string, pk_value: string, schema = "public"
  ) =>
    api.delete(
      `/clusters/${clusterId}/browser/databases/${encodeURIComponent(database)}/tables/${encodeURIComponent(table)}/data`,
      { params: { schema, pk_column, pk_value } }
    ).then((r) => r.data),
};

// ─── AI Agent API ─────────────────────────────────────────────────────────────
//
// Uses native fetch + ReadableStream for SSE so we can stream tokens as they
// arrive from Gemini — axios does not support incremental streaming.
//
// Usage:
//   for await (const chunk of aiApi.sqlAssistStream({...})) {
//     setResponse(prev => prev + chunk);
//   }

export interface AISSEChunk {
  type: "chunk" | "done" | "error";
  text?: string;
  message?: string;
}

async function* _sseStream(url: string, body: object): AsyncGenerator<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE lines are separated by "\n\n"
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice("data:".length).trim();
      try {
        const evt: AISSEChunk = JSON.parse(json);
        if (evt.type === "chunk" && evt.text) {
          yield evt.text;
        } else if (evt.type === "error") {
          throw new Error(evt.message ?? "AI stream error");
        }
        // type === "done" → loop naturally ends
      } catch {
        // malformed chunk — skip
      }
    }
  }
}

export const aiApi = {
  /** Stream SQL/Redis command generation token-by-token. */
  sqlAssistStream(params: {
    prompt: string;
    clusterId?: string;
    dbType?: string;
    dbVersion?: string;
    schemaContext?: string;
  }): AsyncGenerator<string> {
    return _sseStream("/api/v1/ai/sql-assist", {
      prompt: params.prompt,
      cluster_id: params.clusterId ?? null,
      db_type: params.dbType ?? "postgres",
      db_version: params.dbVersion ?? "",
      schema_context: params.schemaContext ?? "",
    });
  },

  /** Stream multi-turn chat responses. */
  chatStream(params: {
    messages: { role: "user" | "model"; content: string }[];
    clusterId?: string;
    dbType?: string;
    dbVersion?: string;
    clusterName?: string;
    schemaContext?: string;
  }): AsyncGenerator<string> {
    return _sseStream("/api/v1/ai/chat", {
      messages: params.messages,
      cluster_id: params.clusterId ?? null,
      db_type: params.dbType ?? "postgres",
      db_version: params.dbVersion ?? "",
      cluster_name: params.clusterName ?? "unknown",
      schema_context: params.schemaContext ?? "",
    });
  },

  /** Check if AI is configured on the backend. */
  status: () => api.get("/ai/status").then((r) => r.data) as Promise<{
    available: boolean;
    model: string | null;
    message: string;
  }>,
};

// ─── EXPLAIN / Query Plan API ────────────────────────────────────────────────

export const explainApi = {
  explain: (clusterId: string, query: string, analyze = false, database?: string) =>
    api.post(`/clusters/${clusterId}/explain`, { query, analyze, database }).then((r) => r.data),
};

// ─── Index Management API ────────────────────────────────────────────────────

export const indexApi = {
  list: (clusterId: string, database: string, table?: string, schema = "public") =>
    api.get(`/clusters/${clusterId}/indexes`, {
      params: { database, table: table || undefined, schema },
    }).then((r) => r.data),

  create: (
    clusterId: string,
    data: {
      database: string; table: string; index_name: string;
      columns: string[]; index_type?: string; unique?: boolean; schema?: string;
    }
  ) => api.post(`/clusters/${clusterId}/indexes`, data).then((r) => r.data),

  drop: (
    clusterId: string,
    data: { database: string; index_name: string; table?: string; schema?: string }
  ) => api.delete(`/clusters/${clusterId}/indexes`, { data }).then((r) => r.data),
};

// ─── Backup & Restore API ────────────────────────────────────────────────────

export const backupApi = {
  backup: (clusterId: string, database: string) =>
    api.post(`/clusters/${clusterId}/backup`, null, { params: { database }, timeout: 120000 }).then((r) => r.data),

  restore: (clusterId: string, database: string, sql_dump: string) =>
    api.post(`/clusters/${clusterId}/restore`, { database, sql_dump }, { timeout: 120000 }).then((r) => r.data),
};

// ─── Transaction Demo API ────────────────────────────────────────────────────

export const transactionApi = {
  isolationLevels: (clusterId: string) =>
    api.get(`/clusters/${clusterId}/isolation-levels`).then((r) => r.data),

  runDemo: (
    clusterId: string,
    data: {
      database: string;
      isolation_level: string;
      steps: { session: string; sql: string }[];
    }
  ) => api.post(`/clusters/${clusterId}/transaction-demo`, data, { timeout: 60000 }).then((r) => r.data),
};

