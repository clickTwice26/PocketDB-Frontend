"use client";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay, faTrash, faSpinner, faDatabase, faCircleDot,
  faCode, faTerminal, faTriangleExclamation, faCopy, faCheck,
  faLayerGroup, faBolt, faLightbulb, faClockRotateLeft,
  faExpand, faCompress, faWandMagicSparkles, faArrowUp,
  faStop, faArrowRight, faRotateRight, faRobot,
  faChevronDown, faMagnifyingGlass, faXmark,
  faCircle, faSquare, faFilePdf, faSitemap,
} from "@fortawesome/free-solid-svg-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useClusters, useExecuteQuery, useDatabases, useSchemaContext, clusterKeys } from "@/hooks/useClusters";
import Topbar from "@/components/layout/Topbar";
import SchemaBrowserPanel from "@/components/clusters/SchemaBrowserPanel";
import ERDDiagramModal from "@/components/clusters/ERDDiagramModal";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/utils";
import type { ClusterListItem, QueryResult } from "@/types";
import { aiApi } from "@/lib/api";
import toast from "react-hot-toast";

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
      <div className="p-5 font-mono text-base space-y-1">
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
      <div className="p-5 font-mono text-base space-y-0.5">
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
    <div className="p-5 font-mono text-base">
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
    <table className="w-full text-sm border-collapse">
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

// ─── AI Assistant Panel ───────────────────────────────────────────────────────

type MessagePart =
  | { type: "text"; content: string }
  | { type: "sql"; content: string };

interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

function parseMessageParts(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const regex = /```(?:sql|mysql|postgresql|postgres|redis|pgsql|SQL|Redis)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index).trim();
    if (before) parts.push({ type: "text", content: before });
    parts.push({ type: "sql", content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }
  const tail = text.slice(lastIndex).trim();
  if (tail) parts.push({ type: "text", content: tail });
  return parts.length ? parts : [{ type: "text", content: text }];
}

// ─── Streaming typewriter animation ──────────────────────────────────────────

function StreamingText({ content }: { content: string }) {
  const [displayed, setDisplayed] = useState("");
  const contentRef = useRef(content);
  const frameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  // Keep ref in sync with latest content without triggering re-runs
  useEffect(() => { contentRef.current = content; });

  // Single RAF loop on mount — chases contentRef
  useEffect(() => {
    const tick = () => {
      setDisplayed((prev) => {
        const target = contentRef.current;
        if (prev.length < target.length) {
          // Reveal ~5 chars per frame ≈ 300 chars/sec at 60 fps — smooth but fast
          return target.slice(0, Math.min(prev.length + 5, target.length));
        }
        return prev;
      });
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); };
  }, []); // intentionally runs only once

  return (
    <>
      {displayed}
      <span className="inline-block w-[2px] h-[13px] bg-brand-400 ml-[2px] align-text-bottom rounded-[1px] animate-pulse" />
    </>
  );
}

function AIAssistPanel({
  dbType,
  dbVersion,
  clusterId,
  clusterName,
  database,
  onUseSQL,
  onExecute,
}: {
  dbType: string;
  dbVersion: string;
  clusterId: string;
  clusterName: string;
  database: string;
  onUseSQL: (sql: string) => void;
  onExecute: (sql: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);
  const abortRef = useRef<{ abort: boolean }>({ abort: false });
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: schemaData, isLoading: schemaLoading, refetch: refetchSchema } = useSchemaContext(clusterId, database);
  const schemaText = schemaData?.schema_text ?? "";
  const tableCount = schemaData?.table_count ?? 0;
  const schemaError = schemaData?.error ?? "";

  const isRedis = dbType === "redis";

  // Auto-scroll when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Reset chat when cluster or database changes
  useEffect(() => {
    setMessages([]);
  }, [clusterId, database]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !clusterId || streaming) return;
    const userMsg = prompt.trim();
    setPrompt("");

    // Build history for API — exclude streaming placeholder
    const history = messages.filter((m) => !m.streaming);
    const apiMessages = [
      ...history.map((m) => ({
        role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
        content: m.content,
      })),
      { role: "user" as const, content: userMsg },
    ];

    setMessages((prev) => [
      ...prev.filter((m) => !m.streaming),
      { role: "user", content: userMsg },
      { role: "assistant", content: "", streaming: true },
    ]);
    setStreaming(true);
    abortRef.current.abort = false;

    // Always fetch a fresh schema so the AI sees the current table/column state
    let freshSchemaText = schemaText;
    if (clusterId && database && !isRedis) {
      try {
        const result = await refetchSchema();
        freshSchemaText = result.data?.schema_text ?? schemaText;
      } catch {
        // fall back to last known schema
      }
    }

    try {
      const stream = aiApi.chatStream({
        messages: apiMessages,
        clusterId,
        dbType,
        dbVersion,
        clusterName,
        schemaContext: freshSchemaText,
      });
      for await (const chunk of stream) {
        if (abortRef.current.abort) break;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.streaming) {
            return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
          }
          return prev;
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AI request failed";
      toast.error(msg);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.streaming) {
          return [...prev.slice(0, -1), { role: "assistant", content: `⚠️ Error: ${msg}` }];
        }
        return prev;
      });
    } finally {
      setStreaming(false);
      setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
    }
  }, [prompt, clusterId, database, isRedis, dbType, dbVersion, clusterName, schemaText, refetchSchema, messages, streaming]);

  const handleStop = () => { abortRef.current.abort = true; };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(key);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const examplePrompts = isRedis
    ? ["Get all keys and their values", "Show memory usage stats"]
    : [
        "Show all tables with row counts",
        "Find duplicate records in any table",
        "Write a query joining related tables",
        "Create an index to optimize queries",
      ];

  const renderMessage = (msg: AIChatMessage, idx: number) => {
    if (msg.role === "user") {
      return (
        <div key={idx} className="flex justify-end mb-3">
          <div className="max-w-[88%] bg-brand-600/20 border border-brand-500/30 rounded-2xl rounded-tr-sm px-3 py-2">
            <p className="text-xs text-fg-base whitespace-pre-wrap break-words">{msg.content}</p>
          </div>
        </div>
      );
    }

    // Thinking dots — no content yet but actively streaming
    if (msg.streaming && !msg.content) {
      return (
        <div key={idx} className="mb-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-5 h-5 rounded bg-brand-600/20 flex items-center justify-center shrink-0">
              <FontAwesomeIcon icon={faRobot} className="text-brand-400" style={{ fontSize: "9px" }} />
            </div>
            <span className="text-2xs text-brand-400 font-semibold">PocketDB AI</span>
          </div>
          <div className="pl-6 flex items-center gap-1 py-1">
            {[0, 160, 320].map((delay, i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-brand-400/70 animate-bounce"
                style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
              />
            ))}
          </div>
        </div>
      );
    }

    // While streaming, use typewriter animation; after done, parse fences normally
    const parts = msg.streaming
      ? [{ type: "text" as const, content: msg.content }]
      : parseMessageParts(msg.content);

    return (
      <div key={idx} className="mb-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="w-5 h-5 rounded bg-brand-600/20 flex items-center justify-center shrink-0">
            <FontAwesomeIcon icon={faRobot} className="text-brand-400" style={{ fontSize: "9px" }} />
          </div>
          <span className="text-2xs text-brand-400 font-semibold">PocketDB AI</span>
        </div>
        <div className="space-y-2 pl-6">
          {parts.map((part, pi) => {
            if (part.type === "text") {
              return (
                <p key={pi} className="text-xs text-fg-muted leading-relaxed whitespace-pre-wrap break-words">
                  {msg.streaming
                    ? <StreamingText content={part.content} />
                    : part.content
                  }
                </p>
              );
            }
            const copyKey = `${idx}-${pi}`;
            return (
              <div key={pi} className="rounded-xl border border-surface-border bg-[#0d1117] overflow-hidden">
                {/* Code block header */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-surface-border/50 bg-[#161b22]">
                  <span className="text-2xs text-fg-subtle font-mono uppercase tracking-wide">
                    {isRedis ? "redis" : "sql"}
                  </span>
                  <button
                    onClick={() => handleCopy(part.content, copyKey)}
                    className="flex items-center gap-1 text-2xs text-fg-subtle hover:text-fg-base transition-colors px-1.5 py-0.5 rounded hover:bg-white/5"
                  >
                    <FontAwesomeIcon icon={copiedIdx === copyKey ? faCheck : faCopy} className={cn("text-xs", copiedIdx === copyKey && "text-green-400")} />
                    {copiedIdx === copyKey ? "Copied" : "Copy"}
                  </button>
                </div>
                {/* Code */}
                <pre className="px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre leading-relaxed">
                  {part.content}
                </pre>
                {/* Use in Editor + Execute buttons */}
                <div className="px-3 py-2 border-t border-surface-border/50 bg-[#161b22] flex gap-2">
                  <button
                    onClick={() => { onUseSQL(part.content); toast.success("Inserted into editor"); }}
                    className="btn-secondary text-xs py-1.5 px-3 flex-1 flex items-center justify-center gap-1.5"
                  >
                    <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
                    Use in Editor
                  </button>
                  <button
                    onClick={() => { onExecute(part.content); toast.success("Running query…"); }}
                    className="btn-primary text-xs py-1.5 px-3 flex-1 flex items-center justify-center gap-1.5"
                  >
                    <FontAwesomeIcon icon={faPlay} className="text-xs" />
                    Execute
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Schema status bar */}
      <div className="shrink-0 px-3 py-1.5 border-b border-surface-border bg-surface-50/60 flex items-center gap-2">
        {!clusterId ? (
          <span className="text-2xs text-fg-subtle">No cluster selected</span>
        ) : isRedis ? (
          <span className="text-2xs text-red-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
            Redis connected
          </span>
        ) : !database ? (
          <span className="text-2xs text-yellow-500/90 flex items-center gap-1.5">
            <FontAwesomeIcon icon={faDatabase} className="text-xs" />
            Select a database for full schema context
          </span>
        ) : schemaLoading ? (
          <span className="text-2xs text-fg-subtle flex items-center gap-1.5">
            <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xs" />
            Loading schema…
          </span>
        ) : schemaError ? (
          <span className="text-2xs text-amber-400 flex items-center gap-1.5">
            <FontAwesomeIcon icon={faTriangleExclamation} className="text-xs" />
            Schema fetch failed
            <button onClick={() => refetchSchema()} className="underline hover:text-amber-300 ml-1">retry</button>
          </span>
        ) : schemaText ? (
          <span className="text-2xs text-green-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            Schema loaded · <strong>{tableCount}</strong> table{tableCount !== 1 ? "s" : ""} in &ldquo;{database}&rdquo;
          </span>
        ) : (
          <span className="text-2xs text-fg-subtle flex items-center gap-1.5">
            No tables yet in &ldquo;{database}&rdquo;
            <button onClick={() => refetchSchema()} className="underline hover:text-fg-base ml-1">refresh</button>
          </span>
        )}
        <span className="ml-auto text-2xs bg-brand-500/10 text-brand-400 px-1.5 py-0.5 rounded font-medium">Gemini</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-brand-600/20 flex items-center justify-center">
                <FontAwesomeIcon icon={faRobot} className="text-brand-400 text-sm" />
              </div>
              <div>
                <p className="text-xs font-semibold text-fg-base">PocketDB AI Assistant</p>
                <p className="text-2xs text-fg-subtle">Powered by Gemini</p>
              </div>
            </div>
            <p className="text-xs text-fg-subtle leading-relaxed mb-3">
              {schemaText
                ? `I know your full schema — ${tableCount} table${tableCount !== 1 ? "s" : ""} in "${database}". Ask anything!`
                : isRedis
                ? "Ask about Redis commands, keys, data structures, or performance."
                : "Ask about SQL queries, schema design, or your database."}
            </p>
            <div className="grid gap-1.5">
              {examplePrompts.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="text-left text-xs text-fg-subtle hover:text-fg-base px-3 py-2 rounded-lg hover:bg-surface-100 border border-surface-border hover:border-brand-500/40 transition-colors"
                >
                  <FontAwesomeIcon icon={faArrowRight} className="mr-2 text-brand-400 text-xs" />
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, idx) => renderMessage(msg, idx))}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-surface-border p-2">
        {messages.length > 0 && (
          <div className="flex justify-between items-center mb-1.5 px-0.5">
            <span className="text-2xs text-fg-subtle">
              {messages.filter((m) => m.role === "user").length} message{messages.filter((m) => m.role === "user").length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setMessages([])}
              className="text-2xs text-fg-subtle hover:text-red-400 transition-colors"
            >
              Clear chat
            </button>
          </div>
        )}
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!streaming) handleGenerate();
              }
            }}
            placeholder={clusterId ? (isRedis ? "Ask about Redis…" : "Ask about your database…") : "Select a cluster first…"}
            disabled={!clusterId || streaming}
            rows={3}
            className="w-full bg-surface-100 border border-surface-border rounded-xl px-3 pt-2.5 pb-8 text-xs text-fg-base placeholder:text-fg-subtle resize-none focus:outline-none focus:border-brand-500 disabled:opacity-50 transition-colors"
          />
          <div className="absolute bottom-2 right-2">
            {streaming ? (
              <button
                onClick={handleStop}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs transition-colors"
              >
                <FontAwesomeIcon icon={faStop} className="text-xs" />
                Stop
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || !clusterId}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-medium transition-colors"
              >
                <FontAwesomeIcon icon={faWandMagicSparkles} className="text-xs" />
                Send
              </button>
            )}
          </div>
          <div className="absolute bottom-2 left-3">
            <span className="text-xs text-fg-subtle">↵ to send · ⇧↵ newline</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ClusterPicker ───────────────────────────────────────────────────────────

function ClusterPicker({
  clusters,
  value,
  onChange,
}: {
  clusters: ClusterListItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = clusters.find((c) => c.id === value) ?? null;
  const filtered = clusters.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const dbMeta = (type: string) =>
    DB_META[(type as DbType)] ?? DB_META.postgres;

  const handleSelect = (id: string) => {
    setOpen(false);
    setSearch("");
    onChange(id);
  };

  return (
    <div ref={ref} className="relative flex-1 max-w-xs">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg border text-sm transition-colors",
          "bg-surface border-surface-border hover:border-brand-500/60 hover:bg-surface-100",
          open && "border-brand-500 bg-surface-100",
        )}
      >
        {selected ? (
          <>
            <FontAwesomeIcon
              icon={dbMeta(selected.db_type ?? "postgres").icon}
              className={cn("text-xs shrink-0", dbMeta(selected.db_type ?? "postgres").color)}
            />
            <span className="flex-1 text-left truncate text-xs text-fg-base font-medium">
              {selected.name}
            </span>
            <span className={cn(
              "text-xs font-semibold px-1.5 py-0.5 rounded shrink-0",
              dbMeta(selected.db_type ?? "postgres").bg,
              dbMeta(selected.db_type ?? "postgres").color,
            )}>
              {(selected.db_type ?? "postgres").toUpperCase()} {selected.db_version}
            </span>
          </>
        ) : (
          <>
            <FontAwesomeIcon icon={faDatabase} className="text-fg-subtle text-xs shrink-0" />
            <span className="flex-1 text-left text-xs text-fg-subtle">— Select a running cluster —</span>
          </>
        )}
        <FontAwesomeIcon
          icon={faChevronDown}
          className={cn("text-fg-subtle text-xs shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-full min-w-[260px] rounded-xl border border-surface-border bg-surface shadow-xl shadow-black/30 overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-surface-border">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="text-fg-subtle text-xs shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clusters…"
              className="flex-1 bg-transparent text-xs text-fg-base placeholder:text-fg-subtle outline-none"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {clusters.length === 0 && (
              <p className="px-3 py-3 text-xs text-fg-subtle text-center">No running clusters</p>
            )}
            {filtered.length === 0 && clusters.length > 0 && (
              <p className="px-3 py-3 text-xs text-fg-subtle text-center">No clusters found</p>
            )}
            {filtered.map((c) => {
              const m = dbMeta(c.db_type ?? "postgres");
              const isActive = c.id === value;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors group",
                    isActive
                      ? "bg-brand-500/10 text-brand-400"
                      : "text-fg-muted hover:bg-surface-100 hover:text-fg-base",
                  )}
                >
                  <FontAwesomeIcon
                    icon={m.icon}
                    className={cn("text-xs shrink-0", isActive ? "text-brand-400" : m.color)}
                  />
                  <span className="flex-1 text-left truncate font-medium">{c.name}</span>
                  <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded shrink-0", m.bg, m.color)}>
                    {(c.db_type ?? "postgres").toUpperCase()} {c.db_version}
                  </span>
                  {isActive && (
                    <FontAwesomeIcon icon={faCheck} className="text-brand-400 text-xs shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DatabasePicker ──────────────────────────────────────────────────────────

function DatabasePicker({
  databases,
  value,
  loading,
  onOpen,
  onChange,
}: {
  databases: { name: string; size?: string }[];
  value: string;
  loading: boolean;
  onOpen: () => void;
  onChange: (db: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = databases.filter((db) =>
    db.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpen = () => {
    onOpen();
    setOpen((v) => !v);
  };

  const handleSelect = (name: string) => {
    setOpen(false);
    setSearch("");
    onChange(name);
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg border text-sm transition-colors min-w-[160px] max-w-[220px]",
          "bg-surface border-surface-border hover:border-brand-500/60 hover:bg-surface-100",
          open && "border-brand-500 bg-surface-100",
        )}
      >
        <FontAwesomeIcon icon={faDatabase} className="text-brand-400 text-xs shrink-0" />
        <span className={cn("flex-1 text-left truncate text-xs", value ? "text-fg-base" : "text-fg-subtle")}>
          {value || "— database —"}
        </span>
        {loading ? (
          <FontAwesomeIcon icon={faSpinner} className="text-fg-subtle text-xs animate-spin shrink-0" />
        ) : (
          <FontAwesomeIcon
            icon={faChevronDown}
            className={cn("text-fg-subtle text-xs shrink-0 transition-transform", open && "rotate-180")}
          />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-56 rounded-xl border border-surface-border bg-surface shadow-xl shadow-black/30 overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-surface-border">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="text-fg-subtle text-xs shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search databases…"
              className="flex-1 bg-transparent text-xs text-fg-base placeholder:text-fg-subtle outline-none"
            />
          </div>

          {/* List */}
          <div className="max-h-56 overflow-y-auto py-1">
            {/* Clear / none option */}
            <button
              type="button"
              onClick={() => handleSelect("")}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors",
                !value ? "text-brand-400 bg-brand-500/10" : "text-fg-subtle hover:bg-surface-100 hover:text-fg-base",
              )}
            >
              <span className="w-4" />
              <span className="italic">— none —</span>
            </button>

            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-fg-subtle text-center">No databases found</p>
            )}

            {filtered.map((db) => (
              <button
                key={db.name}
                type="button"
                onClick={() => handleSelect(db.name)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors group",
                  db.name === value
                    ? "text-brand-400 bg-brand-500/10"
                    : "text-fg-muted hover:bg-surface-100 hover:text-fg-base",
                )}
              >
                <FontAwesomeIcon
                  icon={faDatabase}
                  className={cn(
                    "text-xs shrink-0",
                    db.name === value ? "text-brand-400" : "text-fg-subtle group-hover:text-brand-400",
                  )}
                />
                <span className="flex-1 text-left truncate font-mono">{db.name}</span>
                {db.size && (
                  <span className="text-xs text-fg-subtle shrink-0">{db.size}</span>
                )}
                {db.name === value && (
                  <FontAwesomeIcon icon={faCheck} className="text-brand-400 text-xs shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QueryEditorPage() {
  const { data: clusters = [] } = useClusters("running");
  const { mutate: execQuery, isPending } = useExecuteQuery();
  const queryClient = useQueryClient();

  const selectedClusterId = useUIStore((s) => s.selectedClusterId) ?? "";
  const setSelectedClusterId = useUIStore((s) => s.setSelectedClusterId);
  const [query, setQuery]       = useState("SELECT version();");
  const [result, setResult]     = useState<QueryResult | null>(null);
  const [history, setHistory]   = useState<{ query: string; time: Date; result: QueryResult }[]>(() => []);
  const [copied, setCopied]     = useState(false);
  const [rightPanel, setRightPanel] = useState<null | "history" | "ai" | "browser">(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [sessionRecords, setSessionRecords] = useState<
    { query: string; database: string; clusterName: string; dbType: string; time: Date; result: QueryResult }[]
  >([]);
  const [showERD, setShowERD] = useState(false);

  const zenMode = useUIStore((s) => s.zenMode);
  const toggleZenMode = useUIStore((s) => s.toggleZenMode);
  const setZenMode = useUIStore((s) => s.setZenMode);

  // Keep a ref so the popstate closure always sees the latest zenMode
  const zenModeRef = useRef(zenMode);
  useEffect(() => { zenModeRef.current = zenMode; }, [zenMode]);

  // Store the handler so confirmExit can remove it before navigating
  const popstateHandlerRef = useRef<(() => void) | null>(null);

  // Escape key exits zen mode
  useEffect(() => {
    if (!zenMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZenMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zenMode, setZenMode]);

  // Back-button guard — only intercepts when in zen/fullscreen mode
  useEffect(() => {
    window.history.pushState({ qeGuard: true }, "");

    const handlePopState = () => {
      if (!zenModeRef.current) {
        // Normal mode — let the navigation proceed freely
        window.removeEventListener("popstate", handlePopState);
        popstateHandlerRef.current = null;
        window.history.back();
        return;
      }
      // Fullscreen mode — re-push guard so we stay on the page, show modal
      window.history.pushState({ qeGuard: true }, "");
      setShowExitModal(true);
    };

    popstateHandlerRef.current = handlePopState;
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      popstateHandlerRef.current = null;
      setZenMode(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmExit = useCallback(() => {
    setShowExitModal(false);
    setZenMode(false);
    // Remove listener BEFORE navigating to prevent re-triggering
    if (popstateHandlerRef.current) {
      window.removeEventListener("popstate", popstateHandlerRef.current);
      popstateHandlerRef.current = null;
    }
    // Stack: [..., prev-page, query-editor, guard] — go(-2) lands on prev-page
    window.history.go(-2);
  }, [setZenMode]);

  const cancelExit = useCallback(() => {
    setShowExitModal(false);
  }, []);

  const selectedCluster = useMemo(
    () => clusters.find((c: ClusterListItem) => c.id === selectedClusterId) ?? null,
    [clusters, selectedClusterId],
  );

  const dbType  = ((selectedCluster?.db_type ?? "postgres") as DbType);
  const isRedis = dbType === "redis";
  const meta    = DB_META[dbType] ?? DB_META.postgres;

  const { data: databases = [], refetch: refetchDatabases } = useDatabases(isRedis ? "" : (selectedClusterId ?? ""));

  const historyStorageKey = useMemo(
    () => selectedCluster ? `pocketdb_history_${selectedCluster.name}` : null,
    [selectedCluster],
  );

  // Load history from localStorage when cluster changes
  useEffect(() => {
    if (!historyStorageKey) { setHistory([]); return; }
    try {
      const raw = localStorage.getItem(historyStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { query: string; time: string; result: QueryResult }[];
        setHistory(parsed.map((e) => ({ ...e, time: new Date(e.time) })));
      } else {
        setHistory([]);
      }
    } catch {
      setHistory([]);
    }
  }, [historyStorageKey]);

  // Persist history to localStorage on every change
  useEffect(() => {
    if (!historyStorageKey) return;
    try {
      localStorage.setItem(historyStorageKey, JSON.stringify(
        history.map((e) => ({ ...e, time: e.time.toISOString() })),
      ));
    } catch { /* storage full — silently skip */ }
  }, [history, historyStorageKey]);

  const handleSelectCluster = (id: string) => {
    setSelectedClusterId(id || null);
    const c = clusters.find((c: ClusterListItem) => c.id === id);
    setQuery(DEFAULT_QUERY[c?.db_type ?? "postgres"] ?? DEFAULT_QUERY.postgres);
    setResult(null);
    setSelectedDatabase("");
  };

  const handleRun = useCallback((sqlOverride?: string) => {
    const sql = sqlOverride ?? query;
    if (!selectedClusterId || !sql.trim()) return;
    execQuery(
      { clusterId: selectedClusterId, query: sql, database: selectedDatabase || undefined },
      {
        onSuccess: (data) => {
          setResult(data);
          setHistory((h) => [{ query: sql, time: new Date(), result: data }, ...h.slice(0, 29)]);
          // Refresh the schema cache so the AI assistant sees the latest tables/columns
          if (selectedDatabase) {
            queryClient.invalidateQueries({ queryKey: clusterKeys.schema(selectedClusterId, selectedDatabase) });
          }
          // Append to session recording if active
          setSessionRecords((prev) => {
            if (!isRecording) return prev;
            return [...prev, {
              query: sql,
              database: selectedDatabase,
              clusterName: selectedCluster?.name ?? "",
              dbType: dbType,
              time: new Date(),
              result: data,
            }];
          });
        },
      },
    );
  }, [selectedClusterId, query, selectedDatabase, execQuery, isRecording, selectedCluster, dbType, queryClient]);

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

  // ── Session recording ───────────────────────────────────────────────────
  const exportSessionPDF = useCallback(() => {
    if (sessionRecords.length === 0) return;
    const cluster = selectedCluster;
    const now = new Date();
    const dateStr = now.toLocaleString();

    const escHtml = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const renderResult = (rec: typeof sessionRecords[0]) => {
      const r = rec.result;
      if (r.error) {
        return `<div class="error-box">&#9888; Error: ${escHtml(r.error)}</div>`;
      }
      if (r.columns.length === 0) {
        return `<div class="ok-box">&#10003; ${r.row_count} row${r.row_count !== 1 ? "s" : ""} affected &middot; ${r.execution_time_ms}ms</div>`;
      }
      const header = r.columns.map((c) => `<th>${escHtml(c)}</th>`).join("");
      const rows = r.rows
        .slice(0, 500)
        .map((row) => `<tr>${row.map((cell) => `<td>${cell === null ? '<span class="null">NULL</span>' : escHtml(String(cell))}</td>`).join("")}</tr>`)
        .join("");
      const truncNote = r.rows.length > 500 ? `<p class="trunc">(showing first 500 of ${r.row_count} rows)</p>` : "";
      return `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>${truncNote}`;
    };

    const body = sessionRecords
      .map((rec, i) => `
        <div class="entry">
          <div class="entry-header">
            <span class="entry-num">#${i + 1}</span>
            <span class="entry-db">${escHtml(rec.clusterName)}${rec.database ? " &rsaquo; " + escHtml(rec.database) : ""}</span>
            <span class="entry-time">${rec.time.toLocaleTimeString()}</span>
            ${rec.result.error ? '<span class="badge-err">ERROR</span>' : `<span class="badge-ok">${rec.result.row_count} rows &middot; ${rec.result.execution_time_ms}ms</span>`}
          </div>
          <pre class="sql-block">${escHtml(rec.query.trim())}</pre>
          <div class="result-wrap">${renderResult(rec)}</div>
        </div>`).
      join("");

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>PocketDB Session &mdash; ${dateStr}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #1a1a2e; background: #fff; padding: 24px; }
  .cover { border-bottom: 3px solid #6366f1; padding-bottom: 20px; margin-bottom: 28px; }
  .cover h1 { font-size: 22px; color: #4f46e5; font-weight: 700; margin-bottom: 4px; }
  .cover .meta { color: #64748b; font-size: 11px; }
  .cover .meta strong { color: #334155; }
  .entry { margin-bottom: 28px; page-break-inside: avoid; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .entry-header { display: flex; align-items: center; gap: 10px; padding: 8px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
  .entry-num { font-weight: 700; color: #6366f1; font-size: 12px; }
  .entry-db { color: #475569; font-size: 11px; flex: 1; }
  .entry-time { color: #94a3b8; font-size: 10px; }
  .badge-ok { font-size: 10px; background: #dcfce7; color: #166534; padding: 2px 7px; border-radius: 9px; font-weight: 600; }
  .badge-err { font-size: 10px; background: #fee2e2; color: #991b1b; padding: 2px 7px; border-radius: 9px; font-weight: 600; }
  .sql-block { font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace; font-size: 11.5px; background: #0f172a; color: #7dd3fc; padding: 14px 16px; white-space: pre-wrap; word-break: break-all; line-height: 1.6; }
  .result-wrap { padding: 12px 14px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead tr { background: #f1f5f9; }
  th { text-align: left; padding: 6px 10px; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
  td { padding: 5px 10px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-family: 'Consolas', monospace; word-break: break-all; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) { background: #fafafa; }
  .null { color: #94a3b8; font-style: italic; }
  .error-box { background: #fff1f2; border: 1px solid #fecdd3; color: #be123c; border-radius: 6px; padding: 10px 14px; font-size: 11.5px; font-family: monospace; }
  .ok-box { color: #15803d; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 9px 14px; font-size: 11.5px; }
  .trunc { font-size: 10px; color: #94a3b8; margin-top: 6px; }
  .footer { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px; color: #94a3b8; font-size: 10px; text-align: center; }
  @media print { body { padding: 0; } .entry { page-break-inside: avoid; } }
</style>
</head>
<body>
  <div class="cover">
    <h1>&#128190; PocketDB Session Report</h1>
    <div class="meta">
      <strong>Generated:</strong> ${dateStr} &nbsp;&middot;&nbsp;
      <strong>Cluster:</strong> ${escHtml(cluster?.name ?? "unknown")} &nbsp;&middot;&nbsp;
      <strong>Engine:</strong> ${escHtml((cluster?.db_type ?? "").toUpperCase())} ${escHtml(cluster?.db_version ?? "")} &nbsp;&middot;&nbsp;
      <strong>Queries:</strong> ${sessionRecords.length}
    </div>
  </div>
  ${body}
  <div class="footer">PocketDB &mdash; Session exported on ${dateStr}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) { toast.error("Popup blocked — allow popups for PDF export"); return; }
    win.document.write(html);
    win.document.close();
  }, [sessionRecords, selectedCluster]);

  return (
    <>
    <div className="h-full flex flex-col overflow-hidden">
      {!zenMode && <Topbar title="Query Editor" subtitle="Execute SQL or Redis commands on any running cluster" />}

      {/* ── Cluster toolbar ───────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 border-b border-surface-border bg-surface-50/70">
        <div className={cn("flex items-center justify-center w-7 h-7 rounded-md shrink-0", meta.bg)}>
          <FontAwesomeIcon icon={meta.icon} className={cn("text-xs", meta.color)} />
        </div>

        <ClusterPicker
          clusters={clusters}
          value={selectedClusterId}
          onChange={(id) => handleSelectCluster(id)}
        />

        {selectedCluster && (
          <span className={cn("hidden sm:inline-flex items-center gap-1.5 text-2xs font-semibold px-2 py-1 rounded-md", meta.bg, meta.color)}>
            <FontAwesomeIcon icon={meta.icon} className="text-xs" />
            {meta.label} {selectedCluster.db_version}
          </span>
        )}

        {!isRedis && selectedClusterId && (
          <DatabasePicker
            databases={databases}
            value={selectedDatabase}
            loading={isPending}
            onOpen={() => refetchDatabases()}
            onChange={(db) => {
              setSelectedDatabase(db);
              if (db && query.trim()) {
                execQuery(
                  { clusterId: selectedClusterId, query, database: db },
                  {
                    onSuccess: (data) => {
                      setResult(data);
                      setHistory((h) => [{ query, time: new Date(), result: data }, ...h.slice(0, 29)]);
                    },
                  },
                );
              }
            }}
          />
        )}
        {clusters.length === 0 && (
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-yellow-400">
            <FontAwesomeIcon icon={faCircleDot} className="animate-pulse text-xs" />
            No running clusters
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* History button */}
          <button
            onClick={() => setRightPanel((p) => p === "history" ? null : "history")}
            className={cn(
              "btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5",
              rightPanel === "history" && "bg-brand-500/10 border-brand-500/40 text-brand-400",
            )}
            title="Query History"
          >
            <FontAwesomeIcon icon={faClockRotateLeft} className="text-xs" />
            <span className="hidden sm:inline">History</span>
            {history.length > 0 && (
              <span className="text-xs bg-brand-500/20 text-brand-400 px-1.5 rounded-full leading-none">
                {history.length}
              </span>
            )}
          </button>

          {/* Browser button */}
          <button
            onClick={() => setRightPanel((p) => p === "browser" ? null : "browser")}
            className={cn(
              "btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5",
              rightPanel === "browser" && "bg-brand-500/10 border-brand-500/40 text-brand-400",
            )}
            title="Schema Browser"
          >
            <FontAwesomeIcon icon={faDatabase} className="text-xs" />
            <span className="hidden sm:inline">Browse</span>
          </button>

          {/* ERD button — only when a database is selected (non-Redis) */}
          {!isRedis && selectedClusterId && selectedDatabase && (
            <button
              onClick={() => setShowERD(true)}
              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5 hover:border-brand-500/60 hover:text-brand-400"
              title={`ERD & Schema diagram for "${selectedDatabase}"`}
            >
              <FontAwesomeIcon icon={faSitemap} className="text-xs" />
              <span className="hidden sm:inline">ERD</span>
            </button>
          )}

          {/* AI button */}
          <button
            onClick={() => setRightPanel((p) => p === "ai" ? null : "ai")}
            className={cn(
              "btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5",
              rightPanel === "ai" && "bg-brand-500/10 border-brand-500/40 text-brand-400",
            )}
            title="AI Assistant"
          >
            <FontAwesomeIcon icon={faRobot} className="text-xs" />
            <span className="hidden sm:inline">AI</span>
            <span className="text-xs bg-brand-500/20 text-brand-400 px-1 rounded leading-none font-medium">✨</span>
          </button>

          {/* Record / Stop+Export buttons */}
          {!isRecording ? (
            <button
              onClick={() => { setSessionRecords([]); setIsRecording(true); toast.success("Recording started"); }}
              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5 hover:border-red-500/60 hover:text-red-400"
              title="Start session recording"
            >
              <FontAwesomeIcon icon={faCircle} className="text-red-500 text-xs" />
              <span className="hidden sm:inline">Record</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setIsRecording(false);
                if (sessionRecords.length === 0) { toast.error("No queries recorded yet"); return; }
                exportSessionPDF();
                toast.success(`Exporting ${sessionRecords.length} quer${sessionRecords.length !== 1 ? "ies" : "y"} as PDF`);
              }}
              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5 border-red-500/50 text-red-400 bg-red-500/5 hover:bg-red-500/10 animate-pulse"
              title="Stop recording and export PDF"
            >
              <FontAwesomeIcon icon={faSquare} className="text-red-500 text-xs" />
              <span className="hidden sm:inline">Stop</span>
              {sessionRecords.length > 0 && (
                <span className="text-xs bg-red-500/20 text-red-400 px-1.5 rounded-full leading-none">
                  {sessionRecords.length}
                </span>
              )}
            </button>
          )}

          <div className="w-px h-4 bg-surface-border" />

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
            onClick={() => handleRun()}
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

      {/* ── Recording indicator banner ────────────────────────────────────── */}
      {isRecording && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-1.5 border-b border-red-500/30 bg-red-500/5">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <p className="text-xs text-red-400 font-medium">
            Recording&hellip;
            {sessionRecords.length > 0 && (
              <span className="ml-1.5 text-red-300 font-normal">
                {sessionRecords.length} {sessionRecords.length === 1 ? "query" : "queries"} captured
              </span>
            )}
          </p>
          <button
            onClick={() => {
              if (sessionRecords.length === 0) { setIsRecording(false); toast.error("No queries captured"); return; }
              setIsRecording(false);
              exportSessionPDF();
              toast.success(`Exporting ${sessionRecords.length} ${sessionRecords.length !== 1 ? "queries" : "query"} as PDF`);
            }}
            className="ml-auto text-xs text-red-400 hover:text-red-300 underline underline-offset-2"
          >
            Stop &amp; Export PDF
          </button>
        </div>
      )}

      {/* ── Redis mode banner ─────────────────────────────────────────────── */}
      {selectedCluster && isRedis && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-red-500/20 bg-red-500/5">
          <FontAwesomeIcon icon={faTriangleExclamation} className="text-red-400 text-xs shrink-0" />
          <p className="text-xs text-fg-muted">
            Redis mode — one command per run.{" "}
            {["PING", "GET key", "KEYS *", "INFO server", "DBSIZE"].map((cmd) => (
              <code key={cmd} onClick={() => setQuery(cmd)}
                className="cursor-pointer font-mono text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors px-1 py-0.5 rounded text-xs mr-1">
                {cmd}
              </code>
            ))}
          </p>
        </div>
      )}

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex min-h-0">

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
              className="flex-1 w-full bg-surface font-mono text-base p-4 resize-none focus:outline-none"
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
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xs" />
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
                    className={cn("text-xs", copied && "text-green-400")}
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

        {/* ── Right panel: History / AI / Browser ─────────────────────── */}
        {rightPanel && (
          <div className={cn(
            "shrink-0 flex flex-col border-l border-surface-border bg-surface overflow-hidden",
            rightPanel === "browser" ? "w-[680px] xl:w-[760px]" : "w-80 xl:w-96",
          )}>
            {/* Panel header */}
            <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-surface-border bg-surface-50">
              <span className="flex items-center gap-2 text-xs font-semibold text-fg-base">
                <FontAwesomeIcon
                  icon={rightPanel === "history" ? faClockRotateLeft : rightPanel === "browser" ? faDatabase : faRobot}
                  className="text-brand-400 text-xs"
                />
                {rightPanel === "history" ? "Query History" : rightPanel === "browser" ? "Schema Browser" : "AI Assistant"}
              </span>
              <div className="flex items-center gap-1.5">
                {rightPanel !== "browser" && (
                  <button
                    onClick={() => setRightPanel(rightPanel === "history" ? "ai" : "history")}
                    className="text-2xs text-fg-subtle hover:text-fg-base transition-colors px-1.5 py-0.5 rounded hover:bg-surface-100"
                  >
                    Switch to {rightPanel === "history" ? "AI" : "History"}
                  </button>
                )}
                <button
                  onClick={() => setRightPanel(null)}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-fg-subtle hover:text-fg-base hover:bg-surface-100 transition-colors"
                  title="Close panel"
                >
                  <FontAwesomeIcon icon={faXmark} className="text-xs" />
                </button>
              </div>
            </div>

            {/* History content */}
            {rightPanel === "history" && (
              <div className="flex-1 overflow-y-auto p-1.5">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
                    <FontAwesomeIcon icon={faClockRotateLeft} className="text-fg-subtle/40 text-2xl" />
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
                        onClick={() => { setQuery(item.query); setResult(item.result); }}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-surface-100 transition-colors group"
                      >
                        <p className="text-2xs text-fg-subtle mb-0.5">{relTime(item.time)}</p>
                        <p className="text-xs text-fg-muted group-hover:text-fg-base font-mono truncate">
                          {item.query.replace(/\n/g, " ")}
                        </p>
                        {item.result.error ? (
                          <p className="text-2xs text-red-400 mt-0.5 truncate">Error: {item.result.error}</p>
                        ) : (
                          <p className="text-2xs text-green-500 mt-0.5">
                            {item.result.row_count} row{item.result.row_count !== 1 ? "s" : ""} · {item.result.execution_time_ms}ms
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AI content */}
            {rightPanel === "ai" && (
              <div className="flex-1 min-h-0 overflow-hidden">
                <AIAssistPanel
                  dbType={dbType}
                  dbVersion={selectedCluster?.db_version ?? ""}
                  clusterId={selectedClusterId}
                  clusterName={selectedCluster?.name ?? ""}
                  database={selectedDatabase}
                  onUseSQL={(sql) => { setQuery(sql); toast.success("SQL inserted into editor"); }}
                  onExecute={(sql) => { setQuery(sql); handleRun(sql); }}
                />
              </div>
            )}

            {/* Browser content */}
            {rightPanel === "browser" && (
              <div className="flex-1 min-h-0 overflow-hidden">
                <SchemaBrowserPanel
                  clusterId={selectedClusterId}
                  dbType={dbType}
                  initialDatabase={selectedDatabase || undefined}
                />
              </div>
            )}
          </div>
        )}
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
            {!isRedis && selectedDatabase && (
              <>
                <span className="text-2xs text-fg-subtle">/</span>
                <span className="text-2xs text-fg-base font-medium">{selectedDatabase}</span>
              </>
            )}
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

      {/* ── ERD Diagram Modal ─────────────────────────────────────────────── */}
      {showERD && selectedClusterId && selectedDatabase && (
        <ERDDiagramModal
          clusterId={selectedClusterId}
          database={selectedDatabase}
          dbType={dbType}
          onClose={() => setShowERD(false)}
        />
      )}

      {/* ── Exit confirmation modal ───────────────────────────────────────── */}
      {showExitModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-surface-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-start gap-4 p-5 pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-amber-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-fg-base mb-1">Leave Query Editor?</h2>
                <p className="text-xs text-fg-muted leading-relaxed">
                  Your current query and session history are saved. You can return any time and pick up right where you left off.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-surface-border bg-surface-50">
              <button
                onClick={cancelExit}
                className="btn-secondary flex-1 text-sm py-2"
                autoFocus
              >
                Stay Here
              </button>
              <button
                onClick={confirmExit}
                className="flex-1 text-sm py-2 rounded-lg font-medium bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-colors"
              >
                <FontAwesomeIcon icon={faArrowRight} className="mr-1.5 text-xs" />
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

