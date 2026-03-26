"use client";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark, faDatabase, faKey, faSpinner, faCheck,
  faLayerGroup, faCircleNodes, faBolt,
  faEye, faEyeSlash, faPlus, faServer, faLock,
} from "@fortawesome/free-solid-svg-icons";
import { useCreateCluster } from "@/hooks/useClusters";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

type DbType = "postgres" | "mysql" | "redis";

const ENGINES: {
  type: DbType;
  label: string;
  icon: typeof faDatabase;
  desc: string;
  iconColor: string;
  iconBg: string;
  activeBorder: string;
  activeBg: string;
}[] = [
  {
    type:        "postgres",
    label:       "PostgreSQL",
    icon:        faDatabase,
    desc:        "Relational · ACID compliant",
    iconColor:   "text-blue-500",
    iconBg:      "bg-blue-500/10",
    activeBorder:"border-blue-500/60",
    activeBg:    "bg-blue-500/8",
  },
  {
    type:        "mysql",
    label:       "MySQL",
    icon:        faLayerGroup,
    desc:        "Relational · Widely adopted",
    iconColor:   "text-orange-500",
    iconBg:      "bg-orange-500/10",
    activeBorder:"border-orange-500/60",
    activeBg:    "bg-orange-500/8",
  },
  {
    type:        "redis",
    label:       "Redis",
    icon:        faBolt,
    desc:        "In-memory · Ultra fast",
    iconColor:   "text-red-500",
    iconBg:      "bg-red-500/10",
    activeBorder:"border-red-500/60",
    activeBg:    "bg-red-500/8",
  },
];

const DEFAULT_PORTS:    Record<DbType, number> = { postgres: 5433,  mysql: 3307,  redis: 6380 };
const DEFAULT_VERSIONS: Record<DbType, string> = { postgres: "16",  mysql: "8.0", redis: "7"  };

function makeForm(type: DbType) {
  return {
    db_type:      type,
    db_version:   DEFAULT_VERSIONS[type],
    db_user:      type === "redis" ? "" : type === "mysql" ? "admin" : "postgres",
    db_name:      type === "redis" ? "" : type === "mysql" ? "mydb"  : "postgres",
    db_password:  "",
    name:         "",
    description:  "",
    cluster_type: "standalone",
    node_count:   1,
    cpu_limit:    "1",
    memory_limit: "128m",
    base_port:    DEFAULT_PORTS[type],
    tags:         {},
  };
}

export default function CreateClusterModal() {
  const { createModalOpen, setCreateModalOpen } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const { mutate: createCluster, isPending } = useCreateCluster();
  const [engine, setEngine]           = useState<DbType>("postgres");
  const [form, setForm]               = useState(makeForm("postgres"));
  const [showPassword, setShowPassword] = useState(false);

  const canCreate = user?.role === "subscriber" || user?.role === "admin";

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleEngineSelect = (type: DbType) => {
    setEngine(type);
    setForm(makeForm(type));
  };

  const isRedis   = engine === "redis";
  const passwordOk = isRedis || form.db_password.length >= 8;
  const canSubmit  = form.name.trim().length >= 2 && passwordOk && !isPending;

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

  // Normal users see an upgrade prompt instead of the creation form
  if (!canCreate) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCreateModalOpen(false)} />
        <div className="relative bg-surface-50 border border-surface-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col p-8 items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
            <FontAwesomeIcon icon={faLock} className="text-brand-400 text-2xl" />
          </div>
          <div>
            <h2 className="text-base font-bold text-fg-strong">Subscriber Required</h2>
            <p className="text-xs text-fg-subtle mt-1.5 leading-relaxed">
              Creating clusters is available to <span className="text-brand-400 font-semibold">Subscriber</span> and <span className="text-brand-400 font-semibold">Admin</span> accounts.<br />
              Ask an admin to upgrade your role.
            </p>
          </div>
          <button
            onClick={() => setCreateModalOpen(false)}
            className="btn-primary text-sm px-6 py-2 w-full"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  const sel = ENGINES.find((e) => e.type === engine)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !isPending && setCreateModalOpen(false)}
      />

      {/* Modal */}
      <div className="relative bg-surface-50 border border-surface-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-slide-up">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", sel.iconBg)}>
              <FontAwesomeIcon icon={sel.icon} className={cn("text-base", sel.iconColor)} />
            </div>
            <div>
              <h2 className="text-base font-bold text-fg-strong leading-tight">
                New {sel.label} Cluster
              </h2>
              <p className="text-xs text-fg-muted mt-0.5">{sel.desc}</p>
            </div>
          </div>
          <button
            onClick={() => !isPending && setCreateModalOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-fg-muted hover:text-fg-strong hover:bg-surface-100 transition-colors"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

          {/* Engine selector */}
          <div>
            <p className="text-xs font-semibold text-fg-subtle uppercase tracking-widest mb-3">
              Choose Engine
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ENGINES.map((eng) => {
                const isActive = engine === eng.type;
                return (
                  <button
                    key={eng.type}
                    type="button"
                    onClick={() => handleEngineSelect(eng.type)}
                    className={cn(
                      "relative flex flex-col items-center gap-2 p-3.5 rounded-xl border-2 transition-all duration-150",
                      isActive
                        ? `${eng.activeBg} ${eng.activeBorder}`
                        : "border-surface-border bg-surface-100 hover:border-surface-200 hover:bg-surface-200/50"
                    )}
                  >
                    {/* Active check badge */}
                    {isActive && (
                      <span className={cn(
                        "absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center text-xs text-white",
                        eng.iconColor.replace("text-", "bg-")
                      )}>
                        <FontAwesomeIcon icon={faCheck} />
                      </span>
                    )}
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", eng.iconBg)}>
                      <FontAwesomeIcon icon={eng.icon} className={cn("text-sm", eng.iconColor)} />
                    </div>
                    <span className={cn(
                      "text-xs font-semibold",
                      isActive ? eng.iconColor : "text-fg-muted"
                    )}>
                      {eng.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-surface-border" />

          {/* Cluster name */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-fg-subtle uppercase tracking-widest mb-2">
              <FontAwesomeIcon icon={faDatabase} />
              Cluster Name
            </label>
            <input
              className="input"
              placeholder={`my-${engine}-cluster`}
              value={form.name}
              onChange={(e) => set("name", e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
              autoFocus
            />
            <p className="text-xs text-fg-subtle mt-1.5">
              Letters, numbers, underscores and hyphens only.
            </p>
          </div>

          {/* Password */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-fg-subtle uppercase tracking-widest mb-2">
              <FontAwesomeIcon icon={faKey} />
              Password
              {isRedis && (
                <span className="normal-case font-normal text-fg-subtle ml-1">(optional)</span>
              )}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="input pr-10"
                placeholder={isRedis ? "Leave blank for no auth" : "Min 8 characters"}
                value={form.db_password}
                onChange={(e) => set("db_password", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-strong transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="text-xs" />
              </button>
            </div>
            {!isRedis && form.db_password.length > 0 && form.db_password.length < 8 && (
              <p className="text-xs text-red-500 mt-1.5">At least 8 characters required.</p>
            )}
          </div>

          {/* Config strip */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: faDatabase,     label: "Version", value: DEFAULT_VERSIONS[engine] },
              { icon: faServer,       label: "Port",    value: String(DEFAULT_PORTS[engine]) },
              { icon: faCircleNodes,  label: "Type",    value: "Standalone" },
              { icon: faLayerGroup,   label: "Memory",  value: "128 MB" },
            ].map((item) => (
              <div key={item.label} className="bg-surface-100 border border-surface-border rounded-xl px-2 py-2.5 text-center">
                <FontAwesomeIcon icon={item.icon} className="text-xs text-fg-subtle mb-1" />
                <p className="text-xs text-fg-subtle uppercase tracking-wide leading-none mb-1">{item.label}</p>
                <p className="text-xs font-bold text-fg-strong">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="px-6 pb-5 pt-2 flex gap-3 border-t border-surface-border">
          <button
            onClick={() => setCreateModalOpen(false)}
            disabled={isPending}
            className="btn-secondary flex-1 justify-center"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "flex-1 btn-primary justify-center",
              !canSubmit && "opacity-40 cursor-not-allowed"
            )}
          >
            {isPending ? (
              <>
                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faPlus} />
                Create Cluster
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

