"use client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faServer, faCircle } from "@fortawesome/free-solid-svg-icons";
import { useClusters } from "@/hooks/useClusters";
import Topbar from "@/components/layout/Topbar";
import type { ClusterListItem, Node } from "@/types";
import Link from "next/link";
import clsx from "clsx";

const STATUS_DOT: Record<string, string> = {
  running: "bg-green-500",
  stopped: "bg-slate-500",
  creating: "bg-yellow-500 animate-pulse",
  error: "bg-red-500",
};

export default function NodesPage() {
  const { data: clusters = [], isLoading } = useClusters();

  const allNodes = clusters.flatMap((c: ClusterListItem & { nodes?: Node[] }) =>
    (c.nodes ?? []).map((n: Node) => ({ ...n, clusterName: c.name, clusterId: c.id }))
  );

  return (
    <div className="min-h-full">
      <Topbar
        title="Nodes"
        subtitle={`${allNodes.length} total nodes across ${clusters.length} clusters`}
      />

      <div className="p-6">
        {isLoading ? (
          <div className="text-center text-slate-400 py-16">Loading nodes...</div>
        ) : allNodes.length === 0 ? (
          <div className="card text-center py-16">
            <FontAwesomeIcon icon={faServer} className="text-4xl text-slate-600 mb-3" />
            <p className="text-slate-400">No nodes found. Create a cluster first.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-surface-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 border-b border-surface-border">
                <tr>
                  {["Node", "Cluster", "Role", "Status", "Port", "Healthy", "Resources", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allNodes.map((node: any) => (
                  <tr
                    key={node.id}
                    className="border-b border-surface-border/50 hover:bg-surface-50/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center">
                          <FontAwesomeIcon icon={faServer} className="text-xs text-slate-400" />
                        </div>
                        <span className="font-medium text-white text-sm">{node.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/clusters/${node.clusterId}`}
                        className="text-brand-400 hover:text-brand-300 text-sm"
                      >
                        {node.clusterName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        "text-xs font-semibold capitalize",
                        node.role === "primary" ? "text-brand-400" :
                        node.role === "replica" ? "text-purple-400" : "text-cyan-400"
                      )}>
                        {node.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={clsx("w-2 h-2 rounded-full", STATUS_DOT[node.status] ?? "bg-slate-500")} />
                        <span className="text-xs capitalize text-slate-300">{node.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                      {node.host_port ? `:${node.host_port}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        "text-xs font-medium",
                        node.is_healthy ? "text-green-400" : "text-slate-500"
                      )}>
                        {node.is_healthy ? "✓ Healthy" : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {node.cpu_limit && `CPU: ${node.cpu_limit}`}
                      {node.cpu_limit && node.memory_limit && " · "}
                      {node.memory_limit && `MEM: ${node.memory_limit}`}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/clusters/${node.clusterId}`}
                        className="text-xs text-brand-400 hover:text-brand-300"
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
