"use client";
import { useState, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay, faTrash, faSpinner, faDatabase, faCircleDot,
  faServer, faCode,
} from "@fortawesome/free-solid-svg-icons";
import { useClusters, useExecuteQuery } from "@/hooks/useClusters";
import Topbar from "@/components/layout/Topbar";
import type { ClusterListItem, QueryResult } from "@/types";
import clsx from "clsx";

const SAMPLE_QUERIES = [
  "SELECT version();",
  "SELECT current_database(), current_user;",
  "SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public';",
  "SELECT pid, usename, application_name, state, query FROM pg_stat_activity LIMIT 20;",
  "SELECT pg_size_pretty(pg_database_size(current_database()));",
];

export default function QueryEditorPage() {
  const { data: clusters = [] } = useClusters("running");
  const { mutate: execQuery, isPending } = useExecuteQuery();
  const [selectedClusterId, setSelectedClusterId] = useState("");
  const [query, setQuery] = useState("SELECT version();");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const handleRun = () => {
    if (!selectedClusterId || !query.trim()) return;
    execQuery(
      { clusterId: selectedClusterId, query },
      {
        onSuccess: (data) => {
          setResult(data);
          setHistory((h) => [query, ...h.slice(0, 19)]);
        },
      }
    );
  };

  return (
    <div className="min-h-full">
      <Topbar title="Query Editor" subtitle="Execute SQL on any running cluster" />

      <div className="p-6 space-y-4">
        {/* Cluster picker */}
        <div className="card">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <FontAwesomeIcon icon={faDatabase} className="text-brand-400 shrink-0" />
              <select
                className="input"
                value={selectedClusterId}
                onChange={(e) => setSelectedClusterId(e.target.value)}
              >
                <option value="">-- Select a running cluster --</option>
                {clusters.map((c: ClusterListItem) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({(c.db_type ?? "PG").toUpperCase()} {c.db_version})
                  </option>
                ))}
              </select>
            </div>
            {clusters.length === 0 && (
              <p className="text-xs text-yellow-400 flex items-center gap-1.5">
                <FontAwesomeIcon icon={faCircleDot} className="animate-pulse" />
                No running clusters found. Start a cluster first.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Sidebar: sample + history */}
          <div className="space-y-4">
            <div className="card">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Sample Queries
              </p>
              <div className="space-y-1.5">
                {SAMPLE_QUERIES.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(q)}
                    className="w-full text-left px-2.5 py-2 rounded-lg bg-surface-100 hover:bg-surface-200 text-xs text-slate-400 hover:text-white transition-colors font-mono line-clamp-2"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {history.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">History</p>
                  <button onClick={() => setHistory([])} className="text-xs text-red-400 hover:text-red-300">
                    Clear
                  </button>
                </div>
                <div className="space-y-1.5">
                  {history.slice(0, 8).map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(q)}
                      className="w-full text-left px-2.5 py-2 rounded-lg bg-surface-100 hover:bg-surface-200 text-xs text-slate-400 hover:text-white transition-colors font-mono line-clamp-1"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Main editor + results */}
          <div className="lg:col-span-3 space-y-4">
            {/* Editor */}
            <div className="card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border bg-surface-100">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faCode} className="text-brand-400 text-xs" />
                  <span className="text-xs font-medium text-slate-300">SQL Editor</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setQuery("")}
                    className="btn-secondary text-xs py-1"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                    Clear
                  </button>
                  <button
                    onClick={handleRun}
                    disabled={isPending || !selectedClusterId || !query.trim()}
                    className="btn-primary text-xs py-1"
                  >
                    {isPending ? (
                      <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                    ) : (
                      <FontAwesomeIcon icon={faPlay} />
                    )}
                    Run Query
                  </button>
                </div>
              </div>
              <textarea
                className="w-full bg-[#0d1117] text-slate-300 font-mono text-sm p-4 resize-none focus:outline-none min-h-[180px]"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleRun();
                  }
                }}
                spellCheck={false}
                placeholder="Type your SQL here... (Ctrl+Enter to run)"
              />
            </div>

            {/* Results */}
            {result && (
              <div className="card p-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border bg-surface-100">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-300">Results</span>
                    {!result.error ? (
                      <>
                        <span className="text-xs text-green-400">
                          {result.row_count} row{result.row_count !== 1 ? "s" : ""}
                        </span>
                        <span className="text-xs text-slate-500">
                          {result.execution_time_ms}ms
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-red-400">Error</span>
                    )}
                  </div>
                </div>

                {result.error ? (
                  <div className="p-4 bg-red-500/5 border-t border-red-500/20">
                    <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap">
                      {result.error}
                    </pre>
                  </div>
                ) : result.columns.length > 0 ? (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-surface-100">
                        <tr>
                          {result.columns.map((col) => (
                            <th
                              key={col}
                              className="text-left px-4 py-2.5 text-slate-400 font-semibold border-b border-surface-border whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, ri) => (
                          <tr
                            key={ri}
                            className="border-b border-surface-border/50 hover:bg-surface-100/50 transition-colors"
                          >
                            {row.map((cell, ci) => (
                              <td
                                key={ci}
                                className="px-4 py-2.5 text-slate-300 font-mono max-w-[300px] truncate"
                                title={String(cell ?? "")}
                              >
                                {cell === null ? (
                                  <span className="text-slate-600 italic">NULL</span>
                                ) : (
                                  String(cell)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 text-xs text-green-400 text-center">
                    Query executed successfully (no rows returned).
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
