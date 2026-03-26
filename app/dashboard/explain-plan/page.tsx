"use client";
import { useState, useMemo, Fragment } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faPlay, faSpinner, faDatabase, faLayerGroup, faBolt,
  faMagnifyingGlass, faChevronDown, faChevronRight, faTriangleExclamation,
  faSitemap, faToggleOn, faToggleOff, faCircleCheck, faChartBar,
  faFileLines, faLightbulb, faGaugeHigh, faClock, faKey,
  faTable, faCodeBranch, faCircleExclamation,
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

/* ─── Types ────────────────────────────────────────────────────────── */
interface Issue {
  severity: "critical" | "warning" | "info";
  message: string;
  suggestion: string;
}
interface ScoreInfo { label: string; color: string; bgColor: string; borderColor: string }

/* ─── Issue Detection ──────────────────────────────────────────────── */
function detectMysqlIssues(plan: Record<string, unknown>[]): Issue[] {
  const issues: Issue[] = [];
  for (const row of plan) {
    const type  = String(row.type  ?? "").toUpperCase();
    const table = String(row.table ?? "unknown");
    const key   = row.key;
    const extra = String(row.Extra ?? row.extra ?? "");
    const rows  = Number(row.rows ?? 0);
    if (type === "ALL") {
      issues.push({
        severity: rows > 1000 ? "critical" : "warning",
        message:    `Full table scan on \`${table}\` (${rows.toLocaleString()} estimated rows)`,
        suggestion: !key ? `Add an index on the WHERE clause column for \`${table}\`` : `Consider a covering index`,
      });
    }
    if (extra.toLowerCase().includes("using filesort")) {
      issues.push({
        severity: "warning",
        message:    `Extra sort pass (filesort) required on \`${table}\``,
        suggestion: `Add an index on the ORDER BY column(s) to eliminate the filesort step`,
      });
    }
    if (extra.toLowerCase().includes("using temporary")) {
      issues.push({
        severity: "warning",
        message:    `Temporary table created for \`${table}\``,
        suggestion: `Optimize GROUP BY or DISTINCT operations with proper indexes`,
      });
    }
  }
  return issues;
}

function detectPostgresIssues(root: Record<string, unknown>): Issue[] {
  const issues: Issue[] = [];
  function walk(n: Record<string, unknown>) {
    const nodeType = String(n["Node Type"] ?? "");
    const relation = String(n["Relation Name"] ?? "");
    const est = Number(n["Plan Rows"] ?? 0);
    const actual = n["Actual Rows"] !== undefined ? Number(n["Actual Rows"]) : undefined;
    if (nodeType === "Seq Scan" && relation) {
      issues.push({
        severity: est > 5000 ? "critical" : "warning",
        message:    `Sequential scan on \`${relation}\`${est > 0 ? ` (${est.toLocaleString()} rows)` : ""}`,
        suggestion: `Add an index on the filter column to enable an Index Scan`,
      });
    }
    if (nodeType === "Sort") {
      issues.push({
        severity: "info",
        message: `Sort operation detected`,
        suggestion: `Consider adding an index on the ORDER BY column(s) to avoid a runtime sort step`,
      });
    }
    if (actual !== undefined && est > 0) {
      const ratio = actual / est;
      if (ratio > 10 || ratio < 0.1) {
        issues.push({
          severity: "info",
          message:    `Row estimate mismatch on \`${relation || nodeType}\`: expected ${est.toLocaleString()}, got ${actual.toLocaleString()}`,
          suggestion: `Run ANALYZE on this table to refresh planner statistics`,
        });
      }
    }
    ((n["Plans"] as Record<string, unknown>[]) || []).forEach(walk);
  }
  walk(root);
  return issues;
}

function getMysqlScore(plan: Record<string, unknown>[]): ScoreInfo {
  const types = plan.map(r => String(r.type ?? "").toUpperCase());
  if (types.some(t => t === "ALL")) {
    const maxRows = Math.max(...plan.map(r => Number(r.rows ?? 0)));
    return maxRows > 1000
      ? { label: "Critical",  color: "text-red-400",   bgColor: "bg-red-500/10",   borderColor: "border-red-500/30" }
      : { label: "Warning",   color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30" };
  }
  if (types.every(t => ["CONST", "EQ_REF", "SYSTEM"].includes(t)))
    return { label: "Optimal", color: "text-blue-400",  bgColor: "bg-blue-500/10",  borderColor: "border-blue-500/30" };
  return { label: "Good", color: "text-green-400", bgColor: "bg-green-500/10", borderColor: "border-green-500/30" };
}

/* ─── Column tooltip map ───────────────────────────────────────────── */
const MYSQL_COL_HINTS: Record<string, string> = {
  id:            "Query step ID — higher IDs belong to subqueries",
  select_type:   "Type of SELECT: SIMPLE, SUBQUERY, DERIVED, UNION, etc.",
  table:         "Table being accessed in this step",
  partitions:    "Partitions examined (NULL if the table is not partitioned)",
  type:          "Access type — ALL is worst, const / eq_ref is best",
  possible_keys: "Indexes MySQL considered for this step",
  key:           "Index MySQL actually chose (NULL = no index used)",
  key_len:       "Bytes of the chosen index used — shorter = fewer columns matched",
  ref:           "Column(s) or constants compared against the key",
  rows:          "Estimated number of rows MySQL will examine",
  filtered:      "% of rows remaining after the WHERE filter is applied",
  Extra:         "Additional execution details (Using index, filesort, temporary…)",
};

/* ─── Type Badge ───────────────────────────────────────────────────── */
function TypeBadge({ type }: { type: string }) {
  const t = (type ?? "").toUpperCase();
  if (!t || t === "NULL") return <span className="text-fg-subtle italic text-xs">NULL</span>;
  if (t === "ALL")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
        <FontAwesomeIcon icon={faTriangleExclamation} /> ALL
      </span>
    );
  if (t === "INDEX")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <FontAwesomeIcon icon={faTable} /> INDEX
      </span>
    );
  if (t === "RANGE")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-green-500/15 text-green-400 border border-green-500/30">
        <FontAwesomeIcon icon={faCircleCheck} /> RANGE
      </span>
    );
  if (t === "REF" || t === "FULLTEXT")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-green-500/15 text-green-400 border border-green-500/30">
        <FontAwesomeIcon icon={faKey} /> {t}
      </span>
    );
  if (t === "EQ_REF" || t === "CONST" || t === "SYSTEM")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
        <FontAwesomeIcon icon={faBolt} /> {t}
      </span>
    );
  return <span className="font-mono text-xs bg-surface-100 px-1.5 py-0.5 rounded border border-surface-border text-fg-muted">{type}</span>;
}

/* ─── Enhanced MySQL table ─────────────────────────────────────────── */
function MysqlPlanTable({ plan }: { plan: Record<string, unknown>[] }) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  if (!plan.length) return null;

  const cols = Object.keys(plan[0]);
  const maxRows = Math.max(...plan.map(r => Number(r.rows ?? 0)), 1);

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-surface-100 sticky top-0 z-10">
          <tr>
            <th className="w-1 px-0 border-b border-surface-border" />
            {cols.map((c) => {
              const highlight = ["type","key","rows","extra"].includes(c.toLowerCase());
              return (
                <th key={c} className={cn(
                  "text-left px-3 py-2.5 font-semibold border-b border-surface-border whitespace-nowrap text-xs",
                  highlight ? "text-brand-400" : "text-fg-muted"
                )}>
                  {c}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {plan.map((row, ri) => {
            const typeVal  = String(row.type  ?? "").toUpperCase();
            const extraVal = String(row.Extra ?? row.extra ?? "");
            const rowCount = Number(row.rows ?? 0);
            const isExpanded = expandedRow === ri;

            const severity =
              typeVal === "ALL" ? (rowCount > 1000 ? "critical" : "warning") :
              ["EQ_REF","CONST","SYSTEM"].includes(typeVal) ? "optimal" :
              ["REF","RANGE"].includes(typeVal) ? "good" : "neutral";

            const barColor =
              severity === "critical" ? "bg-red-500" :
              severity === "warning"  ? "bg-amber-400" :
              severity === "good"     ? "bg-green-500" :
              severity === "optimal"  ? "bg-blue-400" : "bg-surface-300";

            return (
              <Fragment key={ri}>
                <tr
                  onClick={() => setExpandedRow(isExpanded ? null : ri)}
                  className={cn(
                    "border-b border-surface-border/40 cursor-pointer transition-colors group",
                    isExpanded ? "bg-brand-500/5" : "hover:bg-surface-50"
                  )}
                >
                  {/* severity bar */}
                  <td className="p-0 w-1">
                    <div className={cn("w-1 min-h-[38px] h-full rounded-l", barColor)} />
                  </td>

                  {cols.map((c) => {
                    const v      = row[c];
                    const cl     = c.toLowerCase();
                    const strVal = String(v ?? "");
                    const isNull = v === null || strVal === "NULL" || strVal === "";

                    if (cl === "type")
                      return <td key={c} className="px-3 py-2.5"><TypeBadge type={strVal} /></td>;

                    if (cl === "rows")
                      return (
                        <td key={c} className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-fg-muted">{strVal}</span>
                            <div className="w-14 h-1.5 bg-surface-200 rounded-full overflow-hidden flex-shrink-0">
                              <div
                                className={cn("h-full rounded-full",
                                  rowCount / maxRows > 0.6 ? "bg-red-400" :
                                  rowCount / maxRows > 0.3 ? "bg-amber-400" : "bg-brand-500"
                                )}
                                style={{ width: `${Math.max(4, (rowCount / maxRows) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      );

                    if (cl === "extra")
                      return (
                        <td key={c} className="px-3 py-2.5 max-w-[280px]">
                          {isNull ? <span className="text-fg-subtle italic text-xs">—</span> : (
                            <div className="flex flex-wrap gap-1">
                              {strVal.split(";").map((part, pi) => {
                                const p = part.trim();
                                if (!p) return null;
                                const lp = p.toLowerCase();
                                const cls =
                                  lp.includes("using index") && !lp.includes("condition")
                                    ? "text-green-400 bg-green-500/10 border-green-500/20" :
                                  lp.includes("filesort") || lp.includes("temporary")
                                    ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                                    : "text-fg-muted bg-surface-100 border-surface-border";
                                return (
                                  <span key={pi} className={cn("text-2xs px-1.5 py-0.5 rounded border font-mono", cls)}>
                                    {p}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      );

                    const hasKey = cl === "key" && !isNull;
                    const noKey  = cl === "key" && isNull;
                    return (
                      <td key={c} className={cn(
                        "px-3 py-2.5 font-mono text-xs max-w-[180px] truncate",
                        hasKey ? "text-green-400" : noKey ? "text-fg-subtle" : "text-fg-base"
                      )} title={strVal}>
                        {isNull ? <span className="text-fg-subtle italic">NULL</span> : strVal}
                      </td>
                    );
                  })}
                </tr>

                {/* Expanded detail row */}
                {isExpanded && (
                  <tr className="bg-surface-50/80 border-b border-surface-border/40">
                    <td />
                    <td colSpan={cols.length} className="px-4 py-4">
                      {/* Column explanations grid */}
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 mb-3">
                        {cols.filter(c => MYSQL_COL_HINTS[c.toLowerCase()] || MYSQL_COL_HINTS[c]).map((c) => {
                          const hint = MYSQL_COL_HINTS[c.toLowerCase()] ?? MYSQL_COL_HINTS[c];
                          const v = row[c];
                          if (!hint) return null;
                          return (
                            <div key={c} className="bg-surface-100 rounded-lg p-2.5 border border-surface-border">
                              <p className="font-semibold text-fg-strong text-2xs font-mono mb-0.5">{c}</p>
                              <p className="text-fg-subtle text-2xs leading-relaxed mb-1">{hint}</p>
                              <p className="font-mono text-brand-400 text-2xs bg-surface-200 px-1.5 py-0.5 rounded inline-block">
                                {v === null || String(v) === "NULL" || String(v) === "" ? "NULL" : String(v)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      {/* Inline tip badges */}
                      <div className="flex flex-wrap gap-2">
                        {extraVal.toLowerCase().includes("using filesort") && (
                          <span className="inline-flex items-center gap-1.5 text-2xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg">
                            <FontAwesomeIcon icon={faTriangleExclamation} />
                            Extra sort pass — add an index on the ORDER BY column(s)
                          </span>
                        )}
                        {extraVal.toLowerCase().includes("using temporary") && (
                          <span className="inline-flex items-center gap-1.5 text-2xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg">
                            <FontAwesomeIcon icon={faTriangleExclamation} />
                            Temporary table — optimize GROUP BY / DISTINCT with indexes
                          </span>
                        )}
                        {extraVal.toLowerCase().includes("using index") && !extraVal.toLowerCase().includes("condition") && (
                          <span className="inline-flex items-center gap-1.5 text-2xs text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1.5 rounded-lg">
                            <FontAwesomeIcon icon={faCircleCheck} />
                            Covering index — reads from index only (optimal)
                          </span>
                        )}
                        {typeVal === "ALL" && (
                          <span className="inline-flex items-center gap-1.5 text-2xs text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-lg">
                            <FontAwesomeIcon icon={faTable} />
                            Full table scan — every row is read. Add an index on the WHERE column.
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── PostgreSQL node meta ─────────────────────────────────────────── */
interface NodeMeta { icon: IconDefinition; color: string; bgColor: string; borderColor: string }
function getNodeMeta(nodeType: string): NodeMeta {
  if (nodeType === "Seq Scan")
    return { icon: faTable,      color: "text-amber-400",  bgColor: "bg-amber-500/10",  borderColor: "border-amber-500/30"  };
  if (nodeType.includes("Index Only"))
    return { icon: faBolt,       color: "text-blue-400",   bgColor: "bg-blue-500/10",   borderColor: "border-blue-500/30"   };
  if (nodeType.includes("Index"))
    return { icon: faKey,        color: "text-green-400",  bgColor: "bg-green-500/10",  borderColor: "border-green-500/30"  };
  if (nodeType.includes("Hash"))
    return { icon: faChartBar,   color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/30" };
  if (nodeType.includes("Sort"))
    return { icon: faFileLines,  color: "text-amber-400",  bgColor: "bg-amber-500/10",  borderColor: "border-amber-500/30"  };
  if (nodeType.includes("Loop") || nodeType.includes("Nested"))
    return { icon: faCodeBranch, color: "text-cyan-400",   bgColor: "bg-cyan-500/10",   borderColor: "border-cyan-500/30"   };
  if (nodeType.includes("Merge"))
    return { icon: faCodeBranch, color: "text-indigo-400", bgColor: "bg-indigo-500/10", borderColor: "border-indigo-500/30" };
  return      { icon: faSitemap, color: "text-brand-400",  bgColor: "bg-brand-500/10",  borderColor: "border-brand-500/30"  };
}

/* ─── Collapsible PostgreSQL Plan Node ─────────────────────────────── */
function PlanNode({
  node, depth = 0, rootCost,
}: {
  node: Record<string, unknown>;
  depth?: number;
  rootCost?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const nodeType  = (node["Node Type"]     as string)                    || "Unknown";
  const relation  = node["Relation Name"]  as string | undefined;
  const alias     = node["Alias"]          as string | undefined;
  const cost      = node["Total Cost"]     as number | undefined;
  const rows      = node["Plan Rows"]      as number | undefined;
  const actualTime = node["Actual Total Time"] as number | undefined;
  const actualRows = node["Actual Rows"]   as number | undefined;
  const width     = node["Plan Width"]     as number | undefined;
  const filter    = node["Filter"]         as string | undefined;
  const indexName = node["Index Name"]     as string | undefined;
  const children  = (node["Plans"] as Record<string, unknown>[]) || [];

  const meta      = getNodeMeta(nodeType);
  const costPct   = rootCost && cost ? Math.min(100, Math.round((cost / rootCost) * 100)) : null;
  const isWarning = nodeType === "Seq Scan" || nodeType === "Sort";

  return (
    <div className={cn("relative", depth > 0 && "ml-6 mt-2")}>
      {depth > 0 && (
        <div className="absolute left-[-13px] top-0 bottom-0 border-l-2 border-dashed border-surface-border/40" />
      )}
      {depth > 0 && (
        <div className="absolute left-[-13px] top-[20px] w-3 border-t-2 border-dashed border-surface-border/40" />
      )}

      <div className={cn("rounded-xl border transition-all", meta.borderColor, meta.bgColor,
        isWarning && depth === 0 && "ring-1 ring-amber-500/20"
      )}>
        {/* Node header — clickable to collapse */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
          onClick={() => setExpanded(!expanded)}
        >
          <FontAwesomeIcon
            icon={expanded ? faChevronDown : faChevronRight}
            className="text-fg-subtle text-2xs flex-shrink-0 w-3"
          />
          <span className={cn("flex items-center gap-1.5 font-semibold text-sm", meta.color)}>
            <FontAwesomeIcon icon={meta.icon} className="text-xs" />
            {nodeType}
          </span>
          {relation && (
            <span className="text-xs text-fg-muted bg-surface-100/60 px-2 py-0.5 rounded border border-surface-border/40">
              on {alias || relation}
            </span>
          )}
          {indexName && (
            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
              <FontAwesomeIcon icon={faKey} className="mr-1 text-2xs" />
              {indexName}
            </span>
          )}
          {/* Cost bar + label */}
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {costPct !== null && (
              <div className="flex items-center gap-1.5 hidden sm:flex">
                <div className="w-20 h-1.5 bg-surface-200 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all",
                      costPct > 60 ? "bg-red-400" :
                      costPct > 30 ? "bg-amber-400" : "bg-green-400"
                    )}
                    style={{ width: `${costPct}%` }}
                  />
                </div>
                <span className="text-2xs text-fg-subtle font-mono w-7 text-right">{costPct}%</span>
              </div>
            )}
            {cost !== undefined && (
              <span className="text-2xs text-fg-subtle font-mono">
                {cost.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Expanded metrics panel */}
        {expanded && (
          <div className="px-3 pb-3 pt-1 border-t border-surface-border/20">
            <div className="flex gap-4 text-xs text-fg-subtle flex-wrap">
              {rows !== undefined && (
                <span className="flex items-center gap-1">
                  <FontAwesomeIcon icon={faChartBar} className="text-2xs" />
                  Est.&nbsp;Rows:&nbsp;<span className="text-fg-muted font-mono">{rows.toLocaleString()}</span>
                </span>
              )}
              {width !== undefined && (
                <span>Width:&nbsp;<span className="text-fg-muted font-mono">{width}</span></span>
              )}
              {actualTime !== undefined && (
                <span className="flex items-center gap-1">
                  <FontAwesomeIcon icon={faClock} className="text-2xs text-brand-400" />
                  <span className="text-brand-400 font-mono">{actualTime.toFixed(3)} ms</span>
                </span>
              )}
              {actualRows !== undefined && (
                <span>
                  Actual&nbsp;Rows:&nbsp;<span className="text-brand-400 font-mono">{actualRows.toLocaleString()}</span>
                </span>
              )}
            </div>
            {filter && (
              <div className="mt-1.5 text-xs">
                <span className="text-fg-subtle">Filter:&nbsp;</span>
                <span className="font-mono text-2xs text-fg-muted bg-surface-100 px-1.5 py-0.5 rounded">{filter}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {expanded && children.map((child, i) => (
        <PlanNode key={i} node={child} depth={depth + 1} rootCost={rootCost ?? cost} />
      ))}
    </div>
  );
}

/* ─── Performance Summary strip ────────────────────────────────────── */
function PerformanceSummary({ result, issues }: { result: ExplainResult; issues: Issue[] }) {
  const mysqlPlan = result.engine === "mysql" && Array.isArray(result.plan_json)
    ? (result.plan_json as Record<string, unknown>[]) : null;
  const pgRoot = result.engine === "postgres" && Array.isArray(result.plan_json) && result.plan_json.length > 0
    ? ((result.plan_json as Record<string, unknown>[])[0]?.["Plan"] as Record<string, unknown> | undefined) : null;

  const score      = mysqlPlan ? getMysqlScore(mysqlPlan) : null;
  const totalCost  = pgRoot ? (pgRoot["Total Cost"] as number | undefined) : undefined;
  const totalRows  = mysqlPlan
    ? mysqlPlan.reduce((s, r) => s + Number(r.rows ?? 0), 0)
    : pgRoot ? (pgRoot["Plan Rows"] as number | undefined) : undefined;

  const criticals  = issues.filter(i => i.severity === "critical").length;
  const warnings   = issues.filter(i => i.severity === "warning").length;
  const issueScore = criticals > 0 ? "critical" : warnings > 0 ? "warning" : "ok";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Performance score (MySQL only) */}
      {score ? (
        <div className={cn("rounded-xl border p-4 flex flex-col gap-1", score.borderColor, score.bgColor)}>
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faGaugeHigh} className={cn("text-sm", score.color)} />
            <span className="text-xs text-fg-subtle">Performance</span>
          </div>
          <p className={cn("text-xl font-bold tracking-tight", score.color)}>{score.label}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-border bg-surface-50 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faDatabase} className="text-sm text-brand-400" />
            <span className="text-xs text-fg-subtle">Engine</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-fg-strong">
            {result.engine === "postgres" ? "PostgreSQL" : "MySQL"}
          </p>
        </div>
      )}

      {/* Est. Cost */}
      {totalCost !== undefined ? (
        <div className="rounded-xl border border-surface-border bg-surface-50 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faGaugeHigh} className="text-sm text-brand-400" />
            <span className="text-xs text-fg-subtle">Est. Cost</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-fg-strong font-mono">{totalCost.toFixed(2)}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-border bg-surface-50 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faGaugeHigh} className="text-sm text-fg-subtle" />
            <span className="text-xs text-fg-subtle">Est. Cost</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-fg-subtle">—</p>
        </div>
      )}

      {/* Rows */}
      <div className="rounded-xl border border-surface-border bg-surface-50 p-4 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faChartBar} className="text-sm text-brand-400" />
          <span className="text-xs text-fg-subtle">Est. Rows</span>
        </div>
        <p className="text-xl font-bold tracking-tight text-fg-strong font-mono">
          {totalRows !== undefined ? totalRows.toLocaleString() : "—"}
        </p>
      </div>

      {/* Issues */}
      <div className={cn("rounded-xl border p-4 flex flex-col gap-1",
        issueScore === "critical" ? "border-red-500/30 bg-red-500/5" :
        issueScore === "warning"  ? "border-amber-500/30 bg-amber-500/5" :
        "border-green-500/30 bg-green-500/5"
      )}>
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faCircleExclamation} className={cn("text-sm",
            issueScore === "critical" ? "text-red-400" :
            issueScore === "warning"  ? "text-amber-400" : "text-green-400"
          )} />
          <span className="text-xs text-fg-subtle">Issues</span>
        </div>
        <p className={cn("text-xl font-bold tracking-tight",
          issueScore === "critical" ? "text-red-400" :
          issueScore === "warning"  ? "text-amber-400" : "text-green-400"
        )}>
          {issues.length === 0 ? "None" : issues.length}
        </p>
      </div>
    </div>
  );
}

/* ─── Issues & Suggestions panel ───────────────────────────────────── */
function IssuesPanel({ issues }: { issues: Issue[] }) {
  if (!issues.length)
    return (
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 flex items-center gap-3">
        <FontAwesomeIcon icon={faCircleCheck} className="text-green-400 text-base flex-shrink-0" />
        <span className="text-sm text-green-400 font-medium">
          No issues detected — the query looks efficient.
        </span>
      </div>
    );

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-border bg-surface-50 flex items-center gap-2">
        <FontAwesomeIcon icon={faLightbulb} className="text-amber-400 text-sm" />
        <h3 className="text-sm font-semibold text-fg-strong">Issues &amp; Suggestions</h3>
        <span className="ml-auto text-2xs text-fg-subtle bg-surface-100 px-2 py-0.5 rounded border border-surface-border">
          {issues.length} found
        </span>
      </div>
      <div className="divide-y divide-surface-border/40">
        {issues.map((issue, i) => (
          <div key={i} className="px-4 py-3 flex gap-3 items-start hover:bg-surface-50 transition-colors">
            <FontAwesomeIcon
              icon={
                issue.severity === "critical" ? faCircleExclamation :
                issue.severity === "warning"  ? faTriangleExclamation : faMagnifyingGlass
              }
              className={cn("flex-shrink-0 mt-0.5 text-sm",
                issue.severity === "critical" ? "text-red-400" :
                issue.severity === "warning"  ? "text-amber-400" : "text-blue-400"
              )}
            />
            <div className="min-w-0">
              <p className="text-sm text-fg-base font-mono">{issue.message}</p>
              <p className="text-xs text-fg-muted mt-0.5 flex items-center gap-1">
                <FontAwesomeIcon icon={faLightbulb} className="text-2xs text-amber-400/70 flex-shrink-0" />
                {issue.suggestion}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Empty / idle state ───────────────────────────────────────────── */
const EXAMPLE_QUERIES: { label: string; dbType: string; query: string }[] = [
  { label: "Full scan (needs index)",  dbType: "mysql",    query: "SELECT * FROM customers WHERE last_name = 'Smith';" },
  { label: "Primary key (fast)",       dbType: "mysql",    query: "SELECT * FROM customers WHERE id = 1;" },
  { label: "PG system tables",         dbType: "postgres", query: "SELECT * FROM pg_tables WHERE schemaname = 'public';" },
];

function EmptyState({ onUse, dbType }: { onUse: (q: string) => void; dbType: DbType }) {
  const examples = EXAMPLE_QUERIES.filter(e => e.dbType === dbType);
  return (
    <div className="rounded-xl border border-dashed border-surface-border bg-surface-50/40 px-8 py-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-4">
        <FontAwesomeIcon icon={faSitemap} className="text-brand-400 text-xl" />
      </div>
      <h3 className="text-base font-semibold text-fg-strong mb-1">No query analyzed yet</h3>
      <p className="text-sm text-fg-muted max-w-sm mx-auto mb-6">
        Select a cluster, write a SQL query, and click <strong className="text-fg-base">EXPLAIN</strong> to visualize how the database engine will execute it.
      </p>
      {examples.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-fg-subtle mb-1">Try an example query:</p>
          {examples.map((ex) => (
            <button
              key={ex.label}
              onClick={() => onUse(ex.query)}
              className="group flex items-center gap-2 text-xs font-mono text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/20 px-4 py-2 rounded-lg transition-colors"
            >
              <FontAwesomeIcon icon={faPlay} className="text-2xs opacity-60 group-hover:opacity-100" />
              <span>{ex.query}</span>
              <span className="ml-1 text-2xs text-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity">
                — {ex.label}
              </span>
            </button>
          ))}
        </div>
      )}
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
  const [clusterId, setClusterId]   = useState("");
  const selectedCluster             = runningClusters.find((c) => c.id === clusterId);
  const dbType                      = (selectedCluster?.db_type || "postgres") as DbType;
  const { data: databases = [] }    = useDatabases(clusterId);
  const [database, setDatabase]     = useState("");
  const [query, setQuery]           = useState("");
  const [analyze, setAnalyze]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<ExplainResult | null>(null);
  const [viewMode, setViewMode]     = useState<"visual" | "text">("visual");

  const handleClusterChange = (cid: string) => {
    setClusterId(cid);
    setDatabase("");
    setResult(null);
    const cluster = runningClusters.find((c) => c.id === cid);
    const type = cluster?.db_type || "postgres";
    setQuery(
      type === "mysql"
        ? "SELECT * FROM customers WHERE last_name = 'Smith';"
        : "SELECT * FROM pg_tables WHERE schemaname = 'public';"
    );
  };

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

  /* Compute issues from results */
  const issues: Issue[] = useMemo(() => {
    if (!result) return [];
    if (result.engine === "mysql" && Array.isArray(result.plan_json))
      return detectMysqlIssues(result.plan_json as Record<string, unknown>[]);
    if (result.engine === "postgres" && Array.isArray(result.plan_json) && result.plan_json.length > 0) {
      const root = (result.plan_json as Record<string, unknown>[])[0]?.["Plan"] as Record<string, unknown> | undefined;
      if (root) return detectPostgresIssues(root);
    }
    return [];
  }, [result]);

  const pgRoot = result?.engine === "postgres" && Array.isArray(result.plan_json) && result.plan_json.length > 0
    ? ((result.plan_json as Record<string, unknown>[])[0]?.["Plan"] as Record<string, unknown> | undefined)
    : undefined;

  return (
    <>
      <Topbar title="EXPLAIN Plan Viewer" subtitle="Visualize query execution plans" />

      <div className="p-6 space-y-5 max-w-[1400px] mx-auto">

        {/* ── Controls ──────────────────────────────────────────────── */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faSitemap} className="text-brand-500 text-sm" />
            <h2 className="text-sm font-semibold text-fg-strong">Query Plan Analysis</h2>
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
                <option value="">Default</option>
                {databases.map((d: { name: string }) => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
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

          <div>
            <label className="text-xs text-fg-subtle block mb-1">SQL Query</label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={4}
              placeholder={
                dbType === "mysql"
                  ? "Enter a SELECT query to analyze…\nSELECT * FROM customers WHERE last_name = 'Smith';"
                  : "Enter a SELECT or DML query to analyze…"
              }
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
              {loading ? "Analyzing…" : analyze ? "EXPLAIN ANALYZE" : "EXPLAIN"}
            </button>
            {analyze && (
              <span className="text-2xs text-amber-400 flex items-center gap-1.5">
                <FontAwesomeIcon icon={faTriangleExclamation} />
                ANALYZE actually executes the query
              </span>
            )}
          </div>
        </div>

        {/* ── Loading skeleton ───────────────────────────────────────── */}
        {loading && (
          <div className="rounded-xl border border-surface-border bg-surface-card p-6 space-y-3 animate-pulse">
            <div className="h-4 w-40 bg-surface-200 rounded" />
            <div className="grid grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="h-16 bg-surface-100 rounded-xl" />)}
            </div>
            <div className="h-32 bg-surface-100 rounded-xl" />
          </div>
        )}

        {/* ── Results ───────────────────────────────────────────────── */}
        {result && !loading && (
          <>
            {/* Performance summary */}
            <PerformanceSummary result={result} issues={issues} />

            {/* Error banner */}
            {result.error && (
              <div className="text-red-400 text-sm p-4 bg-red-500/10 rounded-xl border border-red-500/20 flex items-center gap-2">
                <FontAwesomeIcon icon={faTriangleExclamation} className="flex-shrink-0" />
                {result.error}
              </div>
            )}

            {/* Execution plan */}
            <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-surface-border bg-surface-50">
                <div className="flex items-center gap-3">
                  <FontAwesomeIcon icon={faCodeBranch} className="text-brand-400 text-sm" />
                  <h3 className="text-sm font-semibold text-fg-strong">Execution Plan</h3>
                  <span className="text-2xs text-fg-subtle bg-surface-100 px-2 py-0.5 rounded border border-surface-border">
                    {result.engine === "postgres" ? "PostgreSQL" : "MySQL"}
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode("visual")}
                    className={cn(
                      "px-3 py-1 text-xs rounded-md transition-all",
                      viewMode === "visual" ? "bg-brand-600 text-white shadow-sm" : "text-fg-muted hover:text-fg-base"
                    )}
                  >
                    Visual
                  </button>
                  <button
                    onClick={() => setViewMode("text")}
                    className={cn(
                      "px-3 py-1 text-xs rounded-md transition-all",
                      viewMode === "text" ? "bg-brand-600 text-white shadow-sm" : "text-fg-muted hover:text-fg-base"
                    )}
                  >
                    Raw Text
                  </button>
                </div>
              </div>

              <div className="p-5 overflow-auto max-h-[600px]">
                {viewMode === "visual" ? (
                  result.engine === "postgres" && pgRoot ? (
                    <PlanNode node={pgRoot} rootCost={pgRoot["Total Cost"] as number | undefined} />
                  ) : result.engine === "mysql" && Array.isArray(result.plan_json) ? (
                    <MysqlPlanTable plan={result.plan_json as Record<string, unknown>[]} />
                  ) : (
                    <pre className="text-sm text-fg-muted font-mono whitespace-pre-wrap">{result.plan_text || "No plan data"}</pre>
                  )
                ) : (
                  <pre className="text-sm text-fg-muted font-mono whitespace-pre-wrap bg-surface-100 rounded-xl p-4">
                    {result.plan_text || "No plan text available"}
                  </pre>
                )}
              </div>
            </div>

            {/* Issues & suggestions */}
            <IssuesPanel issues={issues} />
          </>
        )}

        {/* ── Idle / empty state ────────────────────────────────────── */}
        {!result && !loading && (
          <EmptyState onUse={(q) => setQuery(q)} dbType={dbType} />
        )}

        {/* ── Reference cards ───────────────────────────────────────── */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-5">
          <h3 className="text-sm font-semibold text-fg-strong mb-3">Understanding Query Plans</h3>
          {dbType === "mysql" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <p className="font-semibold text-amber-400 mb-1 flex items-center gap-1.5"><FontAwesomeIcon icon={faTriangleExclamation} /> type: ALL (Full Table Scan)</p>
                <p className="text-fg-muted">Reads every row in the table. Usually means a missing index on the WHERE column. Fine for small tables (&lt;1000 rows).</p>
              </div>
              <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                <p className="font-semibold text-green-400 mb-1 flex items-center gap-1.5"><FontAwesomeIcon icon={faCircleCheck} /> type: ref / range</p>
                <p className="text-fg-muted"><strong>ref</strong>: Uses an index for equality lookups. <strong>range</strong>: Uses an index for BETWEEN, &lt;, &gt; conditions. Both are efficient.</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <p className="font-semibold text-blue-400 mb-1 flex items-center gap-1.5"><FontAwesomeIcon icon={faBolt} /> type: const / eq_ref</p>
                <p className="text-fg-muted"><strong>const</strong>: At most one matching row (PRIMARY KEY lookup). <strong>eq_ref</strong>: One row per join via unique index. The fastest access types.</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                <p className="font-semibold text-purple-400 mb-1 flex items-center gap-1.5"><FontAwesomeIcon icon={faChartBar} /> key &amp; key_len</p>
                <p className="text-fg-muted"><strong>key</strong>: Which index MySQL chose. <strong>key_len</strong>: How many bytes of the index are used — shorter means fewer columns matched.</p>
              </div>
              <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                <p className="font-semibold text-cyan-400 mb-1 flex items-center gap-1.5"><FontAwesomeIcon icon={faMagnifyingGlass} /> Extra: Using where / Using index</p>
                <p className="text-fg-muted"><strong>Using index</strong>: Covering index — reads data from index only (fast). <strong>Using filesort</strong>: Needs extra sort pass (consider indexing ORDER BY).</p>
              </div>
              <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                <p className="font-semibold text-orange-400 mb-1 flex items-center gap-1.5"><FontAwesomeIcon icon={faFileLines} /> rows &amp; filtered</p>
                <p className="text-fg-muted"><strong>rows</strong>: Estimated rows to examine. <strong>filtered</strong>: % of rows remaining after WHERE. Low filtered % with high rows counts = needs optimization.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <p className="font-semibold text-amber-400 mb-1 flex items-center gap-1.5"><FontAwesomeIcon icon={faTriangleExclamation} /> Sequential Scan</p>
                <p className="text-fg-muted">Reads every row in the table. Indicates a missing index on the filtered column. Fine for small tables.</p>
              </div>
              <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                <p className="font-semibold text-green-400 mb-1 flex items-center gap-1.5"><FontAwesomeIcon icon={faCircleCheck} /> Index Scan</p>
                <p className="text-fg-muted">Uses a B-tree (or other) index to find rows efficiently. Much faster for large tables with selective filters.</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <p className="font-semibold text-blue-400 mb-1 flex items-center gap-1.5"><FontAwesomeIcon icon={faBolt} /> Index Only Scan</p>
                <p className="text-fg-muted">Reads data directly from the index without visiting the table. The fastest scan type when all needed columns are in the index.</p>
              </div>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
