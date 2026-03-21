"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDatabase,
  faServer,
  faChartLine,
  faCode,
  faCog,
  faChevronLeft,
  faLayerGroup,
  faCircleNodes,
} from "@fortawesome/free-solid-svg-icons";
import { useUIStore } from "@/store/ui";
import clsx from "clsx";

const NAV_ITEMS = [
  {
    href: "/dashboard/overview",
    icon: faChartLine,
    label: "Overview",
  },
  {
    href: "/dashboard/clusters",
    icon: faLayerGroup,
    label: "Clusters",
  },
  {
    href: "/dashboard/nodes",
    icon: faCircleNodes,
    label: "Nodes",
  },
  {
    href: "/dashboard/query-editor",
    icon: faCode,
    label: "Query Editor",
  },
  {
    href: "/dashboard/settings",
    icon: faCog,
    label: "Settings",
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useUIStore();

  return (
    <aside
      className={clsx(
        "h-screen bg-surface-50 border-r border-surface-border flex flex-col transition-all duration-300 shrink-0",
        sidebarOpen ? "w-64" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-surface-border">
        {sidebarOpen && (
          <Link href="/dashboard/overview" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <FontAwesomeIcon icon={faDatabase} className="text-white text-sm" />
            </div>
            <span className="font-bold text-white text-sm tracking-wide">
              PocketDB
            </span>
          </Link>
        )}
        {!sidebarOpen && (
          <div className="mx-auto w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <FontAwesomeIcon icon={faDatabase} className="text-white text-sm" />
          </div>
        )}
        {sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group",
                active
                  ? "bg-brand-600/20 text-brand-400 border border-brand-600/30"
                  : "text-slate-400 hover:text-white hover:bg-surface-100"
              )}
            >
              <FontAwesomeIcon
                icon={item.icon}
                className={clsx(
                  "text-sm shrink-0",
                  active ? "text-brand-400" : "text-slate-400 group-hover:text-white"
                )}
              />
              {sidebarOpen && (
                <span className="text-sm font-medium truncate">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom expand btn */}
      {!sidebarOpen && (
        <div className="p-2 border-t border-surface-border">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-full flex justify-center items-center p-2 rounded-lg text-slate-400 hover:text-white hover:bg-surface-100 transition-all"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="rotate-180 text-xs" />
          </button>
        </div>
      )}

      {/* Version */}
      {sidebarOpen && (
        <div className="p-4 border-t border-surface-border">
          <p className="text-xs text-slate-600">v1.0.0</p>
        </div>
      )}
    </aside>
  );
}
