"use client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faPlus, faCheck, faMoon, faSun, faBars, faLeaf } from "@fortawesome/free-solid-svg-icons";
import { useUIStore } from "@/store/ui";
import type { Theme } from "@/store/ui";
import { useClusters } from "@/hooks/useClusters";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

interface TopbarProps {
  title: string;
  subtitle?: string;
}

const THEMES: { id: Theme; label: string; icon: typeof faMoon; accentDot: string; previewBg: string }[] = [
  { id: "dark",  label: "Dark",  icon: faMoon, accentDot: "bg-indigo-500",  previewBg: "#1a1d27" },
  { id: "light", label: "Light", icon: faSun,  accentDot: "bg-sky-500",     previewBg: "#f0f4fb" },
  { id: "diu",   label: "DIU",   icon: faLeaf, accentDot: "bg-emerald-500", previewBg: "#0f1912" },
];

export default function Topbar({ title, subtitle }: TopbarProps) {
  const { setCreateModalOpen, theme, setTheme, sidebarOpen, setSidebarOpen } = useUIStore();
  const { data: clusters = [] } = useClusters();
  const runningCount = clusters.filter((c: { status: string }) => c.status === "running").length;

  const [themeOpen, setThemeOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const handleThemeToggle = () => {
    if (!themeOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setThemeOpen((v) => !v);
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setThemeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeThemeConfig = THEMES.find((t) => t.id === theme)!;

  const themeDropdown = themeOpen && mounted ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[9999] animate-slide-up"
      style={{ top: dropdownPos.top, right: dropdownPos.right }}
    >
      <div className="bg-surface-50 border border-surface-border rounded-xl shadow-2xl shadow-black/30 p-3 w-52">
        <p className="text-2xs font-semibold text-slate-500 uppercase tracking-widest mb-2 px-1">
          Theme
        </p>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id); setThemeOpen(false); }}
                title={t.label}
                className={clsx(
                  "flex flex-col items-center gap-2 py-2.5 px-1 rounded-lg border transition-all duration-150",
                  active
                    ? "border-surface-200 bg-surface-100"
                    : "border-transparent hover:bg-surface-100/60"
                )}
              >
                {/* Mini theme preview */}
                <div
                  className="w-8 h-5 rounded-md border border-white/10 flex items-end justify-end p-0.5"
                  style={{ backgroundColor: t.previewBg }}
                >
                  <div className={clsx("w-2 h-2 rounded-full", t.accentDot)} />
                </div>
                <span className="text-xs font-medium text-[rgb(var(--text-muted))]">
                  {t.label}
                </span>
                {active && <FontAwesomeIcon icon={faCheck} className="text-brand-400 text-2xs" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <header className="h-16 border-b border-surface-border flex items-center justify-between px-4 md:px-6 bg-surface-50/50 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger — toggles sidebar drawer */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-surface-100 transition-colors"
          aria-label="Toggle menu"
        >
          <FontAwesomeIcon icon={faBars} className="text-sm" />
        </button>
        <div>
          <h1 className="text-base md:text-lg font-semibold text-white leading-tight">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400 hidden sm:block">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Running indicator */}
        <div className="hidden md:flex items-center gap-2 bg-surface-100 border border-surface-border rounded-lg px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-slate-300">
            {runningCount} cluster{runningCount !== 1 ? "s" : ""} running
          </span>
        </div>

        {/* Theme picker */}
        <div>
          <button
            ref={buttonRef}
            onClick={handleThemeToggle}
            title="Change theme"
            className={clsx(
              "relative w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-150",
              themeOpen
                ? "bg-surface-200 border-brand-500/50 text-white"
                : "bg-surface-100 border-surface-border text-slate-400 hover:text-white hover:border-brand-500/30"
            )}
          >
            <span
              className={clsx(
                "absolute top-1.5 right-1.5 w-2 h-2 rounded-full",
                activeThemeConfig.accentDot
              )}
            />
            <FontAwesomeIcon icon={activeThemeConfig.icon} className="text-sm" />
          </button>
          {themeDropdown}
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
          <span className="hidden sm:inline">New Cluster</span>
        </button>
      </div>
    </header>
  );
}


