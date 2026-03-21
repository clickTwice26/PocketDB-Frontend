"use client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCog, faInfoCircle, faPalette, faCheck, faMoon, faSun, faLeaf } from "@fortawesome/free-solid-svg-icons";
import Topbar from "@/components/layout/Topbar";
import { useUIStore } from "@/store/ui";
import type { Theme } from "@/store/ui";
import clsx from "clsx";

const THEMES: { id: Theme; label: string; desc: string; icon: typeof faMoon; accentDot: string; previewBg: string }[] = [
  { id: "dark",  label: "Dark",  desc: "Indigo accent · Dark navy",    icon: faMoon, accentDot: "bg-indigo-500",  previewBg: "#1a1d27" },
  { id: "light", label: "Light", desc: "Sky accent · Light surfaces",  icon: faSun,  accentDot: "bg-sky-500",     previewBg: "#f0f4fb" },
  { id: "diu",   label: "DIU",   desc: "Emerald accent · Forest dark", icon: faLeaf, accentDot: "bg-emerald-500", previewBg: "#0f1912" },
];

export default function SettingsPage() {
  const { theme, setTheme } = useUIStore();

  return (
    <div className="min-h-full">
      <Topbar title="Settings" subtitle="App configuration & preferences" />

      <div className="p-4 md:p-6 space-y-5 max-w-2xl">

        {/* Appearance */}
        <div className="card space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-0.5">
              <FontAwesomeIcon icon={faPalette} className="text-brand-400" />
              Appearance
            </h3>
            <p className="text-xs text-slate-500 ml-5">
              Choose a theme. Each comes with its own curated accent color.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {THEMES.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={clsx(
                    "relative text-left rounded-xl border-2 overflow-hidden transition-all duration-200 focus:outline-none",
                    active
                      ? "border-brand-500/60 shadow-lg shadow-brand-500/10"
                      : "border-surface-border hover:border-surface-200"
                  )}
                  aria-label={`Switch to ${t.label} theme`}
                >
                  {/* Preview strip */}
                  <div
                    className="h-20 w-full relative overflow-hidden"
                    style={{ backgroundColor: t.previewBg }}
                  >
                    {/* Dot grid decoration */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
                        backgroundSize: "14px 14px",
                      }}
                    />
                    {/* Accent swatch dots */}
                    <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
                      <div className={clsx("w-5 h-5 rounded-full shadow-md", t.accentDot)} />
                      <div className={clsx("w-3 h-3 rounded-full opacity-50", t.accentDot)} />
                    </div>
                    {/* Active indicator */}
                    {active && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center shadow">
                        <FontAwesomeIcon icon={faCheck} className="text-white text-2xs" />
                      </div>
                    )}
                  </div>
                  {/* Info row */}
                  <div className="px-3 py-2.5 bg-surface-100">
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon
                        icon={t.icon}
                        className={clsx("text-sm shrink-0", active ? "text-brand-400" : "text-slate-400")}
                      />
                      <div className="min-w-0">
                        <p className={clsx("text-sm font-semibold leading-tight", active ? "text-[rgb(var(--text))]" : "text-[rgb(var(--text-muted))]")}
                        >
                          {t.label}
                        </p>
                        <p className="text-2xs text-slate-500 truncate mt-0.5">{t.desc}</p>
                      </div>
                    </div>
                  </div>
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
