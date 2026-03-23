"use client";
import { useState, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay, faSpinner, faDatabase, faLayerGroup, faBolt,
  faMagnifyingGlass, faChevronDown, faTriangleExclamation,
  faSitemap, faListCheck, faToggleOn, faToggleOff,
} from "@fortawesome/free-solid-svg-icons";
import { useClusters, useDatabases } from "@/hooks/useClusters";
import { explainApi } from "@/lib/api";
import Topbar from "@/components/layout/Topbar";
import { cn } from "@/lib/utils";
import type { ClusterListItem, ExplainResult } from "@/types";
import toast from "react-hot-toast";

const DB_META = {
  postgres: { icon: faDatabase, color: "text-blue-400", bg: "bg-blue-500/10", label: "PostgreSQL" },
  mysql:    { icon: faLayerGroup, color: "text-orange-400", bg: "bg-orange-500/10", label: "MySQL" },
  redis:    { icon: faBolt, color: "text-red-400", bg: "bg-red-500/10", label: "Redis" },
} as const;

type DbType = keyof typeof DB_META;

/* ─── Plan Node component (recursive for Postgres JSON plans) ──────── */
function PlanNode({ node, depth = 0 }: { node: Record<string, unknown>; depth?: number }) {
  const nodeType = (node["Node Type"] as string) || "Unknown";
  const relation = node["Relation Name"] as string | undefined;
  const alias = node["Alias"] as string | undefined;
  const cost = node["Total Cost"] as number | undefined;
  const rows = node["Plan Rows"] as number | undefined;
  const actualTime = node["Actual Total Time"] as number | undefined;
  const actualRows = node["Actual Rows"] as number | undefined;
  const width = node["Plan Width"] as number | undefined;
  const filter = node["Filter"] as string | undefined;
  const indexName = node["Index Name"] as string | undefined;
  const children = (node["Plans"] as Record<string, unknown>[]) || [];

  const isSeqScan = nodeType === "Seq Scan";
  const isIndexScan = nodeType.includes("Index");

  return (
    <div className={cn("relative", depth > 0 && "ml-6 mt-2")}>
      {depth > 0 && (
        <div className="absolute left-[-16px] top-0 bottom-0 w-px bg-surface-border" />
      )}
      <div className={cn(
        "rounded-lg border p-3 transition-all",
        isSeqScan ? "border-amber-500/30 bg-amber-500/5" :
        isIndexScan ? "border-green-500/30 bg-green-500/5" :
        "border-surface-border bg-surface-50"
      )}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            "font-semibold text-sm",
            isSeqScan ? "text-amber-400" : isIndexScan ? "text-green-400" : "text-brand-400"
          )}>
            {nodeType}
          </span>
          {relation && (
            <span className="text-xs text-fg-muted bg-surface-100 px-2 py-0.5 rounded">
              on {alias || relation}
            </span>
          )}
          {indexName && (
            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
              idx: {indexName}
            </span>
          )}
          {isSeqScan && (
            <span className="text-2xs text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">
              ⚠ Sequential Scan
            </span>
          )}
        </div>

        <div className="flex gap-4 mt-2 text-xs text-fg-subtle flex-wrap">
          {cost !== undefined && <span>Est. Cost: <span className="text-fg-muted font-mono">{cost.toFixed(2)}</span></span>}
          {rows !== undefined && <span>Est. Rows: <span className="text-fg-muted font-mono">{rows}</span></span>}
          {width !== undefined && <span>Width: <span className="text-fg-muted font-mono">{width}</span></span>}
          {actualTime !== undefined && <span>Actual Time: <span className="text-brand-400 font-mono">{actualTime.toFixed(3)}ms</span></span>}
          {actualRows !== undefined && <span>Actual Rows: <span className="text-brand-400 font-mono">{actualRows}</span></span>}
        </div>

        {filter && (
          <div className="mt-1.5 text-xs">
            <span className="text-fg-subtle">Filter: </span>
            <span className="text-fg-muted font-mono">{filter}</span>
          </div>
        )}
      </div>

      {children.map((child, i) => (
        <PlanNode key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

/* ─── MySQL Plan Table ─────────────────────────────────────────────── */
function MysqlPlanTable({ plan }: { plan: Record<string, unknown>[] }) {
  if (!plan.length) return null;
  const cols = Object.keys(plan[0]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-surface-100 sticky top-0 z-10">
          <tr>
            {cols.map((c) => (
              <th key={c} className="text-left px-3 py-2 text-fg-muted font-semibold border-b border-surface-border whitespace-nowrap text-xs">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plan.map((row, ri) => (
            <tr key={ri} className="border-b border-surface-border/40 hover:bg-surface-50">
              {cols.map((c) => {
                const v = row[c];
                const isType = c === "type" || c === "select_type";
                const isSeq = isType && String(v).toUpperCase() === "ALL";
                return (
                  <td key={c} className={cn(
                    "px-3 py-2 font-mono text-xs max-w-[200px] truncate",
                    isSeq ? "text-amber-400 font-bold" : "text-fg-base"
                  )} title={String(v ?? "")}>
                    {v === null ? <span className="text-fg-subtle italic">NULL</span> : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────────────── */
export default function ExplainPlanPage() {
  const { data: clusters = [] } = useClusters();
  const runningClusters = useMemo(
    () => (clusters as ClusterListItem[]).filter((c) => c.status === "running" && c.db_type !== "redis"),
    [clusters]
  );
  const [clusterId, setClusterId] = useState("");
  const selectedCluster = runningClusters.find((c) => c.id === clusterId);
  const dbType = (selectedCluster?.db_type || "postgres") as DbType;
  const { data: databases = [] } = useDatabases(clusterId);
  const [database, setDatabase] = useState("");
  const [query, setQuery] = useState("SELECT * FROM pg_tables WHERE schemaname = 'public';");
  const [analyze, setAnalyze] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [viewMode, setViewMode] = useState<"visual" | "text">("visual");

  const handleExplain = async () => {
    if (!clusterId || !query.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await explainApi.explain(clusterId, query, analyze, database || undefined);
      setResult(r);
      if (r.error) toast.error(r.error);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to run EXPLAIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Topbar title="EXPLAIN Plan Viewer" subtitle="Visualize query execution plans" />
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

        {/* Controls */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <FontAwesomeIcon icon={faSitemap} className="text-brand-500 text-sm" />
            <h2 className="text-sm font-semibold text-fg-strong">Query Plan Analysis</h2>
          </div>

          {/* Cluster + DB selectors */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-fg-subtle block mb-1">Cluster</label>
              <select
                value={clusterId}
                onChange={(e) => { setClusterId(e.target.value); setDatabase(""); }}
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
                <option value="">Default</option>
                {databases.map((d: { name: string }) => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-3">
              <button
                onClick={() => setAnalyze(!analyze)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                  analyze
                    ? "border-brand-500/30 bg-brand-500/10 text-brand-400"
                    : "border-surface-border bg-surface-100 text-fg-muted hover:text-fg-base"
                )}
              >
                <FontAwesomeIcon icon={analyze ? faToggleOn : faToggleOff} />
                ANALYZE
              </button>
            </div>
          </div>

          {/* Query input */}
          <div>
            <label className="text-xs text-fg-subtle block mb-1">SQL Query</label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={4}
              placeholder="Enter a SELECT or DML query to analyze..."
              className="w-full bg-surface-100 border border-surface-border rounded-lg px-3 py-2 text-sm text-fg-base font-mono focus:outline-none focus:ring-1 focus:ring-brand-500 resize-y"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExplain}
              disabled={loading || !clusterId || !query.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={loading ? faSpinner : faPlay} spin={loading} />
              {loading ? "Analyzing..." : analyze ? "EXPLAIN ANALYZE" : "EXPLAIN"}
            </button>
            {analyze && (
              <span className="text-2xs text-amber-400 flex items-center gap-1">
                <FontAwesomeIcon icon={faTriangleExclamation} />
                ANALYZE actually executes the query
              </span>
            )}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-border bg-surface-50">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-fg-strong">Execution Plan</h3>
                <span className="text-2xs text-fg-subtle bg-surface-100 px-2 py-0.5 rounded">
                  {result.engine === "postgres" ? "PostgreSQL" : "MySQL"}
                </span>
              </div>
              <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode("visual")}
                  className={cn(
                    "px-3 py-1 text-xs rounded-md transition-all",
                    viewMode === "visual" ? "bg-brand-600 text-white" : "text-fg-muted hover:text-fg-base"
                  )}
                >
                  Visual
                </button>
                <button
                  onClick={() => setViewMode("text")}
                  className={cn(
                    "px-3 py-1 text-xs rounded-md transition-all",
                    viewMode === "text" ? "bg-brand-600 text-white" : "text-fg-muted hover:text-fg-base"
                  )}
                >
                  Raw Text
                </button>
              </div>
            </div>

            <div className="p-5 overflow-auto max-h-[600px]">
              {result.error && (
                <div className="text-red-400 text-sm p-3 bg-red-500/10 rounded-lg border border-red-500/20 mb-4">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="mr-2" />
                  {result.error}
                </div>
              )}

              {viewMode === "visual" ? (
                result.engine === "postgres" && Array.isArray(result.plan_json) && result.plan_json.length > 0 ? (
                  <PlanNode node={(result.plan_json as Record<string, unknown>[])[0]["Plan"] as Record<string, unknown>} />
                ) : result.engine === "mysql" && Array.isArray(result.plan_json) ? (
                  <MysqlPlanTable plan={result.plan_json as Record<string, unknown>[]} />
                ) : (
                  <pre className="text-sm text-fg-muted font-mono whitespace-pre-wrap">{result.plan_text || "No plan data"}</pre>
                )
              ) : (
                <pre className="text-sm text-fg-muted font-mono whitespace-pre-wrap bg-surface-100 rounded-lg p-4">
                  {result.plan_text || "No plan text available"}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Educational info */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-5">
          <h3 className="text-sm font-semibold text-fg-strong mb-3">Understanding Query Plans</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="font-semibold text-amber-400 mb-1">⚠ Sequential Scan</p>
              <p className="text-fg-muted">Reads every row in the table. Indicates a missing index on the filtered column. Fine for small tables.</p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
              <p className="font-semibold text-green-400 mb-1">✓ Index Scan</p>
              <p className="text-fg-muted">Uses a B-tree (or other) index to find rows efficiently. Much faster for large tables with selective filters.</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <p className="font-semibold text-blue-400 mb-1">⚡ Index Only Scan</p>
              <p className="text-fg-muted">Reads data directly from the index without visiting the table. The fastest scan type when all needed columns are in the index.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
