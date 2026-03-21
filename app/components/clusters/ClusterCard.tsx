"use client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircle,
  faDatabase,
  faServer,
  faNetworkWired,
  faPlay,
  faStop,
  faRotate,
  faTrash,
  faEye,
  faEllipsisV,
} from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import Link from "next/link";
import type { ClusterListItem } from "@/types";
import { useClusterAction, useDeleteCluster } from "@/hooks/useClusters";
import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";

const STATUS_CONFIG = {
  running: { label: "Running", className: "badge-running", dot: "bg-green-500" },
  stopped: { label: "Stopped", className: "badge-stopped", dot: "bg-slate-500" },
  creating: { label: "Creating", className: "badge-creating", dot: "bg-yellow-500 animate-pulse" },
  error: { label: "Error", className: "badge-error", dot: "bg-red-500" },
  deleting: { label: "Deleting", className: "badge-deleting", dot: "bg-orange-500 animate-pulse" },
};

const TYPE_LABELS: Record<string, string> = {
  standalone: "Standalone",
  primary_replica: "Primary-Replica",
  multi_primary: "Multi-Primary",
};

interface Props {
  cluster: ClusterListItem;
}

export default function ClusterCard({ cluster }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { mutate: action, isPending: actionPending } = useClusterAction();
  const { mutate: deleteCluster, isPending: deletePending } = useDeleteCluster();
  const statusCfg = STATUS_CONFIG[cluster.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.stopped;

  return (
    <div className="card hover:border-brand-500/30 hover:shadow-xl hover:shadow-brand-500/5 group relative animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center">
            <FontAwesomeIcon icon={faDatabase} className="text-brand-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">{cluster.name}</h3>
            <p className="text-xs text-slate-500">
              {TYPE_LABELS[cluster.cluster_type] ?? cluster.cluster_type}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={clsx("badge", statusCfg.className)}>
            <span className={clsx("w-1.5 h-1.5 rounded-full", statusCfg.dot)} />
            {statusCfg.label}
          </span>

          {/* Menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-surface-100 transition-colors"
            >
              <FontAwesomeIcon icon={faEllipsisV} className="text-xs" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 bg-surface-100 border border-surface-border rounded-xl shadow-xl shadow-black/40 min-w-[160px] py-1">
                <Link
                  href={`/dashboard/clusters/${cluster.id}`}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-surface-200 transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  <FontAwesomeIcon icon={faEye} className="w-3.5" />
                  View Details
                </Link>
                {cluster.status === "stopped" && (
                  <button
                    onClick={() => { action({ id: cluster.id, action: "start" }); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-green-400 hover:bg-surface-200 transition-colors"
                  >
                    <FontAwesomeIcon icon={faPlay} className="w-3.5" />
                    Start
                  </button>
                )}
                {cluster.status === "running" && (
                  <>
                    <button
                      onClick={() => { action({ id: cluster.id, action: "stop" }); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-yellow-400 hover:bg-surface-200 transition-colors"
                    >
                      <FontAwesomeIcon icon={faStop} className="w-3.5" />
                      Stop
                    </button>
                    <button
                      onClick={() => { action({ id: cluster.id, action: "restart" }); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-blue-400 hover:bg-surface-200 transition-colors"
                    >
                      <FontAwesomeIcon icon={faRotate} className="w-3.5" />
                      Restart
                    </button>
                  </>
                )}
                <hr className="border-surface-border my-1" />
                <button
                  onClick={() => { deleteCluster(cluster.id); setMenuOpen(false); }}
                  disabled={deletePending}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-surface-200 transition-colors disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faTrash} className="w-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-surface-100 rounded-lg p-2.5 text-center">
          <FontAwesomeIcon icon={faServer} className="text-brand-400 text-xs mb-1" />
          <p className="text-xs text-slate-400">Nodes</p>
          <p className="text-sm font-semibold text-white">{cluster.node_count}</p>
        </div>
        <div className="bg-surface-100 rounded-lg p-2.5 text-center">
          <FontAwesomeIcon icon={faDatabase} className="text-purple-400 text-xs mb-1" />
          <p className="text-xs text-slate-400">{(cluster.db_type ?? "pg").toUpperCase()}</p>
          <p className="text-sm font-semibold text-white">{cluster.db_version}</p>
        </div>
        <div className="bg-surface-100 rounded-lg p-2.5 text-center">
          <FontAwesomeIcon icon={faNetworkWired} className="text-cyan-400 text-xs mb-1" />
          <p className="text-xs text-slate-400">Type</p>
          <p className="text-2xs font-semibold text-white leading-tight">
            {TYPE_LABELS[cluster.cluster_type] ?? cluster.cluster_type}
          </p>
        </div>
      </div>

      {/* Description */}
      {cluster.description && (
        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{cluster.description}</p>
      )}

      {/* Tags */}
      {cluster.tags && Object.keys(cluster.tags).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(cluster.tags).slice(0, 3).map(([k, v]) => (
            <span key={k} className="px-2 py-0.5 rounded-md bg-brand-600/10 border border-brand-600/20 text-xs text-brand-300">
              {k}: {v}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-surface-border">
        <p className="text-xs text-slate-500">
          {formatDistanceToNow(new Date(cluster.created_at), { addSuffix: true })}
        </p>
        <Link
          href={`/dashboard/clusters/${cluster.id}`}
          className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
        >
          View →
        </Link>
      </div>
    </div>
  );
}
