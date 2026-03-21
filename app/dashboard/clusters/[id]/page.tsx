"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDatabase, faServer, faPlay, faStop, faRotate, faTrash,
  faArrowLeft, faSpinner, faTerminal, faChartBar, faNetworkWired,
  faCopy, faCheck, faCircle,
} from "@fortawesome/free-solid-svg-icons";
import { useCluster, useClusterStats, useClusterAction, useDeleteCluster } from "@/hooks/useClusters";
import Topbar from "@/components/layout/Topbar";
import type { Node } from "@/types";
import clsx from "clsx";
import { formatDistanceToNow, format } from "date-fns";
import Link from "next/link";
import { clusterApi } from "@/lib/api";
import toast from "react-hot-toast";

const STATUS_COLORS: Record<string, string> = {
  running: "text-green-400",
  stopped: "text-slate-400",
  creating: "text-yellow-400",
  error: "text-red-400",
  deleting: "text-orange-400",
};

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  primary: { label: "Primary", color: "text-brand-400" },
  replica: { label: "Replica", color: "text-purple-400" },
  standalone: { label: "Standalone", color: "text-cyan-400" },
};

export default function ClusterDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: cluster, isLoading } = useCluster(params.id);
  const { data: stats } = useClusterStats(params.id);
  const { mutate: action, isPending: actionPending } = useClusterAction();
  const { mutate: deleteCluster, isPending: deleting } = useDeleteCluster();
  const [activeTab, setActiveTab] = useState<"nodes" | "stats" | "logs">("nodes");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete cluster "${cluster?.name}"? This will remove all containers and data.`)) return;
    deleteCluster(params.id, {
      onSuccess: () => router.push("/dashboard/clusters"),
    });
  };

  const fetchLogs = async (nodeId: string) => {
    setLogsLoading(true);
    setSelectedNodeId(nodeId);
    setActiveTab("logs");
    try {
      const data = await clusterApi.nodeLogs(params.id, nodeId, 200);
      setLogs(data.logs);
    } catch {
      setLogs("Failed to fetch logs.");
    } finally {
      setLogsLoading(false);
    }
  };

  const copyConnectionString = (node: Node) => {
    if (!cluster || !node.host_port) return;
    let str = "";
    if (cluster.db_type === "redis") {
      str = `redis://localhost:${node.host_port}`;
    } else if (cluster.db_type === "mysql") {
      str = `mysql://${cluster.db_user ?? "root"}:***@localhost:${node.host_port}/${cluster.db_name ?? ""}`;
    } else {
      str = `postgresql://${cluster.db_user ?? "postgres"}:***@localhost:${node.host_port}/${cluster.db_name ?? "postgres"}`;
    }
    navigator.clipboard.writeText(str);
    toast.success("Connection string copied!");
  };

  if (isLoading) {
    return (
      <div className="min-h-full">
        <Topbar title="Cluster Details" />
        <div className="flex items-center justify-center h-64">
          <FontAwesomeIcon icon={faSpinner} className="text-3xl text-brand-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (!cluster) {
    return (
      <div className="min-h-full">
        <Topbar title="Not Found" />
        <div className="p-6 text-center text-slate-400">Cluster not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <Topbar title={cluster.name} subtitle={`${(cluster.db_type ?? "postgres").toUpperCase()} ${cluster.db_version}`} />

      <div className="p-6 space-y-5">
        {/* Breadcrumb */}
        <Link
          href="/dashboard/clusters"
          className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <FontAwesomeIcon icon={faArrowLeft} />
          Back to Clusters
        </Link>

        {/* Header card */}
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center">
                <FontAwesomeIcon icon={faDatabase} className="text-brand-400 text-xl" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{cluster.name}</h2>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className={clsx("text-sm font-medium capitalize", STATUS_COLORS[cluster.status])}>
                    ● {cluster.status}
                  </span>
                  <span className="text-slate-500 text-xs">·</span>
                  <span className="text-xs text-slate-400">{cluster.cluster_type.replace("_", "-")}</span>
                  <span className="text-slate-500 text-xs">·</span>
                  <span className="text-xs text-slate-400">{(cluster.db_type ?? "postgres").toUpperCase()} {cluster.db_version}</span>
                </div>
                {cluster.description && (
                  <p className="text-xs text-slate-500 mt-1">{cluster.description}</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {cluster.status === "running" && (
                <>
                  <button
                    onClick={() => action({ id: cluster.id, action: "restart" })}
                    disabled={actionPending}
                    className="btn-secondary text-sm"
                  >
                    <FontAwesomeIcon icon={faRotate} className={actionPending ? "animate-spin" : ""} />
                    Restart
                  </button>
                  <button
                    onClick={() => action({ id: cluster.id, action: "stop" })}
                    disabled={actionPending}
                    className="btn-secondary text-sm"
                  >
                    <FontAwesomeIcon icon={faStop} />
                    Stop
                  </button>
                </>
              )}
              {cluster.status === "stopped" && (
                <button
                  onClick={() => action({ id: cluster.id, action: "start" })}
                  disabled={actionPending}
                  className="btn-primary text-sm"
                >
                  <FontAwesomeIcon icon={faPlay} />
                  Start
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-danger text-sm"
              >
                {deleting ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" /> : <FontAwesomeIcon icon={faTrash} />}
                Delete
              </button>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            {[
              { label: "Database", value: cluster.db_name ?? "—" },
              { label: "User", value: cluster.db_user ?? "—" },
              { label: "Network", value: cluster.network_name ?? "—" },
              { label: "Created", value: formatDistanceToNow(new Date(cluster.created_at), { addSuffix: true }) },
            ].map((item) => (
              <div key={item.label} className="bg-surface-100 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                <p className="text-sm font-medium text-white truncate">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-surface-50 border border-surface-border rounded-xl p-1 w-fit">
          {[
            { id: "nodes", icon: faServer, label: "Nodes" },
            { id: "stats", icon: faChartBar, label: "Stats" },
            { id: "logs", icon: faTerminal, label: "Logs" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-brand-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <FontAwesomeIcon icon={tab.icon} className="text-xs" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Nodes Tab */}
        {activeTab === "nodes" && (
          <div className="space-y-3">
            {cluster.nodes.length === 0 ? (
              <div className="card text-center py-8 text-slate-500 text-sm">
                No nodes provisioned yet.
              </div>
            ) : (
              cluster.nodes.map((node: Node) => {
                const roleCfg = ROLE_CONFIG[node.role] ?? ROLE_CONFIG.standalone;
                const nodeStat = stats?.node_stats?.find((s: { node_id: string }) => s.node_id === node.id);
                return (
                  <div
                    key={node.id}
                    className="card hover:border-brand-500/20 transition-all"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-surface-100 border border-surface-border flex items-center justify-center">
                          <FontAwesomeIcon icon={faServer} className={clsx("text-sm", roleCfg.color)} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white">{node.name}</p>
                            <span className={clsx("text-xs font-semibold", roleCfg.color)}>
                              {roleCfg.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {node.container_name ?? "—"} · Port {node.host_port ?? "N/A"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {nodeStat && (
                          <div className="hidden md:flex gap-4 text-xs text-slate-400">
                            {nodeStat.cpu_percent !== undefined && (
                              <span>CPU: <strong className="text-white">{nodeStat.cpu_percent}%</strong></span>
                            )}
                            {nodeStat.memory_usage_mb !== undefined && (
                              <span>
                                MEM: <strong className="text-white">
                                  {nodeStat.memory_usage_mb?.toFixed(0)}MB
                                  {nodeStat.memory_limit_mb ? ` / ${nodeStat.memory_limit_mb?.toFixed(0)}MB` : ""}
                                </strong>
                              </span>
                            )}
                          </div>
                        )}
                        <span
                          className={clsx(
                            "text-xs px-2 py-0.5 rounded-full border font-medium capitalize",
                            node.status === "running"
                              ? "bg-green-500/10 text-green-400 border-green-500/30"
                              : "bg-slate-500/10 text-slate-400 border-slate-500/30"
                          )}
                        >
                          {node.status}
                        </span>
                        <button
                          onClick={() => copyConnectionString(node)}
                          className="btn-secondary text-xs"
                          title="Copy connection string"
                        >
                          <FontAwesomeIcon icon={faCopy} />
                        </button>
                        <button
                          onClick={() => fetchLogs(node.id)}
                          className="btn-secondary text-xs"
                        >
                          <FontAwesomeIcon icon={faTerminal} />
                          Logs
                        </button>
                      </div>
                    </div>

                    {/* Connection string */}
                    {node.host_port && (
                      <div className="mt-3 bg-surface-100 rounded-lg p-2.5 font-mono text-xs text-slate-400 flex items-center justify-between gap-2">
                        <span className="truncate">
                          {cluster.db_type === "redis"
                            ? `redis://localhost:${node.host_port}`
                            : cluster.db_type === "mysql"
                            ? `mysql://${cluster.db_user ?? "root"}:***@localhost:${node.host_port}/${cluster.db_name ?? ""}`
                            : `postgresql://${cluster.db_user ?? "postgres"}:***@localhost:${node.host_port}/${cluster.db_name ?? "postgres"}`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === "stats" && (
          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <FontAwesomeIcon icon={faChartBar} className="text-brand-400" />
              Node Resource Usage
            </h3>
            {!stats ? (
              <p className="text-slate-500 text-sm">Loading stats...</p>
            ) : (
              <div className="space-y-4">
                {stats.node_stats.map((s: any) => (
                  <div key={s.node_id} className="bg-surface-100 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-white">{s.node_name}</p>
                      <span className="text-xs text-slate-500 capitalize">{s.role}</span>
                    </div>
                    {s.cpu_percent !== undefined ? (
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>CPU</span>
                            <span>{s.cpu_percent}%</span>
                          </div>
                          <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-500 rounded-full transition-all"
                              style={{ width: `${Math.min(s.cpu_percent, 100)}%` }}
                            />
                          </div>
                        </div>
                        {s.memory_usage_mb !== undefined && (
                          <div>
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                              <span>Memory</span>
                              <span>
                                {s.memory_usage_mb?.toFixed(0)}MB
                                {s.memory_limit_mb ? ` / ${s.memory_limit_mb?.toFixed(0)}MB` : ""}
                              </span>
                            </div>
                            <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-500 rounded-full transition-all"
                                style={{
                                  width: s.memory_limit_mb
                                    ? `${Math.min((s.memory_usage_mb / s.memory_limit_mb) * 100, 100)}%`
                                    : "0%",
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Node is not running.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === "logs" && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FontAwesomeIcon icon={faTerminal} className="text-brand-400" />
                Container Logs
                {selectedNodeId && (
                  <span className="text-xs text-slate-500 font-normal">
                    — {cluster.nodes.find((n: Node) => n.id === selectedNodeId)?.name}
                  </span>
                )}
              </h3>
              {!selectedNodeId && (
                <p className="text-xs text-slate-500">Select a node from the Nodes tab to view logs.</p>
              )}
            </div>
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">
                <FontAwesomeIcon icon={faSpinner} className="text-brand-400 text-2xl animate-spin" />
              </div>
            ) : logs ? (
              <pre className="bg-surface-100 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[500px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {logs}
              </pre>
            ) : (
              <div className="bg-surface-100 rounded-xl p-8 text-center text-slate-500 text-sm">
                Click "Logs" on a node to view container logs here.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
