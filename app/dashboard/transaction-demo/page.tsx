"use client";
import { useState, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay, faSpinner, faDatabase, faLayerGroup, faBolt,
  faPlus, faTrash, faTriangleExclamation, faCheck,
  faArrowRight, faExchangeAlt, faLock, faFlask,
} from "@fortawesome/free-solid-svg-icons";
import { useClusters, useDatabases } from "@/hooks/useClusters";
import { transactionApi } from "@/lib/api";
import Topbar from "@/components/layout/Topbar";
import { cn } from "@/lib/utils";
import type { ClusterListItem, IsolationLevel, TransactionDemoResult } from "@/types";
import toast from "react-hot-toast";

const DB_META = {
  postgres: { icon: faDatabase, color: "text-blue-400", bg: "bg-blue-500/10", label: "PostgreSQL" },
  mysql:    { icon: faLayerGroup, color: "text-orange-400", bg: "bg-orange-500/10", label: "MySQL" },
  redis:    { icon: faBolt, color: "text-red-400", bg: "bg-red-500/10", label: "Redis" },
} as const;
type DbType = keyof typeof DB_META;

const SESSION_COLORS = {
  A: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", label: "Session A" },
  B: { text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30", label: "Session B" },
};

/* ─── Preset demos (engine-aware) ───────────────────────────── */
const getSetupSql = (dbType: string, inserts: string) => {
  const createTable = dbType === "mysql"
    ? "CREATE TABLE IF NOT EXISTS txn_demo (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), balance INT)"
    : "CREATE TABLE IF NOT EXISTS txn_demo (id SERIAL PRIMARY KEY, name TEXT, balance INT)";
  return `${createTable};\nDELETE FROM txn_demo;\n${inserts}`;
};

const getPresets = (dbType: string) => [
  {
    name: "Dirty Read Demo",
    description: "Session A updates a row but doesn't commit. Session B tries to read it.",
    setupSql: getSetupSql(dbType, "INSERT INTO txn_demo (name, balance) VALUES ('Alice', 1000);"),
    steps: [
      { session: "A", sql: "UPDATE txn_demo SET balance = 500 WHERE name = 'Alice';" },
      { session: "B", sql: "SELECT * FROM txn_demo WHERE name = 'Alice';" },
    ],
  },
  {
    name: "Non-Repeatable Read",
    description: "Session B reads twice; Session A commits a change between the reads.",
    setupSql: getSetupSql(dbType, "INSERT INTO txn_demo (name, balance) VALUES ('Bob', 2000);"),
    steps: [
      { session: "B", sql: "SELECT * FROM txn_demo WHERE name = 'Bob';" },
      { session: "A", sql: "UPDATE txn_demo SET balance = 1500 WHERE name = 'Bob';" },
      { session: "B", sql: "SELECT * FROM txn_demo WHERE name = 'Bob';" },
    ],
  },
  {
    name: "Phantom Read",
    description: "Session B counts rows; Session A inserts a new row between from B's two queries.",
    setupSql: getSetupSql(dbType, "INSERT INTO txn_demo (name, balance) VALUES ('Alice', 1000), ('Bob', 2000);"),
    steps: [
      { session: "B", sql: "SELECT COUNT(*) FROM txn_demo;" },
      { session: "A", sql: "INSERT INTO txn_demo (name, balance) VALUES ('Charlie', 3000);" },
      { session: "B", sql: "SELECT COUNT(*) FROM txn_demo;" },
    ],
  },
  {
    name: "Lost Update",
    description: "Both sessions read the same row, then update. One update may be lost.",
    setupSql: getSetupSql(dbType, "INSERT INTO txn_demo (name, balance) VALUES ('Alice', 1000);"),
    steps: [
      { session: "A", sql: "SELECT * FROM txn_demo WHERE name = 'Alice';" },
      { session: "B", sql: "SELECT * FROM txn_demo WHERE name = 'Alice';" },
      { session: "A", sql: "UPDATE txn_demo SET balance = balance - 100 WHERE name = 'Alice';" },
      { session: "B", sql: "UPDATE txn_demo SET balance = balance - 200 WHERE name = 'Alice';" },
    ],
  },
];

export default function TransactionDemoPage() {
  const { data: clusters = [] } = useClusters();
  const runningClusters = useMemo(
    () => (clusters as ClusterListItem[]).filter((c) => c.status === "running" && c.db_type !== "redis"),
    [clusters]
  );
  const [clusterId, setClusterId] = useState("");
  const selectedCluster = runningClusters.find((c) => c.id === clusterId);
  const { data: databases = [] } = useDatabases(clusterId);
  const [database, setDatabase] = useState("");
  const [isolationLevels, setIsolationLevels] = useState<IsolationLevel[]>([]);
  const [isolationLevel, setIsolationLevel] = useState("");
  const [steps, setSteps] = useState<{ session: string; sql: string }[]>([
    { session: "A", sql: "" },
  ]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TransactionDemoResult | null>(null);
  const [settingUp, setSettingUp] = useState(false);

  const dbType = selectedCluster?.db_type || "postgres";
  const presets = useMemo(() => getPresets(dbType), [dbType]);

  const fetchLevels = async (cid: string) => {
    try {
      const res = await transactionApi.isolationLevels(cid);
      setIsolationLevels(res.levels || []);
      if (res.levels?.length) setIsolationLevel(res.levels[0].name);
    } catch { setIsolationLevels([]); }
  };

  const handleClusterChange = (cid: string) => {
    setClusterId(cid);
    setDatabase("");
    setResult(null);
    if (cid) fetchLevels(cid);
  };

  const addStep = () => {
    setSteps((prev) => [...prev, { session: "A", sql: "" }]);
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, field: "session" | "sql", value: string) => {
    setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const loadPreset = async (preset: ReturnType<typeof getPresets>[0]) => {
    setSteps(preset.steps.map((s) => ({ ...s })));

    // Run setup SQL
    if (clusterId && database && preset.setupSql) {
      setSettingUp(true);
      try {
        const { clusterApi } = await import("@/lib/api");
        for (const stmt of preset.setupSql.split(";").filter((s) => s.trim())) {
          await clusterApi.query(clusterId, stmt.trim() + ";", undefined, database);
        }
        toast.success(`Setup for "${preset.name}" completed`);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Setup failed");
      } finally {
        setSettingUp(false);
      }
    }
  };

  const handleRun = async () => {
    if (!clusterId || !database || !isolationLevel || !steps.length) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await transactionApi.runDemo(clusterId, {
        database,
        isolation_level: isolationLevel,
        steps: steps.filter((s) => s.sql.trim()),
      });
      setResult(res);
      if (res.error) toast.error(res.error);
      else toast.success("Transaction demo complete!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Demo failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Topbar title="Transaction Isolation Demo" subtitle="Explore ACID properties and isolation levels" />
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

        {/* Controls */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <FontAwesomeIcon icon={faExchangeAlt} className="text-brand-500 text-sm" />
            <h2 className="text-sm font-semibold text-fg-strong">Transaction Configuration</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-fg-subtle block mb-1">Cluster</label>
              <select
                value={clusterId}
                onChange={(e) => handleClusterChange(e.target.value)}
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
                onChange={(e) => setDatabase(e.target.value)}
                disabled={!clusterId}
                className="w-full bg-surface-100 border border-surface-border rounded-lg px-3 py-2 text-sm text-fg-base focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
              >
                <option value="">Select database...</option>
                {databases.map((d: { name: string }) => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-fg-subtle block mb-1">Isolation Level</label>
              <select
                value={isolationLevel}
                onChange={(e) => setIsolationLevel(e.target.value)}
                disabled={!isolationLevels.length}
                className="w-full bg-surface-100 border border-surface-border rounded-lg px-3 py-2 text-sm text-fg-base focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
              >
                {isolationLevels.map((l) => (
                  <option key={l.name} value={l.name}>{l.name}</option>
                ))}
              </select>
              {isolationLevels.find((l) => l.name === isolationLevel)?.description && (
                <p className="text-2xs text-fg-subtle mt-1">
                  {isolationLevels.find((l) => l.name === isolationLevel)?.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Preset Scenarios */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <FontAwesomeIcon icon={faFlask} className="text-purple-400 text-sm" />
            <h3 className="text-sm font-semibold text-fg-strong">Preset Scenarios</h3>
            {settingUp && (
              <span className="text-2xs text-fg-subtle flex items-center gap-1">
                <FontAwesomeIcon icon={faSpinner} spin /> Setting up...
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {presets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => loadPreset(preset)}
                disabled={!clusterId || !database || settingUp}
                className="text-left p-3 rounded-lg border border-surface-border bg-surface-50 hover:bg-surface-100 hover:border-brand-500/30 transition-all disabled:opacity-50 group"
              >
                <p className="text-xs font-semibold text-fg-strong group-hover:text-brand-400 transition-colors">{preset.name}</p>
                <p className="text-2xs text-fg-muted mt-0.5">{preset.description}</p>
                <p className="text-2xs text-fg-subtle mt-1">{preset.steps.length} steps</p>
              </button>
            ))}
          </div>
        </div>

        {/* Steps Editor */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faLock} className="text-brand-500 text-sm" />
              <h3 className="text-sm font-semibold text-fg-strong">Transaction Steps</h3>
            </div>
            <button
              onClick={addStep}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border bg-surface-100 text-xs text-fg-base hover:bg-surface-200 transition-colors"
            >
              <FontAwesomeIcon icon={faPlus} className="text-2xs" /> Add Step
            </button>
          </div>

          <div className="space-y-3">
            {steps.map((step, i) => {
              const sc = SESSION_COLORS[step.session as "A" | "B"] || SESSION_COLORS.A;
              return (
                <div key={i} className={cn("flex items-start gap-3 p-3 rounded-lg border", sc.border, sc.bg)}>
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <span className="text-2xs text-fg-subtle font-mono">#{i + 1}</span>
                    <select
                      value={step.session}
                      onChange={(e) => updateStep(i, "session", e.target.value)}
                      className={cn(
                        "w-16 text-xs rounded px-1 py-0.5 font-semibold border-0 focus:outline-none",
                        sc.bg, sc.text
                      )}
                    >
                      <option value="A">Txn A</option>
                      <option value="B">Txn B</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <input
                      value={step.sql}
                      onChange={(e) => updateStep(i, "sql", e.target.value)}
                      placeholder="SQL statement..."
                      className="w-full bg-surface-100/50 border border-surface-border rounded-lg px-3 py-2 text-sm text-fg-base font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  {steps.length > 1 && (
                    <button
                      onClick={() => removeStep(i)}
                      className="text-red-400/50 hover:text-red-400 transition-colors p-1 mt-1"
                    >
                      <FontAwesomeIcon icon={faTrash} className="text-xs" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleRun}
            disabled={running || !clusterId || !database || !steps.some((s) => s.sql.trim())}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-500 transition-colors disabled:opacity-50"
          >
            <FontAwesomeIcon icon={running ? faSpinner : faPlay} spin={running} />
            {running ? "Running Demo..." : "Run Transaction Demo"}
          </button>
        </div>

        {/* Results */}
        {result && (
          <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-border bg-surface-50 flex items-center gap-3">
              <h3 className="text-sm font-semibold text-fg-strong">Results</h3>
              <span className="text-2xs text-fg-subtle bg-surface-100 px-2 py-0.5 rounded">
                Isolation: {result.isolation_level}
              </span>
              <span className="text-2xs text-fg-subtle bg-surface-100 px-2 py-0.5 rounded">
                {result.engine === "postgres" ? "PostgreSQL" : "MySQL"}
              </span>
            </div>

            <div className="p-5 space-y-3">
              {result.error && (
                <div className="text-red-400 text-sm p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="mr-2" />
                  {result.error}
                </div>
              )}

              {result.results?.map((step, i) => {
                const sc = SESSION_COLORS[step.session as "A" | "B"] || SESSION_COLORS.A;
                const hasError = !!step.error;
                return (
                  <div key={i} className={cn("rounded-lg border p-4", sc.border, sc.bg)}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xs text-fg-subtle font-mono">Step {i + 1}</span>
                      <span className={cn("text-xs font-semibold", sc.text)}>{sc.label}</span>
                      <span className="text-2xs text-fg-subtle font-mono bg-surface-100/50 px-2 py-0.5 rounded">
                        {step.execution_time_ms.toFixed(1)}ms
                      </span>
                      <FontAwesomeIcon icon={faArrowRight} className="text-2xs text-fg-subtle" />
                    </div>

                    <pre className="text-xs text-fg-muted font-mono bg-surface-100/50 rounded px-3 py-2 mb-2">
                      {step.sql}
                    </pre>

                    {hasError ? (
                      <div className="text-red-400 text-xs p-2 bg-red-500/10 rounded border border-red-500/20">
                        <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1" />
                        {step.error}
                      </div>
                    ) : step.columns.length > 0 ? (
                      <div className="overflow-x-auto rounded border border-surface-border/50">
                        <table className="w-full text-xs border-collapse">
                          <thead className="bg-surface-100/50">
                            <tr>
                              {step.columns.map((col) => (
                                <th key={col} className="text-left px-3 py-1.5 text-fg-muted font-semibold border-b border-surface-border/50 text-2xs">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {step.rows.map((row, ri) => (
                              <tr key={ri}>
                                {(row as unknown[]).map((cell, ci) => (
                                  <td key={ci} className="px-3 py-1.5 text-fg-base font-mono text-2xs">
                                    {cell === null ? <span className="text-fg-subtle italic">NULL</span> : String(cell)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-xs text-green-400 flex items-center gap-1">
                        <FontAwesomeIcon icon={faCheck} /> Statement executed ({step.row_count} rows affected)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Educational: Isolation Levels Table */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-5">
          <h3 className="text-sm font-semibold text-fg-strong mb-3">Isolation Levels & Phenomena</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-surface-100">
                <tr>
                  <th className="text-left px-3 py-2 text-fg-muted font-semibold border-b border-surface-border">Isolation Level</th>
                  <th className="text-center px-3 py-2 text-fg-muted font-semibold border-b border-surface-border">Dirty Read</th>
                  <th className="text-center px-3 py-2 text-fg-muted font-semibold border-b border-surface-border">Non-Repeatable Read</th>
                  <th className="text-center px-3 py-2 text-fg-muted font-semibold border-b border-surface-border">Phantom Read</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-surface-border/40">
                  <td className="px-3 py-2 text-fg-base font-medium">READ UNCOMMITTED</td>
                  <td className="px-3 py-2 text-center text-red-400">Possible</td>
                  <td className="px-3 py-2 text-center text-red-400">Possible</td>
                  <td className="px-3 py-2 text-center text-red-400">Possible</td>
                </tr>
                <tr className="border-b border-surface-border/40">
                  <td className="px-3 py-2 text-fg-base font-medium">READ COMMITTED</td>
                  <td className="px-3 py-2 text-center text-green-400">Prevented</td>
                  <td className="px-3 py-2 text-center text-red-400">Possible</td>
                  <td className="px-3 py-2 text-center text-red-400">Possible</td>
                </tr>
                <tr className="border-b border-surface-border/40">
                  <td className="px-3 py-2 text-fg-base font-medium">REPEATABLE READ</td>
                  <td className="px-3 py-2 text-center text-green-400">Prevented</td>
                  <td className="px-3 py-2 text-center text-green-400">Prevented</td>
                  <td className="px-3 py-2 text-center text-amber-400">Possible*</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-fg-base font-medium">SERIALIZABLE</td>
                  <td className="px-3 py-2 text-center text-green-400">Prevented</td>
                  <td className="px-3 py-2 text-center text-green-400">Prevented</td>
                  <td className="px-3 py-2 text-center text-green-400">Prevented</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-2xs text-fg-subtle mt-2">* PostgreSQL&apos;s REPEATABLE READ uses MVCC snapshots that also prevent phantom reads in practice. MySQL/InnoDB&apos;s REPEATABLE READ uses gap locks and MVCC to prevent most phantom reads, unlike the SQL standard definition.</p>
        </div>
      </div>
    </>
  );
}
