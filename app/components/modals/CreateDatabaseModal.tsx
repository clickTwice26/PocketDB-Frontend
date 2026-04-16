"use client";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark, faDatabase, faSpinner, faCheck,
  faCopy, faTriangleExclamation, faCircleCheck,
} from "@fortawesome/free-solid-svg-icons";
import { useCreateDatabase } from "@/hooks/useClusters";
import type { UserDatabaseCreateResponse } from "@/types";
import toast from "react-hot-toast";
import clsx from "clsx";

interface Props {
  open: boolean;
  onClose: () => void;
}

type DbType = "postgres" | "mysql";

const DB_OPTIONS: { type: DbType; label: string; color: string; bg: string }[] = [
  { type: "postgres", label: "PostgreSQL", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  { type: "mysql", label: "MySQL", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
];

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex items-center gap-2 bg-surface-100 border border-surface-border rounded-lg px-3 py-2">
        <span className="flex-1 text-sm font-mono text-fg-base truncate">{value}</span>
        <button
          onClick={copy}
          className="shrink-0 text-slate-400 hover:text-white transition-colors"
          title="Copy"
        >
          <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="text-xs" />
        </button>
      </div>
    </div>
  );
}

export default function CreateDatabaseModal({ open, onClose }: Props) {
  const [name, setName] = useState("");
  const [dbType, setDbType] = useState<DbType>("postgres");
  const [result, setResult] = useState<UserDatabaseCreateResponse | null>(null);
  const { mutate: createDb, isPending } = useCreateDatabase();

  const nameError =
    name.length > 0 && !/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(name)
      ? "Must start with a letter; letters, digits, and underscores only (max 63 chars)"
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameError || !name.trim()) return;
    createDb(
      { name: name.trim(), db_type: dbType },
      {
        onSuccess: (data: UserDatabaseCreateResponse) => {
          setResult(data);
        },
        onError: (err: Error) => {
          toast.error(err.message);
        },
      }
    );
  };

  const handleClose = () => {
    setName("");
    setDbType("postgres");
    setResult(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={result ? handleClose : undefined}
      />

      <div className="relative w-full max-w-md bg-surface-50 border border-surface-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faDatabase} className="text-brand-400" />
            <span className="font-semibold text-fg-base">
              {result ? "Database Created" : "Create Database"}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-500 hover:text-white transition-colors"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* Body */}
        {!result ? (
          /* ── Creation Form ── */
          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            {/* Engine selection */}
            <div>
              <label className="text-xs text-slate-400 mb-2 block">Database Engine</label>
              <div className="grid grid-cols-2 gap-3">
                {DB_OPTIONS.map((opt) => (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => setDbType(opt.type)}
                    className={clsx(
                      "flex flex-col items-center gap-1.5 rounded-xl border py-3 px-2 transition-all text-sm font-medium",
                      dbType === opt.type
                        ? opt.bg + " " + opt.color
                        : "bg-surface-100 border-surface-border text-slate-400 hover:text-white hover:border-slate-500"
                    )}
                  >
                    <FontAwesomeIcon icon={faDatabase} className="text-lg" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Database name */}
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Database Name</label>
              <input
                className={clsx(
                  "input w-full",
                  nameError ? "border-red-500/60 focus:border-red-500" : ""
                )}
                placeholder="e.g. my_app_db"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                disabled={isPending}
              />
              {nameError && (
                <p className="mt-1 text-xs text-red-400">{nameError}</p>
              )}
            </div>

            {/* Info banner */}
            <div className="flex gap-2 items-start bg-brand-500/10 border border-brand-500/20 rounded-xl px-3 py-2.5 text-xs text-brand-300">
              <FontAwesomeIcon icon={faDatabase} className="mt-0.5 shrink-0" />
              <span>
                We&apos;ll automatically pick the best available cluster for your database.
                You&apos;ll receive connection credentials once.
              </span>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending || !!nameError || !name.trim()}
              className="btn-primary w-full justify-center"
            >
              {isPending ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                  Finding the best cluster…
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faDatabase} />
                  Create Database
                </>
              )}
            </button>
          </form>
        ) : (
          /* ── One-time Credentials Panel ── */
          <div className="p-5 space-y-4">
            {/* Success badge */}
            <div className="flex items-center gap-2 text-emerald-400">
              <FontAwesomeIcon icon={faCircleCheck} className="text-lg" />
              <span className="font-medium">
                <span className="font-mono">{result.database_name}</span> is ready!
              </span>
            </div>

            {/* Warning */}
            <div className="flex gap-2 items-start bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 text-xs text-amber-300">
              <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 shrink-0" />
              <span>
                <strong>Save these credentials now.</strong> The password will not be shown again.
              </span>
            </div>

            {/* Credential fields */}
            <div className="space-y-2.5">
              <CopyField label="Host" value={result.host} />
              <CopyField label="Port" value={String(result.port)} />
              <CopyField label="Database" value={result.database_name} />
              <CopyField label="Username" value={result.db_username} />
              <CopyField label="Password" value={result.db_password} />
            </div>

            {/* Connection string */}
            <div>
              <span className="text-xs text-slate-500 mb-1 block">Connection String</span>
              <div className="bg-surface-100 border border-surface-border rounded-lg px-3 py-2">
                <code className="text-xs font-mono text-fg-muted break-all">
                  {result.db_type === "postgres"
                    ? `postgresql://${result.db_username}:${result.db_password}@${result.host}:${result.port}/${result.database_name}`
                    : `mysql://${result.db_username}:${result.db_password}@${result.host}:${result.port}/${result.database_name}`}
                </code>
              </div>
            </div>

            <button onClick={handleClose} className="btn-primary w-full justify-center">
              <FontAwesomeIcon icon={faCheck} />
              Done — I&apos;ve saved my credentials
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
