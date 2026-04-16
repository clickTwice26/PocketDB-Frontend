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

// ─── Database Browser ─────────────────────────────────────────────────────────

export interface BrowserDatabase {
  name: string;
  size?: string;
}

export interface BrowserTable {
  name: string;
  schema?: string;
  estimated_rows: number;
  size?: string;
}

export interface BrowserColumn {
  name: string;
  data_type: string;
  udt_name?: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length?: number | null;
  numeric_precision?: number | null;
  numeric_scale?: number | null;
  ordinal_position: number;
  is_primary_key: boolean | number;
  column_key?: string;
  extra?: string;
}

export interface BrowserIndex {
  name?: string;
  indexname?: string;
  definition?: string;
  indexdef?: string;
  is_primary?: boolean;
  is_unique?: boolean;
  // MySQL fields
  Key_name?: string;
  Column_name?: string;
  Non_unique?: number;
}

export interface BrowserForeignKey {
  column_name: string;
  foreign_table: string;
  foreign_column: string;
  constraint_name: string;
}

export interface BrowserStructure {
  columns: BrowserColumn[];
  indexes: BrowserIndex[];
  foreign_keys: BrowserForeignKey[];
  primary_keys: string[];
  error?: string;
}

export interface BrowserData {
  columns: string[];
  rows: unknown[][];
  total: number;
  page: number;
  page_size: number;
  error?: string;
}

// ─── Backup & Restore ─────────────────────────────────────────────────────────

export interface BackupResult {
  success: boolean;
  dump: string;
  engine: string;
  database: string;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  message: string;
  output?: string;
  error?: string;
}

// ─── ERD Diagrams ───────────────────────────────────────────────────────────

export interface ERDDiagram {
  id: string;
  user_id: string;
  name: string;
  cluster_id: string | null;
  database_name: string | null;
  tables_json: unknown[];
  positions_json: Record<string, { x: number; y: number }>;
  created_at: string;
  updated_at: string;
}


