import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.detail ?? err.message ?? "An unexpected error occurred";
    return Promise.reject(new Error(typeof message === "string" ? message : JSON.stringify(message)));
  }
);

export default api;

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
