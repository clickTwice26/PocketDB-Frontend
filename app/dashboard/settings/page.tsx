"use client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCog, faInfoCircle, faPalette, faCheck } from "@fortawesome/free-solid-svg-icons";
import Topbar from "@/components/layout/Topbar";
import { useUIStore } from "@/store/ui";
import type { AccentTheme } from "@/store/ui";
import clsx from "clsx";

const ACCENT_THEMES: {
  id: AccentTheme;
  label: string;
  /** Tailwind bg class using Tailwind built-in palette (not brand-*) */
  swatch: string;
  ring: string;
}[] = [
  { id: "indigo",  label: "Indigo",  swatch: "bg-indigo-500",  ring: "ring-indigo-500" },
  { id: "violet",  label: "Violet",  swatch: "bg-violet-500",  ring: "ring-violet-500" },
  { id: "sky",     label: "Sky",     swatch: "bg-sky-500",     ring: "ring-sky-500" },
  { id: "emerald", label: "Emerald", swatch: "bg-emerald-500", ring: "ring-emerald-500" },
  { id: "amber",   label: "Amber",   swatch: "bg-amber-500",   ring: "ring-amber-500" },
  { id: "rose",    label: "Rose",    swatch: "bg-rose-500",    ring: "ring-rose-500" },
];

export default function SettingsPage() {
  const { accent, setAccent } = useUIStore();

  return (
    <div className="min-h-full">
      <Topbar title="Settings" subtitle="App configuration & preferences" />

      <div className="p-6 space-y-5 max-w-2xl">

        {/* Accent Theme */}
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <FontAwesomeIcon icon={faPalette} className="text-brand-400" />
            Accent Color
          </h3>
          <p className="text-xs text-slate-500">
            Choose an accent color for the interface. Your preference is saved automatically.
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {ACCENT_THEMES.map((theme) => {
              const active = accent === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => setAccent(theme.id)}
                  className={clsx(
                    "group flex flex-col items-center gap-2 p-2 rounded-xl border transition-all duration-150",
                    active
                      ? "border-white/20 bg-white/5"
                      : "border-transparent hover:border-white/10 hover:bg-white/5"
                  )}
                  aria-label={`Set accent color to ${theme.label}`}
                >
                  <div
                    className={clsx(
                      "w-8 h-8 rounded-full flex items-center justify-center ring-2 ring-offset-2 ring-offset-[#1a1d27] transition-all duration-150",
                      theme.swatch,
                      active ? theme.ring : "ring-transparent"
                    )}
                  >
                    {active && (
                      <FontAwesomeIcon icon={faCheck} className="text-white text-xs" />
                    )}
                  </div>
                  <span className={clsx("text-[11px] font-medium", active ? "text-white" : "text-slate-500 group-hover:text-slate-300")}>
                    {theme.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* About */}
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <FontAwesomeIcon icon={faInfoCircle} className="text-brand-400" />
            About PocketDB
          </h3>
          <div className="space-y-2 text-sm text-slate-400">
            <div className="flex justify-between">
              <span>Version</span>
              <span className="text-white font-medium">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span>Stack</span>
              <span className="text-white font-medium">FastAPI · Next.js · PostgreSQL · Docker</span>
            </div>
            <div className="flex justify-between">
              <span>Frontend</span>
              <span className="text-white font-medium">Next.js · Tailwind CSS · React Query</span>
            </div>
            <div className="flex justify-between">
              <span>Backend</span>
              <span className="text-white font-medium">FastAPI · SQLAlchemy · asyncpg</span>
            </div>
          </div>
        </div>

        {/* Environment */}
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <FontAwesomeIcon icon={faCog} className="text-brand-400" />
            Environment
          </h3>
          <div className="space-y-2 text-sm text-slate-400">
            <div className="flex justify-between">
              <span>API URL</span>
              <code className="text-brand-300 font-mono text-xs">
                {process.env.NEXT_PUBLIC_API_URL ?? "/api/v1 (proxied)"}
              </code>
            </div>
            <div className="flex justify-between">
              <span>Docker Socket</span>
              <code className="text-brand-300 font-mono text-xs">unix:///var/run/docker.sock</code>
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-white">API Documentation</h3>
          <div className="flex gap-3">
            <a href="/api/docs" target="_blank" className="btn-primary text-sm">
              Swagger UI
            </a>
            <a href="/api/redoc" target="_blank" className="btn-secondary text-sm">
              ReDoc
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
