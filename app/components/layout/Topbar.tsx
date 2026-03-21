"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell, faPlus, faMoon, faSun, faBars, faLeaf, faCheck, faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import { useUIStore } from "@/store/ui";
import type { Theme } from "@/store/ui";
import { useClusters } from "@/hooks/useClusters";
import { cn } from "@/lib/utils";

interface TopbarProps {
  title: string;
  subtitle?: string;
}

const THEMES: { id: Theme; label: string; icon: typeof faMoon; desc: string }[] = [
  { id: "dark",  label: "Dark",  icon: faMoon, desc: "Indigo dark"  },
  { id: "light", label: "Light", icon: faSun,  desc: "Sky light"    },
  { id: "diu",   label: "DIU",   icon: faLeaf, desc: "Emerald dark" },
];

export default function Topbar({ title, subtitle }: TopbarProps) {
  const { setCreateModalOpen, theme, setTheme, setMobileNavOpen } = useUIStore();
  const { data: clusters = [] } = useClusters();
  const runningCount = clusters.filter((c: { status: string }) => c.status === "running").length;

  const activeTheme = THEMES.find((t) => t.id === theme)!;
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Compute panel position from trigger's bounding rect
  const openDropdown = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
      minWidth: Math.max(rect.width, 160),
      zIndex: 9999,
    });
    setOpen(true);
  }, []);

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onScroll() { setOpen(false); }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <header className="h-16 border-b border-surface-border flex items-center justify-between px-4 md:px-6 bg-surface-50/50 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileNavOpen(true)}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-surface-100 transition-colors"
          aria-label="Open menu"
        >
          <FontAwesomeIcon icon={faBars} className="text-sm" />
        </button>
        <div>
          <h1 className="text-base md:text-lg font-semibold text-strong leading-tight">{title}</h1>
          {subtitle && <p className="text-xs text-muted-token hidden sm:block">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Running indicator */}
        <div className="hidden md:flex items-center gap-2 bg-surface-100 border border-surface-border rounded-lg px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-slate-300">
            {runningCount} cluster{runningCount !== 1 ? "s" : ""} running
          </span>
        </div>

        {/* ── Theme dropdown trigger ──────────────────────── */}
        <button
          ref={triggerRef}
          onClick={() => (open ? setOpen(false) : openDropdown())}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-lg border text-xs font-medium",
            "bg-surface-100 border-surface-border text-slate-300",
            "hover:border-brand-500/40 hover:text-white",
            "focus:outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/30",
            "transition-all duration-150 cursor-pointer",
            open && "border-brand-500/60 ring-1 ring-brand-500/30"
          )}
        >
          <FontAwesomeIcon icon={activeTheme.icon} className="text-xs text-muted-token w-3" />
          <span className="hidden sm:inline">{activeTheme.label}</span>
          <FontAwesomeIcon
            icon={faChevronDown}
            className={cn(
              "text-[10px] text-muted-token transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>

        {/* ── Theme dropdown panel — portal, bypasses overflow ── */}
        {mounted && open && createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label="Select theme"
            style={dropdownStyle}
            className={cn(
              "bg-surface-50 border border-surface-border rounded-xl shadow-2xl",
              "py-1.5 overflow-hidden animate-slide-up"
            )}
          >
            <p className="px-3 pt-0.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-token select-none">
              Appearance
            </p>
            <div className="h-px bg-surface-border mx-3 mb-1" />

            {THEMES.map((t) => {
              const isActive = t.id === theme;
              return (
                <button
                  key={t.id}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => { setTheme(t.id); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 text-xs transition-colors duration-100 cursor-pointer",
                    isActive
                      ? "bg-brand-500/10 text-white"
                      : "text-slate-300 hover:bg-surface-100 hover:text-white"
                  )}
                >
                  <span className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[11px]",
                    isActive ? "bg-brand-500/20 text-brand-400" : "bg-surface-200 text-muted-token"
                  )}>
                    <FontAwesomeIcon icon={t.icon} />
                  </span>
                  <span className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                    <span className={cn("font-medium", isActive && "text-brand-300")}>{t.label}</span>
                    <span className="text-[10px] text-muted-token">{t.desc}</span>
                  </span>
                  {isActive && (
                    <FontAwesomeIcon icon={faCheck} className="text-brand-400 text-[10px] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
        {/* ─────────────────────────────────────────────────── */}

        {/* Notifications */}
        <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-100 border border-surface-border text-slate-400 hover:text-white hover:border-brand-500/30 transition-all duration-150">
          <FontAwesomeIcon icon={faBell} className="text-sm" />
        </button>

        {/* Create cluster */}
        <button
          onClick={() => setCreateModalOpen(true)}
          className="btn-primary text-sm"
        >
          <FontAwesomeIcon icon={faPlus} />
          <span className="hidden sm:inline">New Cluster</span>
        </button>
      </div>
    </header>
  );
}


