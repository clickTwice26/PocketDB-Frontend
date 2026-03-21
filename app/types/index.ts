export interface Node {
  id: string;
  name: string;
  container_id: string | null;
  container_name: string | null;
  role: "primary" | "replica" | "standalone";
  status: string;
  host_port: number | null;
  internal_port: number;
  cpu_limit: string | null;
  memory_limit: string | null;
  is_healthy: boolean;
  last_health_check: string | null;
  created_at: string;
}

export interface Cluster {
  id: string;
  name: string;
  description: string | null;
  cluster_type: "standalone" | "primary_replica" | "multi_primary";
  status: "creating" | "running" | "stopped" | "error" | "deleting";
  db_type: "postgres" | "mysql" | "redis";
  db_version: string;
  db_user: string | null;
  db_name: string | null;
  network_name: string | null;
  tags: Record<string, string> | null;
  created_at: string;
  updated_at: string;
  nodes: Node[];
}

export interface ClusterListItem {
  id: string;
  name: string;
  description: string | null;
  cluster_type: string;
  db_type: string;
  status: string;
  db_version: string;
  node_count: number;
  created_at: string;
  updated_at: string;
  tags: Record<string, string> | null;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  row_count: number;
  execution_time_ms: number;
  query: string;
  error: string | null;
}

export interface NodeStat {
  node_id: string;
  node_name: string;
  role: string;
  status: string;
  host_port: number | null;
  cpu_percent?: number;
  memory_usage_mb?: number;
  memory_limit_mb?: number;
}

export interface ClusterStats {
  cluster_id: string;
  cluster_name: string;
  node_stats: NodeStat[];
}

export interface ActionResponse {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}
