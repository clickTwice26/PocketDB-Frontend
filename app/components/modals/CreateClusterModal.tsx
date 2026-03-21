"use client";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faDatabase,
  faKey,
  faSpinner,
  faCheckCircle,
} from "@fortawesome/free-solid-svg-icons";
import { useCreateCluster } from "@/hooks/useClusters";
import { useUIStore } from "@/store/ui";
import clsx from "clsx";

type DbType = "postgres" | "mysql" | "redis";

const ENGINES: { type: DbType; label: string; emoji: string; desc: string; color: string; bg: string; border: string }[] = [
  {
    type: "postgres",
    label: "PostgreSQL",
    emoji: "🐘",
    desc: "Powerful open-source relational database",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/50",
  },
  {
    type: "mysql",
    label: "MySQL",
    emoji: "🐬",
    desc: "World's most popular open-source database",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/50",
  },
  {
    type: "redis",
    label: "Redis",
    emoji: "⚡",
    desc: "Lightning-fast in-memory data store",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/50",
  },
];

const DEFAULT_PORTS: Record<DbType, number> = { postgres: 5433, mysql: 3307, redis: 6380 };
const DEFAULT_VERSIONS: Record<DbType, string> = { postgres: "16", mysql: "8.0", redis: "7" };

function makeForm(type: DbType) {
  return {
    db_type: type,
    db_version: DEFAULT_VERSIONS[type],
    db_user: type === "redis" ? "" : type === "mysql" ? "admin" : "postgres",
    db_name: type === "redis" ? "" : type === "mysql" ? "mydb" : "postgres",
    db_password: "",
    name: "",
    description: "",
    cluster_type: "standalone",
    node_count: 1,
    cpu_limit: "1",
    memory_limit: "128m",
    base_port: DEFAULT_PORTS[type],
    tags: {},
  };
}

export default function CreateClusterModal() {
  const { createModalOpen, setCreateModalOpen } = useUIStore();
  const { mutate: createCluster, isPending } = useCreateCluster();
  const [engine, setEngine] = useState<DbType>("postgres");
  const [form, setForm] = useState(makeForm("postgres"));
  const [showPassword, setShowPassword] = useState(false);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleEngineSelect = (type: DbType) => {
    setEngine(type);
    setForm(makeForm(type));
  };

  const isRedis = engine === "redis";
  const passwordOk = isRedis || (form.db_password.length >= 8);
  const canSubmit = form.name.trim().length >= 2 && passwordOk && !isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    createCluster(form, {
      onSuccess: () => {
        setCreateModalOpen(false);
        setEngine("postgres");
        setForm(makeForm("postgres"));
      },
    });
  };

  if (!createModalOpen) return null;

  const selectedEngine = ENGINES.find((e) => e.type === engine)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !isPending && setCreateModalOpen(false)}
      />

      {/* Modal */}
      <div className="relative bg-surface-50 border border-surface-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-slide-up">
        {/* Header */}
        <div className={clsx("px-6 py-5 border-b border-surface-border", selectedEngine.bg)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{selectedEngine.emoji}</span>
              <div>
                <h2 className="font-bold text-white text-lg">New {selectedEngine.label} Cluster</h2>
                <p className="text-xs text-slate-400">{selectedEngine.desc}</p>
              </div>
            </div>
            <button
              onClick={() => !isPending && setCreateModalOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-6 overflow-y-auto flex-1">
          {/* Engine selector */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Choose Engine</p>
            <div className="grid grid-cols-3 gap-2">
              {ENGINES.map((eng) => (
                <button
                  key={eng.type}
                  type="button"
                  onClick={() => handleEngineSelect(eng.type)}
                  className={clsx(
                    "relative p-3 rounded-xl border-2 transition-all text-center",
                    engine === eng.type
                      ? `${eng.bg} ${eng.border}`
                      : "border-surface-border bg-surface-100 hover:border-surface-200"
                  )}
                >
                  {engine === eng.type && (
                    <FontAwesomeIcon
                      icon={faCheckCircle}
                      className={clsx("absolute top-2 right-2 text-xs", eng.color)}
                    />
                  )}
                  <p className="text-xl mb-1">{eng.emoji}</p>
                  <p className={clsx("text-xs font-semibold", engine === eng.type ? eng.color : "text-slate-300")}>
                    {eng.label}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Cluster name */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <FontAwesomeIcon icon={faDatabase} className="mr-1.5" />
              Cluster Name
            </label>
            <input
              className="input text-base"
              placeholder={`my-${engine}-cluster`}
              value={form.name}
              onChange={(e) => set("name", e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1.5">Letters, numbers, underscores and hyphens only.</p>
          </div>

          {/* Password */}
          {isRedis ? (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                <FontAwesomeIcon icon={faKey} className="mr-1.5" />
                Password <span className="normal-case text-slate-500 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="input pr-16"
                  placeholder="Leave blank for no auth"
                  value={form.db_password}
                  onChange={(e) => set("db_password", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                <FontAwesomeIcon icon={faKey} className="mr-1.5" />
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="input pr-16"
                  placeholder="Min 8 characters"
                  value={form.db_password}
                  onChange={(e) => set("db_password", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {form.db_password.length > 0 && form.db_password.length < 8 && (
                <p className="text-xs text-red-400 mt-1.5">At least 8 characters required.</p>
              )}
            </div>
          )}

          {/* Quick info strip */}
          <div className="flex gap-2 text-xs">
            {[
              { label: "Version", value: DEFAULT_VERSIONS[engine] },
              { label: "Port", value: String(DEFAULT_PORTS[engine]) },
              { label: "Type", value: "Standalone" },
              { label: "Memory", value: "128 MB" },
            ].map((item) => (
              <div key={item.label} className="flex-1 bg-surface-100 rounded-lg px-2 py-2 text-center">
                <p className="text-subtle text-2xs uppercase tracking-wide">{item.label}</p>
                <p className="text-white font-semibold mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={() => setCreateModalOpen(false)}
            disabled={isPending}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={clsx(
              "flex-1 btn-primary justify-center transition-all",
              canSubmit ? "opacity-100" : "opacity-40 cursor-not-allowed"
            )}
          >
            {isPending ? (
              <>
                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <span>{selectedEngine.emoji}</span>
                Create Cluster
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
