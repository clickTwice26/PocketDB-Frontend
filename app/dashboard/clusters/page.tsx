"use client";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus, faSearch, faFilter, faDatabase,
  faSpinner, faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import { useClusters } from "@/hooks/useClusters";
import ClusterCard from "@/components/clusters/ClusterCard";
import Topbar from "@/components/layout/Topbar";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import type { ClusterListItem } from "@/types";
import clsx from "clsx";

const STATUS_FILTERS = ["all", "running", "stopped", "error", "creating"];

export default function ClustersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { data: clusters = [], isLoading, error } = useClusters();
  const { setCreateModalOpen } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const filtered = clusters.filter((c: ClusterListItem) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="min-h-full">
      <Topbar
        title="Clusters"
        subtitle={`${clusters.length} total · ${clusters.filter((c: ClusterListItem) => c.status === "running").length} running`}
      />

      <div className="p-4 md:p-6 space-y-5">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm"
            />
            <input
              className="input pl-9"
              placeholder="Search clusters..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={clsx(
                  "px-3 py-2 rounded-lg text-xs font-medium capitalize transition-all border",
                  statusFilter === s
                    ? "bg-brand-600/20 text-brand-300 border-brand-500/40"
                    : "bg-surface-100 text-slate-400 border-surface-border hover:text-white"
                )}
              >
                {s}
                {s !== "all" && (
                  <span className="ml-1.5 opacity-60">
                    ({clusters.filter((c: ClusterListItem) => c.status === s).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          <button onClick={() => setCreateModalOpen(true)} className="btn-primary shrink-0" style={isAdmin ? undefined : { display: "none" }}>
            <FontAwesomeIcon icon={faPlus} />
            New Cluster
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <FontAwesomeIcon icon={faSpinner} className="text-3xl text-brand-400 animate-spin" />
            <p className="text-sm text-slate-400">Loading clusters...</p>
          </div>
        ) : error ? (
          <div className="card text-center py-12">
            <p className="text-red-400">Failed to load clusters. Is the API running?</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-16 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 border border-surface-border flex items-center justify-center">
              <FontAwesomeIcon icon={faLayerGroup} className="text-2xl text-slate-500" />
            </div>
            <div>
              <p className="text-white font-medium mb-1">
                {search || statusFilter !== "all" ? "No matching clusters" : "No clusters yet"}
              </p>
              <p className="text-sm text-slate-500">
                {search || statusFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : "Create your first PostgreSQL cluster to get started."}
              </p>
            </div>
            {!search && statusFilter === "all" && (
              <button onClick={() => setCreateModalOpen(true)} className="btn-primary">
                <FontAwesomeIcon icon={faPlus} />
                Create Cluster
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((cluster: ClusterListItem) => (
              <ClusterCard key={cluster.id} cluster={cluster} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
