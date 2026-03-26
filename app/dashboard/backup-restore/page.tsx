"use client";
import { useState, useMemo, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDownload, faUpload, faSpinner, faDatabase, faLayerGroup,
  faBolt, faCheck, faTriangleExclamation, faFileExport, faCopy,
} from "@fortawesome/free-solid-svg-icons";
import { useClusters, useDatabases } from "@/hooks/useClusters";
import { backupApi } from "@/lib/api";
import Topbar from "@/components/layout/Topbar";
import { cn } from "@/lib/utils";
import type { ClusterListItem } from "@/types";
import toast from "react-hot-toast";

const DB_META = {
  postgres: { icon: faDatabase, color: "text-blue-400", bg: "bg-blue-500/10", label: "PostgreSQL" },
  mysql:    { icon: faLayerGroup, color: "text-orange-400", bg: "bg-orange-500/10", label: "MySQL" },
  redis:    { icon: faBolt, color: "text-red-400", bg: "bg-red-500/10", label: "Redis" },
} as const;
type DbType = keyof typeof DB_META;

export default function BackupRestorePage() {
  const { data: clusters = [] } = useClusters();
  const runningClusters = useMemo(
    () => (clusters as ClusterListItem[]).filter((c) => c.status === "running" && c.db_type !== "redis"),
    [clusters]
  );
  const [clusterId, setClusterId] = useState("");
  const selectedCluster = runningClusters.find((c) => c.id === clusterId);
  const { data: databases = [] } = useDatabases(clusterId);
  const [database, setDatabase] = useState("");

  // Backup state
  const [backingUp, setBackingUp] = useState(false);
  const [backupDump, setBackupDump] = useState("");
  const [backupInfo, setBackupInfo] = useState<{ engine: string; database: string; size: number } | null>(null);

  // Restore state
  const [restoring, setRestoring] = useState(false);
  const [restoreSql, setRestoreSql] = useState("");
  const [restoreResult, setRestoreResult] = useState<{ success: boolean; message: string; output?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    if (!clusterId || !database) return;
    setBackingUp(true);
    setBackupDump("");
    setBackupInfo(null);
    try {
      const res = await backupApi.backup(clusterId, database);
      setBackupDump(res.dump);
      setBackupInfo({ engine: res.engine, database: res.database, size: new Blob([res.dump]).size });
      toast.success("Backup created successfully!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBackingUp(false);
    }
  };

  const downloadBackup = () => {
    if (!backupDump) return;
    const blob = new Blob([backupDump], { type: "application/sql" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${database}_backup_${new Date().toISOString().slice(0, 10)}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyBackup = () => {
    if (!backupDump) return;
    navigator.clipboard.writeText(backupDump);
    toast.success("Backup copied to clipboard");
  };

  const handleRestore = async () => {
    if (!clusterId || !database || !restoreSql.trim()) return;
    if (!confirm(`This will execute the SQL dump against "${database}". Existing data may be modified. Continue?`)) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const res = await backupApi.restore(clusterId, database, restoreSql);
      setRestoreResult(res);
      toast.success("Restore completed!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRestoreSql(reader.result as string);
    reader.readAsText(file);
  };

  const useBackupForRestore = () => {
    setRestoreSql(backupDump);
    toast.success("Backup dump loaded into restore area");
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <>
      <Topbar title="Backup & Restore" subtitle="Export and import database dumps" />
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

        {/* Cluster & DB Selector */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <FontAwesomeIcon icon={faFileExport} className="text-brand-500 text-sm" />
            <h2 className="text-sm font-semibold text-fg-strong">Database Selection</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-fg-subtle block mb-1">Cluster</label>
              <select
                value={clusterId}
                onChange={(e) => { setClusterId(e.target.value); setDatabase(""); setBackupDump(""); setBackupInfo(null); }}
                className="w-full bg-surface-100 border border-surface-border rounded-lg px-3 py-2 text-sm text-fg-base focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select a cluster...</option>
                {runningClusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({DB_META[c.db_type as DbType]?.label})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-fg-subtle block mb-1">Database</label>
              <select
                value={database}
                onChange={(e) => { setDatabase(e.target.value); setBackupDump(""); setBackupInfo(null); }}
                disabled={!clusterId}
                className="w-full bg-surface-100 border border-surface-border rounded-lg px-3 py-2 text-sm text-fg-base focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
              >
                <option value="">Select database...</option>
                {databases.map((d: { name: string }) => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Backup Panel */}
          <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-border bg-surface-50 flex items-center gap-2">
              <FontAwesomeIcon icon={faDownload} className="text-green-400 text-sm" />
              <h3 className="text-sm font-semibold text-fg-strong">Backup (Export)</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-fg-muted">
                Creates a SQL dump of the selected database using{" "}
                {selectedCluster?.db_type === "mysql" ? "mysqldump" : "pg_dump"}.
                The dump includes schema and data.
              </p>

              <button
                onClick={handleBackup}
                disabled={backingUp || !clusterId || !database}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-500 transition-colors disabled:opacity-50"
              >
                <FontAwesomeIcon icon={backingUp ? faSpinner : faDownload} spin={backingUp} />
                {backingUp ? "Creating Backup..." : "Create Backup"}
              </button>

              {backupInfo && (
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-green-400 text-xs font-medium">
                    <FontAwesomeIcon icon={faCheck} />
                    Backup Created
                  </div>
                  <div className="flex gap-4 text-2xs text-fg-muted">
                    <span>Engine: {backupInfo.engine}</span>
                    <span>Database: {backupInfo.database}</span>
                    <span>Size: {formatBytes(backupInfo.size)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={downloadBackup} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 border border-surface-border text-xs text-fg-base hover:bg-surface-200 transition-colors">
                      <FontAwesomeIcon icon={faDownload} className="text-2xs" /> Download .sql
                    </button>
                    <button onClick={copyBackup} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 border border-surface-border text-xs text-fg-base hover:bg-surface-200 transition-colors">
                      <FontAwesomeIcon icon={faCopy} className="text-2xs" /> Copy
                    </button>
                    <button onClick={useBackupForRestore} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20 text-xs text-brand-400 hover:bg-brand-500/20 transition-colors">
                      Use for Restore →
                    </button>
                  </div>
                </div>
              )}

              {backupDump && (
                <div className="max-h-[300px] overflow-auto rounded-lg bg-surface-100 border border-surface-border">
                  <pre className="p-3 text-2xs text-fg-muted font-mono whitespace-pre-wrap">{backupDump.slice(0, 5000)}{backupDump.length > 5000 ? "\n\n... (truncated preview)" : ""}</pre>
                </div>
              )}
            </div>
          </div>

          {/* Restore Panel */}
          <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-border bg-surface-50 flex items-center gap-2">
              <FontAwesomeIcon icon={faUpload} className="text-amber-400 text-sm" />
              <h3 className="text-sm font-semibold text-fg-strong">Restore (Import)</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-fg-muted">
                Restore a SQL dump into the selected database. Upload a .sql file or paste the dump content.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-100 border border-surface-border text-sm text-fg-base hover:bg-surface-200 transition-colors"
                >
                  <FontAwesomeIcon icon={faUpload} className="text-xs" /> Upload .sql File
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sql,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              <div>
                <label className="text-xs text-fg-subtle block mb-1">SQL Dump Content</label>
                <textarea
                  value={restoreSql}
                  onChange={(e) => setRestoreSql(e.target.value)}
                  rows={10}
                  placeholder="Paste your SQL dump here or upload a .sql file..."
                  className="w-full bg-surface-100 border border-surface-border rounded-lg px-3 py-2 text-xs text-fg-base font-mono focus:outline-none focus:ring-1 focus:ring-brand-500 resize-y"
                />
                {restoreSql && (
                  <p className="text-2xs text-fg-subtle mt-1">
                    {formatBytes(new Blob([restoreSql]).size)} loaded
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleRestore}
                  disabled={restoring || !clusterId || !database || !restoreSql.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-500 transition-colors disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={restoring ? faSpinner : faUpload} spin={restoring} />
                  {restoring ? "Restoring..." : "Restore Database"}
                </button>
                <span className="text-2xs text-amber-400 flex items-center gap-1">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  This will modify the database
                </span>
              </div>

              {restoreResult && (
                <div className={cn(
                  "rounded-lg p-3 border",
                  restoreResult.success
                    ? "bg-green-500/5 border-green-500/20"
                    : "bg-red-500/5 border-red-500/20"
                )}>
                  <div className={cn(
                    "flex items-center gap-2 text-xs font-medium mb-1",
                    restoreResult.success ? "text-green-400" : "text-red-400"
                  )}>
                    <FontAwesomeIcon icon={restoreResult.success ? faCheck : faTriangleExclamation} />
                    {restoreResult.message}
                  </div>
                  {restoreResult.output && (
                    <pre className="text-2xs text-fg-muted font-mono whitespace-pre-wrap mt-2 max-h-[200px] overflow-auto">
                      {restoreResult.output}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-5">
          <h3 className="text-sm font-semibold text-fg-strong mb-3">About Backup & Restore</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-fg-muted">
            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
              <p className="font-semibold text-green-400 mb-1">
                {selectedCluster?.db_type === "mysql" ? "mysqldump" : "pg_dump"}
              </p>
              <p>
                {selectedCluster?.db_type === "mysql"
                  ? "Creates a logical SQL dump with CREATE TABLE + INSERT statements. Uses --single-transaction for consistent InnoDB snapshots without locking tables."
                  : "Creates a logical SQL dump — portable, human-readable SQL statements that recreate schema + data. Standard backup for development and small-to-medium databases."}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="font-semibold text-amber-400 mb-1">Best Practices</p>
              <p>
                {selectedCluster?.db_type === "mysql"
                  ? "For production MySQL, use --single-transaction with InnoDB tables for consistent backups. Combine with binary log replication for point-in-time recovery. Always test restores regularly."
                  : "In production, combine logical backups with WAL archiving (PostgreSQL) for point-in-time recovery. Always test restores regularly. Store backups off-site."}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <p className="font-semibold text-blue-400 mb-1">
                {selectedCluster?.db_type === "mysql" ? "MySQL Specifics" : "PostgreSQL Specifics"}
              </p>
              <p>
                {selectedCluster?.db_type === "mysql"
                  ? "InnoDB supports transactional backups. Character set (utf8mb4) and collation are preserved in the dump. Use --routines to include stored procedures and functions."
                  : "pg_dump supports custom format (-Fc) for compressed, parallel restore. Use pg_restore for custom-format dumps. Supports selective schema/data-only backups."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
