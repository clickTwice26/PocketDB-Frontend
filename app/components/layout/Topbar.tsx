"use client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faPlus, faSearch } from "@fortawesome/free-solid-svg-icons";
import { useUIStore } from "@/store/ui";
import { useClusters } from "@/hooks/useClusters";

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export default function Topbar({ title, subtitle }: TopbarProps) {
  const { setCreateModalOpen } = useUIStore();
  const { data: clusters = [] } = useClusters();
  const runningCount = clusters.filter((c: { status: string }) => c.status === "running").length;

  return (
    <header className="h-16 border-b border-surface-border flex items-center justify-between px-6 bg-surface-50/50 backdrop-blur-sm">
      <div>
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* Running indicator */}
        <div className="hidden md:flex items-center gap-2 bg-surface-100 border border-surface-border rounded-lg px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-slate-300">
            {runningCount} cluster{runningCount !== 1 ? "s" : ""} running
          </span>
        </div>

        {/* Notifications */}
        <button className="relative w-9 h-9 flex items-center justify-center rounded-lg bg-surface-100 border border-surface-border text-slate-400 hover:text-white transition-colors">
          <FontAwesomeIcon icon={faBell} className="text-sm" />
        </button>

        {/* Create cluster */}
        <button
          onClick={() => setCreateModalOpen(true)}
          className="btn-primary text-sm"
        >
          <FontAwesomeIcon icon={faPlus} />
          New Cluster
        </button>
      </div>
    </header>
  );
}
