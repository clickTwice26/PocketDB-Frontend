"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay, faTrash, faSpinner, faDatabase, faCircleDot,
  faCode, faTerminal, faTriangleExclamation, faCopy, faCheck,
  faLayerGroup, faBolt, faLightbulb, faClockRotateLeft,
  faExpand, faCompress,
} from "@fortawesome/free-solid-svg-icons";
import { useClusters, useExecuteQuery } from "@/hooks/useClusters";
import Topbar from "@/components/layout/Topbar";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/utils";
import type { ClusterListItem, QueryResult } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const SNIPPETS: Record<string, { label: string; query: string }[]> = {
  postgres: [
    { label: "Version", query: "SELECT version();" },
    { label: "Current DB & User", query: "SELECT current_database(), current_user;" },
    { label: "List Tables", query: "SELECT schemaname, tablename FROM pg_tables\nWHERE schemaname = 'public';" },
    { label: "Active Sessions", query: "SELECT pid, usename, application_name, state, query\nFROM pg_stat_activity LIMIT 20;" },
    { label: "DB Size", query: "SELECT pg_size_pretty(pg_database_size(current_database()));" },
    { label: "Table Sizes", query: "SELECT relname AS table, pg_size_pretty(pg_total_relation_size(relid))\nFROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;" },
  ],
  mysql: [
    { label: "Version", query: "SELECT version();" },
    { label: "Databases", query: "SHOW DATABASES;" },
    { label: "Tables", query: "SHOW TABLES;" },
    { label: "Table Sizes", query: "SELECT table_name, table_rows\nFROM information_schema.tables\nWHERE table_schema = DATABASE() LIMIT 20;" },
    { label: "Users", query: "SELECT user, host FROM mysql.user;" },
    { label: "Process List", query: "SHOW FULL PROCESSLIST;" },
  ],
  redis: [
    { label: "Ping", query: "PING" },
    { label: "Server Info", query: "INFO server" },
    { label: "DB Size", query: "DBSIZE" },
    { label: "All Keys", query: "KEYS *" },
    { label: "Set a Key", query: 'SET mykey "Hello, Redis!"' },
    { label: "Get a Key", query: "GET mykey" },
    { label: "Key TTL", query: "TTL mykey" },
    { label: "Delete Key", query: "DEL mykey" },
    { label: "Memory Usage", query: "INFO memory" },
    { label: "Client List", query: "CLIENT LIST" },
  ],
};

const DEFAULT_QUERY: Record<string, string> = {
  postgres: "SELECT version();",
  mysql: "SELECT version();",
  redis: "PING",
};

const DB_META = {
  postgres: { icon: faDatabase,    color: "text-blue-400",   bg: "bg-blue-500/10",   label: "PostgreSQL" },
  mysql:    { icon: faLayerGroup,  color: "text-orange-400", bg: "bg-orange-500/10", label: "MySQL"      },
  redis:    { icon: faBolt,        color: "text-red-400",    bg: "bg-red-500/10",    label: "Redis"      },
} as const;

type DbType = keyof typeof DB_META;

// ─── Sub-components ───────────────────────────────────────────────────────────

function RedisOutput({ result }: { result: QueryResult }) {
  const isList  = result.columns.length === 1 && result.rows.length > 1;
  const isMap   = result.columns[0] === "field" && result.columns[1] === "value";
  const isSingle = !isList && !isMap;

  if (isMap) {
    return (
      <div className="p-5 font-mono text-sm space-y-1">
        {result.rows.map((row, i) => (
          <div key={i} className="flex gap-4 min-w-0">
            <span className="text-brand-400 shrink-0 w-44 truncate">{String(row[0])}</span>
            <span className="text-fg-base break-all">{String(row[1] ?? "")}</span>
          </div>
        ))}
      </div>
    );
  }
  if (isList) {
    return (
      <div className="p-5 font-mono text-sm space-y-0.5">
        {result.rows.map((row, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-fg-subtle select-none w-7 text-right shrink-0 tabular-nums">{i + 1})</span>
            <span className="text-green-400">{String(row[0] ?? "(nil)")}</span>
          </div>
        ))}
      </div>
    );
  }
  const val = result.rows[0]?.[0];
  return (
    <div className="p-5 font-mono text-sm">
      <span className={val === "(nil)" ? "text-fg-subtle italic" : "text-green-400"}>
        {String(val ?? "(empty)")}
      </span>
    </div>
  );
}

function SqlTable({ result }: { result: QueryResult }) {
  if (result.columns.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-green-400">
          ✓ Query executed —{" "}
          {result.row_count > 0
            ? `${result.row_count} row${result.row_count !== 1 ? "s" : ""} affected`
            : "no rows returned"}
        </p>
      </div>
    );
  }
  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-0 z-10 bg-surface-100">
        <tr>
          {result.columns.map((col) => (
            <th key={col} className="text-left px-4 py-2.5 text-fg-muted font-semibold border-b border-surface-border whitespace-nowrap">
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row, ri) => (
          <tr key={ri} className="border-b border-surface-border/40 hover:bg-surface-50 transition-colors">
            {row.map((cell, ci) => (
              <td key={ci} className="px-4 py-2 text-fg-base font-mono max-w-[280px] truncate" title={String(cell ?? "")}>
                {cell === null
                  ? <span className="text-fg-subtle italic">NULL</span>
                  : String(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QueryEditorPage() {
  const { data: clusters = [] } = useClusters("running");
  const { mutate: execQuery, isPending } = useExecuteQuery();

  const selectedClusterId = useUIStore((s) => s.selectedClusterId) ?? "";
  const setSelectedClusterId = useUIStore((s) => s.setSelectedClusterId);
  const [query, setQuery]   = useState("SELECT version();");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [history, setHistory] = useState<{ query: string; time: Date }[]>([]);
  const [copied, setCopied]   = useState(false);
  const [activeTab, setActiveTab] = useState<"snippets" | "history">("snippets");

  const zenMode = useUIStore((s) => s.zenMode);
  const toggleZenMode = useUIStore((s) => s.toggleZenMode);
  const setZenMode = useUIStore((s) => s.setZenMode);

  // Escape key exits zen mode
  useEffect(() => {
    if (!zenMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZenMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zenMode, setZenMode]);

  const selectedCluster = useMemo(
    () => clusters.find((c: ClusterListItem) => c.id === selectedClusterId) ?? null,
    [clusters, selectedClusterId],
  );

  const dbType  = ((selectedCluster?.db_type ?? "postgres") as DbType);
  const isRedis = dbType === "redis";
  const meta    = DB_META[dbType] ?? DB_META.postgres;
  const snippets = SNIPPETS[dbType] ?? SNIPPETS.postgres;

  const handleSelectCluster = (id: string) => {
    setSelectedClusterId(id || null);
    const c = clusters.find((c: ClusterListItem) => c.id === id);
    setQuery(DEFAULT_QUERY[c?.db_type ?? "postgres"] ?? DEFAULT_QUERY.postgres);
    setResult(null);
  };

  const handleRun = useCallback(() => {
    if (!selectedClusterId || !query.trim()) return;
    execQuery(
      { clusterId: selectedClusterId, query },
      {
        onSuccess: (data) => {
          setResult(data);
          setHistory((h) => [{ query, time: new Date() }, ...h.slice(0, 29)]);
        },
      },
    );
  }, [selectedClusterId, query, execQuery]);

  const handleCopy = useCallback(() => {
    if (!result) return;
    let text = "";
    if (isRedis) {
      text = result.rows.map((r) => r.join("\t")).join("\n");
    } else {
      text = result.columns.join("\t") + "\n" +
        result.rows.map((r) => r.map((c) => String(c ?? "")).join("\t")).join("\n");
    }
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result, isRedis]);

  const relTime = (d: Date) => {
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {!zenMode && <Topbar title="Query Editor" subtitle="Execute SQL or Redis commands on any running cluster" />}

      {/* ── Cluster toolbar ───────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 border-b border-surface-border bg-surface-50/70">
        <div className={cn("flex items-center justify-center w-7 h-7 rounded-md shrink-0", meta.bg)}>
          <FontAwesomeIcon icon={meta.icon} className={cn("text-xs", meta.color)} />
        </div>

        <select
          className="input flex-1 max-w-xs text-sm py-1.5"
          value={selectedClusterId}
          onChange={(e) => handleSelectCluster(e.target.value)}
        >
          <option value="">— Select a running cluster —</option>
          {clusters.map((c: ClusterListItem) => (
            <option key={c.id} value={c.id}>
              {c.name} · {(c.db_type ?? "postgres").toUpperCase()} {c.db_version}
            </option>
          ))}
        </select>

        {selectedCluster && (
          <span className={cn("hidden sm:inline-flex items-center gap-1.5 text-2xs font-semibold px-2 py-1 rounded-md", meta.bg, meta.color)}>
            <FontAwesomeIcon icon={meta.icon} className="text-[10px]" />
            {meta.label} {selectedCluster.db_version}
          </span>
        )}
        {clusters.length === 0 && (
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-yellow-400">
            <FontAwesomeIcon icon={faCircleDot} className="animate-pulse text-[10px]" />
            No running clusters
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleZenMode}
            className="btn-secondary text-xs py-1.5 px-2.5"
            title={zenMode ? "Exit fullscreen (Esc)" : "Fullscreen mode"}
          >
            <FontAwesomeIcon icon={zenMode ? faCompress : faExpand} />
          </button>
          <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded border border-surface-border bg-surface text-2xs text-fg-subtle font-mono tracking-tight">
            ⌘↵
          </span>
          <button
            onClick={() => { setQuery(""); setResult(null); }}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            <FontAwesomeIcon icon={faTrash} />
            <span className="hidden sm:inline">Clear</span>
          </button>
          <button
            onClick={handleRun}
            disabled={isPending || !selectedClusterId || !query.trim()}
            className="btn-primary text-xs py-1.5 px-4"
          >
            {isPending
              ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
              : <FontAwesomeIcon icon={faPlay} />}
            {isRedis ? "Run" : "Run Query"}
          </button>
        </div>
      </div>

      {/* ── Redis mode banner ─────────────────────────────────────────────── */}
      {selectedCluster && isRedis && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-red-500/20 bg-red-500/5">
          <FontAwesomeIcon icon={faTriangleExclamation} className="text-red-400 text-xs shrink-0" />
          <p className="text-xs text-fg-muted">
            Redis mode — one command per run.{" "}
            {["PING", "GET key", "KEYS *", "INFO server", "DBSIZE"].map((cmd) => (
              <code key={cmd} onClick={() => setQuery(cmd)}
                className="cursor-pointer font-mono text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors px-1 py-0.5 rounded text-[10px] mr-1">
                {cmd}
              </code>
            ))}
          </p>
        </div>
      )}

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* ── Left panel: snippets / history ─────────────────────────────── */}
        <div className="hidden lg:flex w-52 xl:w-60 flex-col border-r border-surface-border overflow-hidden shrink-0">
          {/* Tab toggle */}
          <div className="shrink-0 flex border-b border-surface-border">
            {(["snippets", "history"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2",
                  activeTab === tab
                    ? "border-brand-500 text-fg-strong"
                    : "border-transparent text-fg-muted hover:text-fg-base",
                )}
              >
                <FontAwesomeIcon icon={tab === "snippets" ? faLightbulb : faClockRotateLeft} className="text-[10px]" />
                {tab === "snippets" ? "Snippets" : "History"}
                {tab === "history" && history.length > 0 && (
                  <span className="text-2xs bg-brand-500/20 text-brand-400 px-1 rounded-full leading-none">
                    {history.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab === "snippets" && (
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {snippets.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(item.query)}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-surface-100 transition-colors group"
                >
                  <p className="text-xs font-medium text-fg-base group-hover:text-fg-strong truncate">{item.label}</p>
                  <p className="text-2xs text-fg-subtle font-mono mt-0.5 truncate">{item.query.replace(/\n/g, " ")}</p>
                </button>
              ))}
            </div>
          )}

          {activeTab === "history" && (
            <div className="flex-1 overflow-y-auto p-1.5">
              {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-3">
                  <FontAwesomeIcon icon={faClockRotateLeft} className="text-fg-subtle text-xl" />
                  <p className="text-xs text-fg-subtle">Run a query to build history</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <div className="flex justify-end px-1 pb-1">
                    <button onClick={() => setHistory([])} className="text-2xs text-red-400 hover:text-red-300 transition-colors">
                      Clear all
                    </button>
                  </div>
                  {history.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(item.query)}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-surface-100 transition-colors group"
                    >
                      <p className="text-2xs text-fg-subtle mb-0.5">{relTime(item.time)}</p>
                      <p className="text-xs text-fg-muted group-hover:text-fg-base font-mono truncate">
                        {item.query.replace(/\n/g, " ")}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Editor + Results ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Editor */}
          <div className="flex flex-col border-b border-surface-border" style={{ flex: "0 0 38%" }}>
            <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-surface-border bg-surface-50">
              <div className="flex items-center gap-1.5">
                <FontAwesomeIcon icon={isRedis ? faTerminal : faCode} className="text-brand-400 text-xs" />
                <span className="text-xs font-medium text-fg-muted">
                  {isRedis ? "Redis Command" : "SQL Editor"}
                </span>
              </div>
              <span className="text-2xs text-fg-subtle font-mono">Ctrl + ↵ to run</span>
            </div>
            <textarea
              className="flex-1 w-full bg-surface font-mono text-sm p-4 resize-none focus:outline-none"
              style={{ color: "var(--text-strong)", minHeight: 0 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleRun();
                }
              }}
              spellCheck={false}
              placeholder={
                isRedis
                  ? "Type a Redis command… (e.g. PING  ·  SET mykey value  ·  KEYS *)"
                  : "Write your SQL here… (Ctrl + Enter to run)"
              }
            />
          </div>

          {/* Results */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Results header */}
            <div className="shrink-0 flex items-center gap-2.5 px-4 py-2 border-b border-surface-border bg-surface-50">
              <span className="text-xs font-semibold text-fg-base">Output</span>

              {isPending && (
                <span className="flex items-center gap-1.5 text-xs text-brand-400 ml-1">
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin text-[10px]" />
                  Running…
                </span>
              )}
              {result && !result.error && (
                <>
                  <span className="text-xs text-green-400">
                    {result.row_count} row{result.row_count !== 1 ? "s" : ""}
                  </span>
                  <span className="text-xs text-fg-subtle">{result.execution_time_ms}ms</span>
                </>
              )}
              {result?.error && <span className="text-xs text-red-400">Error</span>}

              {result && (
                <button
                  onClick={handleCopy}
                  className="ml-auto flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg-strong transition-colors"
                >
                  <FontAwesomeIcon
                    icon={copied ? faCheck : faCopy}
                    className={cn("text-[10px]", copied && "text-green-400")}
                  />
                  {copied ? "Copied!" : "Copy"}
                </button>
              )}
            </div>

            {/* Results body */}
            <div className="flex-1 overflow-auto min-h-0">
              {!result && !isPending && (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
                  <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", meta.bg)}>
                    <FontAwesomeIcon icon={selectedCluster ? meta.icon : faCode} className={cn("text-xl", meta.color)} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-fg-base">
                      {selectedCluster ? `${meta.label} ready` : "Select a cluster to begin"}
                    </p>
                    <p className="text-xs text-fg-subtle mt-1">
                      {selectedCluster
                        ? isRedis
                          ? "Enter a Redis command above and press Run"
                          : "Write your query above and press Ctrl + Enter"
                        : "Choose a running cluster from the toolbar"}
                    </p>
                  </div>
                </div>
              )}

              {result?.error && (
                <div className="p-4">
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/5 border border-red-500/20">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="text-red-400 mt-0.5 shrink-0" />
                    <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap break-all flex-1 min-w-0">
                      {result.error}
                    </pre>
                  </div>
                </div>
              )}

              {result && !result.error && (
                isRedis ? <RedisOutput result={result} /> : <SqlTable result={result} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Status bar ────────────────────────────────────────────────────── */}
      <div className="shrink-0 h-6 flex items-center px-4 gap-4 border-t border-surface-border bg-surface-50">
        {selectedCluster ? (
          <>
            <span className="flex items-center gap-1.5 text-2xs text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              {selectedCluster.name}
            </span>
            <span className={cn("text-2xs font-medium", meta.color)}>
              {meta.label} {selectedCluster.db_version}
            </span>
          </>
        ) : (
          <span className="text-2xs text-fg-subtle">No cluster selected</span>
        )}
        {result && !result.error && (
          <span className="ml-auto flex items-center gap-3 text-2xs text-fg-subtle">
            <span>{result.execution_time_ms}ms</span>
            <span>·</span>
            <span>{result.row_count} rows</span>
          </span>
        )}
      </div>
    </div>
  );
}

