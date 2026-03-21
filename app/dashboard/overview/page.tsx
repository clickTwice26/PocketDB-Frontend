"use client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDatabase, faServer, faCircleCheck, faCircleExclamation,
  faPlus, faArrowTrendUp, faLayerGroup, faCircle,
} from "@fortawesome/free-solid-svg-icons";
import { useClusters } from "@/hooks/useClusters";
import Topbar from "@/components/layout/Topbar";
import { useUIStore } from "@/store/ui";
import type { ClusterListItem } from "@/types";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";

const STATUS_DOT: Record<string, string> = {
  running: "bg-green-500",
  stopped: "bg-slate-500",
  creating: "bg-yellow-500 animate-pulse",
  error: "bg-red-500",
  deleting: "bg-orange-500",
};

export default function OverviewPage() {
  const { data: clusters = [], isLoading } = useClusters();
  const { setCreateModalOpen } = useUIStore();

  const stats = {
    total: clusters.length,
    running: clusters.filter((c: ClusterListItem) => c.status === "running").length,
    stopped: clusters.filter((c: ClusterListItem) => c.status === "stopped").length,
    error: clusters.filter((c: ClusterListItem) => c.status === "error").length,
    totalNodes: clusters.reduce((acc: number, c: ClusterListItem) => acc + c.node_count, 0),
  };

  return (
    <div className="min-h-full">
      <Topbar title="Overview" subtitle="PocketDB" />

      <div className="p-6 space-y-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900/80 via-surface-50 to-surface-50 border border-brand-500/20 p-6">
          <div className="absolute inset-0 bg-hero-glow opacity-60 pointer-events-none" />
          <div className="relative">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-2">
              Database Infrastructure
            </p>
            <h2 className="text-2xl font-bold text-white mb-1">
              Manage your database clusters
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              Spin up, monitor, and manage Docker-powered PostgreSQL, MySQL, and Redis clusters with ease.
            </p>
            <button onClick={() => setCreateModalOpen(true)} className="btn-primary">
              <FontAwesomeIcon icon={faPlus} />
              Create New Cluster
            </button>
          </div>
          <div className="absolute right-6 top-4 opacity-10">
            <FontAwesomeIcon icon={faDatabase} className="text-[120px] text-brand-400" />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Clusters", value: stats.total, icon: faLayerGroup, color: "text-brand-400", bg: "bg-brand-500/10 border-brand-500/20" },
            { label: "Running", value: stats.running, icon: faCircleCheck, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
            { label: "Stopped", value: stats.stopped, icon: faDatabase, color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20" },
            { label: "Total Nodes", value: stats.totalNodes, icon: faServer, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
          ].map((s) => (
            <div key={s.label} className={clsx("stat-card border", s.bg)}>
              <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center", s.bg)}>
                <FontAwesomeIcon icon={s.icon} className={clsx("text-lg", s.color)} />
              </div>
              <p className="text-2xl font-bold text-white">{isLoading ? "—" : s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Errors alert */}
        {stats.error > 0 && (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <FontAwesomeIcon icon={faCircleExclamation} className="text-red-400 text-lg shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-300">
                {stats.error} cluster{stats.error > 1 ? "s" : ""} in error state
              </p>
              <p className="text-xs text-red-400/70">
                Check the clusters page for details.
              </p>
            </div>
            <Link href="/dashboard/clusters" className="ml-auto text-xs text-red-300 hover:text-red-200 font-medium">
              View →
            </Link>
          </div>
        )}

        {/* Recent Clusters */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FontAwesomeIcon icon={faArrowTrendUp} className="text-brand-400" />
              Recent Clusters
            </h3>
            <Link href="/dashboard/clusters" className="text-xs text-brand-400 hover:text-brand-300">
              View all →
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-surface-50 rounded-xl border border-surface-border animate-pulse" />
              ))}
            </div>
          ) : clusters.length === 0 ? (
            <div className="card text-center py-12">
              <FontAwesomeIcon icon={faDatabase} className="text-4xl text-slate-600 mb-3" />
              <p className="text-slate-400 text-sm mb-4">No clusters yet</p>
              <button onClick={() => setCreateModalOpen(true)} className="btn-primary mx-auto">
                <FontAwesomeIcon icon={faPlus} />
                Create your first cluster
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {clusters.slice(0, 5).map((c: ClusterListItem) => (
                <Link
                  key={c.id}
                  href={`/dashboard/clusters/${c.id}`}
                  className="flex items-center gap-4 p-4 bg-surface-50 rounded-xl border border-surface-border hover:border-brand-500/30 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-brand-600/20 border border-brand-500/20 flex items-center justify-center shrink-0">
                    <FontAwesomeIcon icon={faDatabase} className="text-brand-400 text-xs" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{c.name}</p>
                    <p className="text-xs text-slate-500">
                      {c.node_count} node{c.node_count !== 1 ? "s" : ""} · {(c.db_type ?? "PG").toUpperCase()} {c.db_version}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={clsx("w-2 h-2 rounded-full", STATUS_DOT[c.status] ?? "bg-slate-500")} />
                    <span className="text-xs text-slate-400 capitalize">{c.status}</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
