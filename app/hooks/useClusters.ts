"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clusterApi, browserApi, databaseApi, type ClusterCreatePayload } from "@/lib/api";
import toast from "react-hot-toast";

export const clusterKeys = {
  all: ["clusters"] as const,
  list: (status?: string) => [...clusterKeys.all, "list", status] as const,
  detail: (id: string) => [...clusterKeys.all, "detail", id] as const,
  stats: (id: string) => [...clusterKeys.all, "stats", id] as const,
  health: (id: string) => [...clusterKeys.all, "health", id] as const,
  databases: (id: string) => [...clusterKeys.detail(id), "databases"] as const,
  schema: (id: string, db: string) => [...clusterKeys.detail(id), "schema", db] as const,
};

export function useClusters(status?: string) {
  return useQuery({
    queryKey: clusterKeys.list(status),
    queryFn: () => clusterApi.list(status),
    refetchInterval: 5000,
  });
}

export function useCluster(id: string) {
  return useQuery({
    queryKey: clusterKeys.detail(id),
    queryFn: () => clusterApi.get(id),
    enabled: !!id,
    refetchInterval: 5000,
  });
}

export function useClusterStats(id: string) {
  return useQuery({
    queryKey: clusterKeys.stats(id),
    queryFn: () => clusterApi.stats(id),
    enabled: !!id,
    refetchInterval: 8000,
  });
}

export function useClusterHealth(id: string) {
  return useQuery({
    queryKey: clusterKeys.health(id),
    queryFn: () => clusterApi.health(id),
    enabled: !!id,
    refetchInterval: 10000,
  });
}

export function useDatabases(clusterId: string) {
  return useQuery<{ name: string; size?: string }[]>({
    queryKey: clusterKeys.databases(clusterId),
    queryFn: () =>
      browserApi.listDatabases(clusterId).then((res) =>
        Array.isArray(res) ? res : (res?.databases ?? [])
      ),
    enabled: !!clusterId,
    staleTime: 30_000,
  });
}

export function useCreateCluster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ClusterCreatePayload) => clusterApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clusterKeys.all });
      toast.success("Cluster creation started!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteCluster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clusterApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clusterKeys.all });
      toast.success("Cluster deleted.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useClusterAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "start" | "stop" | "restart" }) =>
      clusterApi[action](id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: clusterKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: clusterKeys.all });
      toast.success(`Cluster ${vars.action}ed successfully.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useExecuteQuery() {
  return useMutation({
    mutationFn: ({
      clusterId,
      query,
      nodeId,
      database,
    }: {
      clusterId: string;
      query: string;
      nodeId?: string;
      database?: string;
    }) => clusterApi.query(clusterId, query, nodeId, database),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSchemaContext(clusterId: string, database: string) {
  return useQuery<{ schema_text: string; table_count: number; error?: string }>({
    queryKey: clusterKeys.schema(clusterId, database),
    queryFn: () => browserApi.getFullSchema(clusterId, database),
    enabled: !!clusterId && !!database,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 10_000,
  });
}

// ─── User Databases (Database-as-a-Service) ──────────────────────────────────

export const userDatabaseKeys = {
  all: ["user-databases"] as const,
  list: () => [...userDatabaseKeys.all, "list"] as const,
};

export function useUserDatabases() {
  return useQuery({
    queryKey: userDatabaseKeys.list(),
    queryFn: () => databaseApi.list(),
    refetchInterval: 30_000,
  });
}

export function useCreateDatabase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; db_type: "postgres" | "mysql" }) =>
      databaseApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userDatabaseKeys.all });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteDatabase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => databaseApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userDatabaseKeys.all });
      toast.success("Database deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
