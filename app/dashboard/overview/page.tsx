"use client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDatabase, faServer, faCircleCheck, faCircleExclamation,
  faPlus, faLayerGroup, faArrowRight,
  faCheckCircle, faChartLine, faBolt, faCodeBranch,
  faUser, faKey, faTable,
} from "@fortawesome/free-solid-svg-icons";
import { useClusters, useUserDatabases } from "@/hooks/useClusters";
import Topbar from "@/components/layout/Topbar";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import type { ClusterListItem, UserDatabase } from "@/types";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

/* ── Status pill ─────────────────────────────────────────────── */
const STATUS_CONFIG: Record<string, { dot: string; pill: string; label: string }> = {
  running:  { dot: "bg-green-500",                  pill: "bg-green-500/10 text-green-500 border-green-500/20",   label: "Running"  },
  stopped:  { dot: "bg-slate-400",                  pill: "bg-surface-200 text-fg-muted border-surface-border",   label: "Stopped"  },
  creating: { dot: "bg-yellow-500 animate-pulse",   pill: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",label: "Creating" },
  error:    { dot: "bg-red-500",                    pill: "bg-red-500/10 text-red-400 border-red-500/20",         label: "Error"    },
  deleting: { dot: "bg-orange-500 animate-pulse",   pill: "bg-orange-500/10 text-orange-400 border-orange-500/20",label: "Deleting" },
};

/* ── DB type badge ───────────────────────────────────────────── */
const DB_CONFIG: Record<string, { color: string; label: string }> = {
  postgres: { color: "bg-blue-500/10 text-blue-400 border-blue-500/20",     label: "PostgreSQL" },
  mysql:    { color: "bg-orange-500/10 text-orange-400 border-orange-500/20", label: "MySQL"    },
  redis:    { color: "bg-red-500/10 text-red-400 border-red-500/20",         label: "Redis"     },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.stopped;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border", cfg.pill)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function DbBadge({ type, version }: { type: string; version: string }) {
  const cfg = DB_CONFIG[type.toLowerCase()] ?? { color: "bg-surface-200 text-fg-muted border-surface-border", label: type.toUpperCase() };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border", cfg.color)}>
      {cfg.label} {version}
    </span>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────── */
function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-lg bg-surface-100 animate-pulse", className)} />;
}

export default function OverviewPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  return isAdmin ? <AdminOverview /> : <SubscriberOverview />;
}

/* ══════════════════════════════════════════════════════════════
   ADMIN OVERVIEW — cluster management interface
══════════════════════════════════════════════════════════════ */
function AdminOverview() {
  const { data: clusters = [], isLoading } = useClusters();
  const { setCreateModalOpen } = useUIStore();

  const stats = {
    total:      clusters.length,
    running:    clusters.filter((c: ClusterListItem) => c.status === "running").length,
    stopped:    clusters.filter((c: ClusterListItem) => c.status === "stopped").length,
    error:      clusters.filter((c: ClusterListItem) => c.status === "error").length,
  };

  const allHealthy = !isLoading && stats.error === 0 && stats.total > 0;
  const hasError   = stats.error > 0;

  return (
    <div className="min-h-full bg-[var(--bg)]">
      <Topbar title="Overview" subtitle="PocketDB" />

      <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border border-brand-500/20 bg-surface-50 p-6 md:p-8">
          {/* Brand-tinted gradient overlay — soft enough for all 3 themes */}
          <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-transparent pointer-events-none" />
          {/* Glow layer */}
          <div className="absolute inset-0 bg-hero-glow opacity-50 pointer-events-none" />
          {/* Decorative grid */}
          <div className="absolute inset-0 opacity-[0.035] pointer-events-none"
            style={{ backgroundImage: "linear-gradient(var(--text-muted) 1px,transparent 1px),linear-gradient(90deg,var(--text-muted) 1px,transparent 1px)", backgroundSize: "32px 32px" }} />

          {/* Content */}
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-brand-500 uppercase tracking-widest mb-2">
                Database Infrastructure
              </p>
              <h2 className="text-2xl md:text-3xl font-bold text-fg-strong mb-2 leading-tight">
                Manage your database clusters
              </h2>
              <p className="text-sm text-fg-muted mb-5 max-w-lg">
                Spin up, monitor, and manage Docker-powered PostgreSQL, MySQL, and Redis clusters with ease.
              </p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setCreateModalOpen(true)} className="btn-primary">
                  <FontAwesomeIcon icon={faPlus} />
                  New Cluster
                </button>
                <Link href="/dashboard/clusters" className="btn-secondary">
                  View Clusters
                  <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
                </Link>
              </div>
            </div>

            {/* Decorative icon stack */}
            <div className="hidden md:flex items-center gap-3 shrink-0">
              {[faDatabase, faCodeBranch, faServer].map((icon, i) => (
                <div key={i}
                  className="w-14 h-14 rounded-2xl border border-brand-500/20 bg-brand-500/10 flex items-center justify-center"
                  style={{ transform: `rotate(${[-6, 0, 6][i]}deg) translateY(${[4, 0, 4][i]}px)` }}
                >
                  <FontAwesomeIcon icon={icon} className="text-2xl text-brand-400/70" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── System status strip ─────────────────────────────── */}
        {!isLoading && stats.total > 0 && (
          <div className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm",
            hasError
              ? "bg-red-500/8 border-red-500/25 text-red-400"
              : "bg-green-500/8 border-green-500/20 text-green-500"
          )}>
            <FontAwesomeIcon
              icon={hasError ? faCircleExclamation : faCheckCircle}
              className="text-base shrink-0"
            />
            <span className="font-medium">
              {hasError
                ? `${stats.error} cluster${stats.error > 1 ? "s" : ""} in error state`
                : "All systems operational"}
            </span>
            {hasError && (
              <Link href="/dashboard/clusters" className="ml-auto text-xs font-semibold hover:underline">
                View details →
              </Link>
            )}
            {!hasError && (
              <span className="ml-auto text-xs text-green-500/70">
                {stats.running} of {stats.total} running
              </span>
            )}
          </div>
        )}

        {/* ── Stat cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Total Clusters", value: stats.total,
              icon: faLayerGroup, iconColor: "text-brand-500",
              iconBg: "bg-brand-500/12", border: "border-surface-border",
              accent: "before:bg-brand-500",
            },
            {
              label: "Running", value: stats.running,
              icon: faCircleCheck, iconColor: "text-green-500",
              iconBg: "bg-green-500/12", border: "border-surface-border",
              accent: "before:bg-green-500",
            },
            {
              label: "Stopped", value: stats.stopped,
              icon: faChartLine, iconColor: "text-fg-muted",
              iconBg: "bg-surface-200", border: "border-surface-border",
              accent: "before:bg-surface-200",
            },
            {
              label: "Errors", value: stats.error,
              icon: faServer, iconColor: "text-red-400",
              iconBg: "bg-red-500/12", border: "border-surface-border",
              accent: "before:bg-red-500",
            },
          ].map((s) => (
            <div key={s.label}
              className={cn(
                "relative bg-surface-50 rounded-2xl p-5 border flex flex-col gap-4",
                "overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10",
                s.border,
                // top accent line via pseudo
                `before:absolute before:top-0 before:left-4 before:right-4 before:h-[2px] before:rounded-b-full ${s.accent}`
              )}
            >
              <div className="flex items-start justify-between">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", s.iconBg)}>
                  <FontAwesomeIcon icon={s.icon} className={cn("text-base", s.iconColor)} />
                </div>
              </div>
              <div>
                {isLoading
                  ? <Skeleton className="h-8 w-12 mb-1.5" />
                  : <p className="text-3xl font-bold text-fg-strong leading-none tabular-nums">{s.value}</p>
                }
                <p className="text-xs text-fg-muted mt-1.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main two-column ──────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Recent Clusters — 2/3 width */}
          <div className="xl:col-span-2 bg-surface-50 rounded-2xl border border-surface-border overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-brand-500/12 flex items-center justify-center">
                  <FontAwesomeIcon icon={faLayerGroup} className="text-xs text-brand-500" />
                </div>
                <h3 className="text-sm font-semibold text-fg-strong">Recent Clusters</h3>
              </div>
              <Link
                href="/dashboard/clusters"
                className="text-xs text-brand-500 hover:text-brand-400 font-medium flex items-center gap-1 transition-colors"
              >
                View all
                <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
              </Link>
            </div>

            {/* Body */}
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-surface-border">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-2.5 w-20 hidden sm:block" />
                  </div>
                ))}
              </div>
            ) : clusters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
                  <FontAwesomeIcon icon={faDatabase} className="text-2xl text-fg-subtle" />
                </div>
                <p className="text-sm font-medium text-fg-strong mb-1">No clusters yet</p>
                <p className="text-xs text-fg-muted mb-5 max-w-xs">
                  Create your first cluster to start managing databases.
                </p>
                <button onClick={() => setCreateModalOpen(true)} className="btn-primary">
                  <FontAwesomeIcon icon={faPlus} />
                  Create your first cluster
                </button>
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {clusters.slice(0, 6).map((c: ClusterListItem) => (
                  <Link
                    key={c.id}
                    href={`/dashboard/clusters/${c.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-100/60 transition-colors group"
                  >
                    {/* DB icon */}
                    <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/15 flex items-center justify-center shrink-0">
                      <FontAwesomeIcon icon={faDatabase} className="text-brand-500 text-xs" />
                    </div>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fg-strong truncate group-hover:text-brand-400 transition-colors">
                        {c.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <DbBadge type={c.db_type} version={c.db_version} />
                        <span className="text-xs text-fg-subtle">
                          {c.node_count} node{c.node_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    <StatusPill status={c.status} />

                    {/* Time */}
                    <span className="hidden sm:block text-xs text-fg-subtle shrink-0 min-w-[90px] text-right">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Right column: Quick Actions + Stats breakdown */}
          <div className="flex flex-col gap-5">

            {/* Quick Actions */}
            <div className="bg-surface-50 rounded-2xl border border-surface-border overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-brand-500/12 flex items-center justify-center">
                    <FontAwesomeIcon icon={faBolt} className="text-xs text-brand-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-fg-strong">Quick Actions</h3>
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                {[
                  { icon: faPlus,         label: "New Cluster",     sub: "Spin up a new database", onClick: () => setCreateModalOpen(true), href: null },
                  { icon: faLayerGroup,   label: "All Clusters",    sub: "Browse your clusters",   onClick: null, href: "/dashboard/clusters"     },
                  { icon: faChartLine,    label: "Query Editor",    sub: "Run SQL queries",        onClick: null, href: "/dashboard/query-editor" },
                ].map((a) => {
                  const inner = (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-100 transition-colors cursor-pointer group">
                      <div className="w-8 h-8 rounded-lg bg-surface-100 group-hover:bg-brand-500/12 border border-surface-border flex items-center justify-center shrink-0 transition-colors">
                        <FontAwesomeIcon icon={a.icon} className="text-xs text-fg-muted group-hover:text-brand-500 transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-fg-strong">{a.label}</p>
                        <p className="text-xs text-fg-subtle truncate">{a.sub}</p>
                      </div>
                      <FontAwesomeIcon icon={faArrowRight} className="ml-auto text-xs text-fg-subtle group-hover:text-brand-500 transition-colors shrink-0" />
                    </div>
                  );
                  return a.onClick
                    ? <button key={a.label} onClick={a.onClick} className="w-full text-left">{inner}</button>
                    : <Link key={a.label} href={a.href!}>{inner}</Link>;
                })}
              </div>
            </div>

            {/* Cluster breakdown by DB type */}
            {clusters.length > 0 && (
              <div className="bg-surface-50 rounded-2xl border border-surface-border overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-border">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-brand-500/12 flex items-center justify-center">
                      <FontAwesomeIcon icon={faDatabase} className="text-xs text-brand-500" />
                    </div>
                    <h3 className="text-sm font-semibold text-fg-strong">By Engine</h3>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {(["postgres", "mysql", "redis"] as const).map((type) => {
                    const count = clusters.filter((c: ClusterListItem) => c.db_type.toLowerCase() === type).length;
                    if (count === 0) return null;
                    const pct = Math.round((count / stats.total) * 100);
                    const cfg = DB_CONFIG[type];
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-md border", cfg.color)}>
                            {cfg.label}
                          </span>
                          <span className="text-xs text-fg-muted">{count} cluster{count !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-500 transition-all duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SUBSCRIBER OVERVIEW — database-focused interface
══════════════════════════════════════════════════════════════ */
const DB_CONFIG_SUB: Record<string, { color: string; label: string; dot: string }> = {
  postgres: { color: "bg-blue-500/10 text-blue-400 border-blue-500/20",     label: "PostgreSQL", dot: "bg-blue-400" },
  mysql:    { color: "bg-orange-500/10 text-orange-400 border-orange-500/20", label: "MySQL",    dot: "bg-orange-400" },
};

function SubscriberOverview() {
  const { data: databases = [], isLoading } = useUserDatabases();
  const user = useAuthStore((s) => s.user);

  const pgCount    = (databases as UserDatabase[]).filter((d) => d.db_type === "postgres").length;
  const myCount    = (databases as UserDatabase[]).filter((d) => d.db_type === "mysql").length;
  const totalCount = (databases as UserDatabase[]).length;

  return (
    <div className="min-h-full bg-[var(--bg)]">
      <Topbar title="Overview" subtitle="PocketDB" />

      <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-brand-500/20 bg-surface-50 p-6 md:p-8">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-hero-glow opacity-50 pointer-events-none" />
          <div className="absolute inset-0 opacity-[0.035] pointer-events-none"
            style={{ backgroundImage: "linear-gradient(var(--text-muted) 1px,transparent 1px),linear-gradient(90deg,var(--text-muted) 1px,transparent 1px)", backgroundSize: "32px 32px" }} />

          <div className="relative flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-brand-500 uppercase tracking-widest mb-2">
                Your Workspace
              </p>
              <h2 className="text-2xl md:text-3xl font-bold text-fg-strong mb-2 leading-tight">
                Manage your databases
              </h2>
              <p className="text-sm text-fg-muted mb-5 max-w-lg">
                Provision PostgreSQL and MySQL databases instantly. Your connection credentials are generated and ready to use.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/dashboard/databases" className="btn-primary">
                  <FontAwesomeIcon icon={faPlus} />
                  New Database
                </Link>
                <Link href="/dashboard/databases" className="btn-secondary">
                  My Databases
                  <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
                </Link>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-3 shrink-0">
              {[faDatabase, faKey, faTable].map((icon, i) => (
                <div key={i}
                  className="w-14 h-14 rounded-2xl border border-brand-500/20 bg-brand-500/10 flex items-center justify-center"
                  style={{ transform: `rotate(${[-6, 0, 6][i]}deg) translateY(${[4, 0, 4][i]}px)` }}
                >
                  <FontAwesomeIcon icon={icon} className="text-2xl text-brand-400/70" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total Databases", value: totalCount, icon: faDatabase,     iconColor: "text-brand-500", iconBg: "bg-brand-500/12",  accent: "before:bg-brand-500"  },
            { label: "PostgreSQL",      value: pgCount,    icon: faServer,       iconColor: "text-blue-400",  iconBg: "bg-blue-500/12",   accent: "before:bg-blue-400"   },
            { label: "MySQL",           value: myCount,    icon: faLayerGroup,   iconColor: "text-orange-400",iconBg: "bg-orange-500/12", accent: "before:bg-orange-400" },
          ].map((s) => (
            <div key={s.label}
              className={cn(
                "relative bg-surface-50 rounded-2xl p-5 border border-surface-border flex flex-col gap-4",
                "overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10",
                `before:absolute before:top-0 before:left-4 before:right-4 before:h-[2px] before:rounded-b-full ${s.accent}`
              )}
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", s.iconBg)}>
                <FontAwesomeIcon icon={s.icon} className={cn("text-base", s.iconColor)} />
              </div>
              <div>
                {isLoading
                  ? <Skeleton className="h-8 w-12 mb-1.5" />
                  : <p className="text-3xl font-bold text-fg-strong leading-none tabular-nums">{s.value}</p>
                }
                <p className="text-xs text-fg-muted mt-1.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Recent Databases */}
          <div className="xl:col-span-2 bg-surface-50 rounded-2xl border border-surface-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-brand-500/12 flex items-center justify-center">
                  <FontAwesomeIcon icon={faDatabase} className="text-xs text-brand-500" />
                </div>
                <h3 className="text-sm font-semibold text-fg-strong">Recent Databases</h3>
              </div>
              <Link href="/dashboard/databases" className="text-xs text-brand-500 hover:text-brand-400 font-medium flex items-center gap-1 transition-colors">
                View all
                <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
              </Link>
            </div>

            {isLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-surface-border">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                    <Skeleton className="h-5 w-24 rounded-full" />
                    <Skeleton className="h-2.5 w-20 hidden sm:block" />
                  </div>
                ))}
              </div>
            ) : (databases as UserDatabase[]).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
                  <FontAwesomeIcon icon={faDatabase} className="text-2xl text-fg-subtle" />
                </div>
                <p className="text-sm font-medium text-fg-strong mb-1">No databases yet</p>
                <p className="text-xs text-fg-muted mb-5 max-w-xs">
                  Create your first database to get started.
                </p>
                <Link href="/dashboard/databases" className="btn-primary">
                  <FontAwesomeIcon icon={faPlus} />
                  Create your first database
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {(databases as UserDatabase[]).slice(0, 6).map((d) => {
                  const cfg = DB_CONFIG_SUB[d.db_type] ?? DB_CONFIG_SUB.postgres;
                  return (
                    <Link key={d.id} href="/dashboard/databases"
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-100/60 transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/15 flex items-center justify-center shrink-0">
                        <FontAwesomeIcon icon={faDatabase} className="text-brand-500 text-xs" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-fg-strong truncate group-hover:text-brand-400 transition-colors">
                          {d.database_name}
                        </p>
                        <p className="text-xs text-fg-subtle mt-0.5">{d.host}:{d.port}</p>
                      </div>
                      <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border", cfg.color)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />
                        {cfg.label}
                      </span>
                      <span className="hidden sm:block text-xs text-fg-subtle shrink-0 min-w-[90px] text-right">
                        {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex flex-col gap-5">
            <div className="bg-surface-50 rounded-2xl border border-surface-border overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-brand-500/12 flex items-center justify-center">
                    <FontAwesomeIcon icon={faBolt} className="text-xs text-brand-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-fg-strong">Quick Actions</h3>
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                {[
                  { icon: faPlus,      label: "New Database",  sub: "Provision a new database",  href: "/dashboard/databases"      },
                  { icon: faDatabase,  label: "My Databases",  sub: "View all your databases",    href: "/dashboard/databases"      },
                  { icon: faChartLine, label: "Query Editor",  sub: "Run SQL queries",            href: "/dashboard/query-editor"   },
                  { icon: faUser,      label: "Settings",      sub: "Manage your account",        href: "/dashboard/settings"       },
                ].map((a) => (
                  <Link key={a.label} href={a.href}>
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-100 transition-colors cursor-pointer group">
                      <div className="w-8 h-8 rounded-lg bg-surface-100 group-hover:bg-brand-500/12 border border-surface-border flex items-center justify-center shrink-0 transition-colors">
                        <FontAwesomeIcon icon={a.icon} className="text-xs text-fg-muted group-hover:text-brand-500 transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-fg-strong">{a.label}</p>
                        <p className="text-xs text-fg-subtle truncate">{a.sub}</p>
                      </div>
                      <FontAwesomeIcon icon={faArrowRight} className="ml-auto text-xs text-fg-subtle group-hover:text-brand-500 transition-colors shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Account info */}
            <div className="bg-surface-50 rounded-2xl border border-surface-border p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faUser} className="text-brand-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg-strong truncate">{user?.email ?? "—"}</p>
                  <p className="text-xs text-fg-subtle capitalize">{user?.role ?? "subscriber"}</p>
                </div>
              </div>
              <div className="text-xs text-fg-subtle leading-relaxed">
                You can create databases on managed clusters. Contact an admin to change your role or request infrastructure changes.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
