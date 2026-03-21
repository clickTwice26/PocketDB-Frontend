"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faDatabase,
  faLayerGroup,
  faCircleNodes,
  faCode,
  faCog,
  faChartLine,
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { useUIStore } from "@/store/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/* ─── Navigation definition ──────────────────────────────────── */
const NAV_ITEMS: { href: string; icon: IconDefinition; label: string }[] = [
  { href: "/dashboard/overview",     icon: faChartLine,   label: "Overview"     },
  { href: "/dashboard/clusters",     icon: faLayerGroup,  label: "Clusters"     },
  { href: "/dashboard/nodes",        icon: faCircleNodes, label: "Nodes"        },
  { href: "/dashboard/query-editor", icon: faCode,        label: "Query Editor" },
  { href: "/dashboard/settings",     icon: faCog,         label: "Settings"     },
];

/* ─── A single nav link ───────────────────────────────────────── */
function NavItem({
  href,
  icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  href: string;
  icon: IconDefinition;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const linkClass = cn(
    "flex items-center rounded-lg transition-all duration-150 group",
    collapsed
      ? "w-10 h-10 justify-center"
      : "gap-3 px-3 py-2.5 w-full",
    active
      ? "bg-brand-600/20 text-brand-400 border border-brand-600/30"
      : "text-slate-400 hover:text-white hover:bg-surface-100 border border-transparent"
  );

  const iconEl = (
    <FontAwesomeIcon
      icon={icon}
      className={cn(
        "shrink-0 text-sm",
        active ? "text-brand-400" : "group-hover:text-white"
      )}
    />
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          className={linkClass}
          render={<Link href={href} onClick={onClick} />}
        >
          {iconEl}
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link href={href} onClick={onClick} className={linkClass}>
      {iconEl}
      <span className="text-sm font-medium truncate">{label}</span>
    </Link>
  );
}

/* ─── Shared sidebar body ─────────────────────────────────────── */
function SidebarContent({
  collapsed,
  onNavClick,
}: {
  collapsed: boolean;
  onNavClick?: () => void;
}) {
  const pathname = usePathname();
  const { setSidebarOpen } = useUIStore();

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* ── Logo / Brand ── */}
      <div
        className={cn(
          "flex items-center h-16 border-b border-surface-border shrink-0",
          collapsed ? "justify-center" : "justify-between px-4"
        )}
      >
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Expand sidebar"
                  className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center hover:bg-brand-700 transition-colors focus:outline-none"
                />
              }
            >
              <FontAwesomeIcon icon={faDatabase} className="text-white text-sm" />
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              Expand sidebar
            </TooltipContent>
          </Tooltip>
        ) : (
          <>
            <Link
              href="/dashboard/overview"
              onClick={onNavClick}
              className="flex items-center gap-2.5 min-w-0 group"
            >
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0 group-hover:bg-brand-700 transition-colors">
                <FontAwesomeIcon icon={faDatabase} className="text-white text-sm" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-strong tracking-wide leading-none truncate">
                  PocketDB
                </p>
                <p className="text-2xs text-subtle leading-tight mt-0.5">
                  Database Manager
                </p>
              </div>
            </Link>

            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Collapse sidebar"
              className="w-7 h-7 shrink-0 ml-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-surface-100 transition-colors"
            >
              <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
            </button>
          </>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto py-4",
          collapsed ? "px-3 flex flex-col items-center gap-0.5" : "px-3 space-y-0.5"
        )}
      >
        {!collapsed && (
          <p className="text-2xs font-semibold text-subtle uppercase tracking-widest px-3 mb-3">
            Menu
          </p>
        )}
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            active={pathname.startsWith(item.href)}
            collapsed={collapsed}
            onClick={onNavClick}
          />
        ))}
      </nav>

      {/* ── Footer ── */}
      <Separator className="bg-surface-border shrink-0" />
      <div
        className={cn(
          "py-3 shrink-0",
          collapsed ? "flex justify-center" : "px-4"
        )}
      >
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="w-7 h-7 rounded-full bg-brand-600/15 border border-brand-600/25 flex items-center justify-center cursor-default" />
              }
            >
              <FontAwesomeIcon icon={faDatabase} className="text-brand-400 text-2xs" />
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              PocketDB v1.0.0
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-xs text-subtle">PocketDB</p>
            <span className="text-2xs font-medium text-subtle bg-surface-100 border border-surface-border rounded px-1.5 py-0.5">
              v1.0.0
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sidebar root — desktop aside + mobile Sheet ────────────── */
export default function Sidebar() {
  const { sidebarOpen, mobileNavOpen, setMobileNavOpen } = useUIStore();

  return (
    <>
      {/* Desktop: persistent left panel */}
      <aside
        className={cn(
          "hidden md:flex flex-col h-screen bg-surface-50 border-r border-surface-border",
          "transition-[width] duration-300 ease-in-out shrink-0 overflow-hidden",
          sidebarOpen ? "w-64" : "w-[4.5rem]"
        )}
      >
        <SidebarContent collapsed={!sidebarOpen} />
      </aside>

      {/* Mobile: Sheet drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-72 max-w-[80vw] p-0 bg-surface-50 border-r border-surface-border"
        >
          <SidebarContent
            collapsed={false}
            onNavClick={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
