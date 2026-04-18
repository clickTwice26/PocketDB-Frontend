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
  faChartBar, faTableCells, faChartLine, faHashtag,
} from "@fortawesome/free-solid-svg-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useClusters, useExecuteUserDbQuery, useUserDatabases, useSchemaContext, clusterKeys } from "@/hooks/useClusters";
import Topbar from "@/components/layout/Topbar";
import SchemaBrowserPanel from "@/components/clusters/SchemaBrowserPanel";
import ERDDiagramModal from "@/components/clusters/ERDDiagramModal";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/utils";
import type { QueryResult, QueryHistoryItem, QueryHistoryPage, UserDatabase } from "@/types";
import { aiApi, browserApi, queryHistoryApi, aiConversationApi } from "@/lib/api";
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

// ─── SQL Autocomplete ─────────────────────────────────────────────────────────

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN",
  "FULL JOIN", "CROSS JOIN", "ON", "AND", "OR", "NOT", "IN", "LIKE", "ILIKE",
  "IS NULL", "IS NOT NULL", "ORDER BY", "GROUP BY", "HAVING", "LIMIT", "OFFSET",
  "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM", "TRUNCATE",
  "CREATE TABLE", "ALTER TABLE", "DROP TABLE", "CREATE INDEX", "DROP INDEX",
  "WITH", "UNION", "UNION ALL", "EXCEPT", "INTERSECT", "DISTINCT", "AS",
  "CASE", "WHEN", "THEN", "ELSE", "END", "BETWEEN", "EXISTS", "RETURNING",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "NULLIF", "CAST", "NOW",
  "CONCAT", "LOWER", "UPPER", "TRIM", "LENGTH", "SUBSTRING", "REPLACE",
  "TO_CHAR", "TO_DATE", "EXTRACT", "DATE_TRUNC", "CURRENT_DATE",
  "INT", "INTEGER", "BIGINT", "SMALLINT", "VARCHAR", "TEXT", "BOOLEAN",
  "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "TIMESTAMP", "DATE", "TIME",
  "UUID", "JSONB", "JSON", "SERIAL", "BIGSERIAL", "PRIMARY KEY", "FOREIGN KEY",
  "REFERENCES", "UNIQUE", "NOT NULL", "DEFAULT", "INDEX", "VIEW", "SCHEMA",
];

function parseSchemaForCompletions(schemaText: string): {
  tables: string[];
  columnsByTable: Record<string, string[]>;
} {
  const tables: string[] = [];
  const columnsByTable: Record<string, string[]> = {};

  // ── Format 1: backend human-readable "TABLE name:\n  col type" ──────────────
  // This is what browserApi.getFullSchema / useSchemaContext returns.
  const tableBlockRegex = /^TABLE\s+([\w]+)\s*:/gm;
  let tm: RegExpExecArray | null;
  while ((tm = tableBlockRegex.exec(schemaText)) !== null) {
    const tableName = tm[1];
    if (!columnsByTable[tableName]) {
      tables.push(tableName);
      columnsByTable[tableName] = [];
    }
    const blockStart = tm.index + tm[0].length;
    // Collect indented lines until we hit a blank line or another TABLE block
    const rest = schemaText.slice(blockStart);
    for (const line of rest.split("\n")) {
      if (/^TABLE\s+\w/.test(line)) break;      // next table block
      if (line.trim() === "") continue;           // skip blanks
      if (!line.startsWith("  ")) break;          // end of indented block
      const col = line.trim().match(/^([\w]+)\s+/);
      if (col) columnsByTable[tableName].push(col[1]);
    }
  }

  // ── Format 2: DDL "CREATE TABLE name (...)" ─────────────────────────────────
  const ddlRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?[\w]+"?\.)?"?([\w]+)"?\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = ddlRegex.exec(schemaText)) !== null) {
    const tableName = m[1];
    if (!columnsByTable[tableName]) {
      tables.push(tableName);
      columnsByTable[tableName] = [];
    }
    const start = m.index + m[0].length;
    let depth = 1, i = start;
    while (i < schemaText.length && depth > 0) {
      if (schemaText[i] === "(") depth++;
      else if (schemaText[i] === ")") depth--;
      i++;
    }
    const body = schemaText.slice(start, i - 1);
    for (const line of body.split("\n")) {
      const t = line.trim();
      if (!t || /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|INDEX)/i.test(t)) continue;
      const col = t.match(/^"?([\w]+)"?\s+\w/);
      if (col && !columnsByTable[tableName].includes(col[1])) {
        columnsByTable[tableName].push(col[1]);
      }
    }
  }

  return { tables, columnsByTable };
}

function getCaretViewportCoords(ta: HTMLTextAreaElement): { x: number; y: number } {
  const style = window.getComputedStyle(ta);
  const taRect = ta.getBoundingClientRect();
  const mirror = document.createElement("div");
  Object.assign(mirror.style, {
    position: "fixed", visibility: "hidden", pointerEvents: "none",
    top: "0px", left: "0px",
    width: `${taRect.width}px`,
    overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word",
    fontFamily: style.fontFamily, fontSize: style.fontSize,
    fontWeight: style.fontWeight, lineHeight: style.lineHeight,
    paddingTop: style.paddingTop, paddingRight: style.paddingRight,
    paddingBottom: style.paddingBottom, paddingLeft: style.paddingLeft,
    borderTopWidth: style.borderTopWidth, borderRightWidth: style.borderRightWidth,
    borderBottomWidth: style.borderBottomWidth, borderLeftWidth: style.borderLeftWidth,
    boxSizing: style.boxSizing,
  });
  mirror.textContent = ta.value.slice(0, ta.selectionStart ?? 0);
  const span = document.createElement("span");
  span.textContent = "\u200b";
  mirror.appendChild(span);
  document.body.appendChild(mirror);
  const spanRect = span.getBoundingClientRect();
  document.body.removeChild(mirror);
  return {
    x: taRect.left + spanRect.left,
    y: taRect.top - ta.scrollTop + spanRect.top + spanRect.height,
  };
}

type ACItem = { label: string; kind: "keyword" | "table" | "column"; table?: string };

function SQLAutoCompleteEditor({
  value,
  onChange,
  onRun,
  tables,
  columnsByTable,
  placeholder,
  className,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  tables: string[];
  columnsByTable: Record<string, string[]>;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<ACItem[]>([]);
  const [selIdx, setSelIdx] = useState(0);
  const [dropPos, setDropPos] = useState<{ x: number; y: number } | null>(null);

  const allItems = useMemo<ACItem[]>(() => [
    ...SQL_KEYWORDS.map((k) => ({ label: k, kind: "keyword" as const })),
    ...tables.map((t) => ({ label: t, kind: "table" as const })),
    ...Object.entries(columnsByTable).flatMap(([tbl, cols]) =>
      cols.map((c) => ({ label: c, kind: "column" as const, table: tbl }))
    ),
  ], [tables, columnsByTable]);

  const dismiss = useCallback(() => { setItems([]); setDropPos(null); }, []);

  const updateSuggestions = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? 0;
    const before = ta.value.slice(0, pos);
    const match = before.match(/[\w.]+$/);
    const token = match ? match[0] : "";
    if (token.length < 2) { dismiss(); return; }
    const lower = token.toLowerCase();
    const filtered = allItems
      .filter((it) => it.label.toLowerCase().startsWith(lower) && it.label.toLowerCase() !== lower)
      .slice(0, 8);
    setItems(filtered);
    setSelIdx(0);
    if (filtered.length > 0) {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const wrapRect = wrap.getBoundingClientRect();
      const coords = getCaretViewportCoords(ta);
      let x = coords.x - wrapRect.left;
      let y = coords.y - wrapRect.top;
      // clamp so dropdown doesn't overflow right edge
      x = Math.min(x, wrapRect.width - 220);
      setDropPos({ x, y });
    } else {
      dismiss();
    }
  }, [allItems, dismiss]);

  const acceptSuggestion = useCallback((label: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? 0;
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    const match = before.match(/[\w.]+$/);
    const tokenLen = match ? match[0].length : 0;
    const newVal = before.slice(0, before.length - tokenLen) + label + after;
    onChange(newVal);
    dismiss();
    requestAnimationFrame(() => {
      if (!ta) return;
      const newPos = pos - tokenLen + label.length;
      ta.selectionStart = ta.selectionEnd = newPos;
      ta.focus();
    });
  }, [value, onChange, dismiss]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (items.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelIdx((i) => (i + 1) % items.length); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelIdx((i) => (i - 1 + items.length) % items.length); return; }
      if (e.key === "Tab" || (e.key === "Enter" && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault(); acceptSuggestion(items[selIdx].label); return;
      }
      if (e.key === "Escape") { dismiss(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); onRun(); }
  }, [items, selIdx, acceptSuggestion, dismiss, onRun]);

  const kindColor: Record<string, string> = {
    keyword: "text-brand-400",
    table:   "text-green-400",
    column:  "text-yellow-400",
  };
  const kindBadge: Record<string, string> = {
    keyword: "kw",
    table:   "tbl",
    column:  "col",
  };

  return (
    <div ref={wrapRef} className="relative flex-1 flex flex-col min-h-0">
      <textarea
        ref={taRef}
        className={className}
        style={style}
        value={value}
        onChange={(e) => { onChange(e.target.value); updateSuggestions(); }}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(dismiss, 120)}
        spellCheck={false}
        placeholder={placeholder}
      />
      {items.length > 0 && dropPos && (
        <div
          className="absolute z-50 w-56 rounded-lg border border-surface-border bg-surface-50 shadow-2xl overflow-hidden py-1"
          style={{ left: dropPos.x, top: dropPos.y }}
        >
          {items.map((it, i) => (
            <div
              key={`${it.kind}:${it.label}:${i}`}
              className={cn(
                "flex items-center justify-between gap-2 px-3 py-1.5 text-sm font-mono cursor-pointer select-none",
                i === selIdx
                  ? "bg-brand-500/20"
                  : "hover:bg-surface-100",
              )}
              onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(it.label); }}
            >
              <span className="flex items-baseline gap-1.5 truncate min-w-0">
                <span className={cn("truncate font-mono", i === selIdx ? "text-brand-300" : kindColor[it.kind])}>
                  {it.label}
                </span>
                {it.kind === "column" && it.table && (
                  <span className="text-2xs text-fg-subtle font-sans shrink-0">{it.table}</span>
                )}
              </span>
              <span className="text-2xs text-fg-subtle shrink-0 font-sans px-1 py-0.5 rounded bg-surface-100">
                {kindBadge[it.kind]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AIAssistPanel({
  dbType,
  dbVersion,
  clusterId,
  clusterName,
  database,
  messages,
  setMessages,
  onUseSQL,
  onExecute,
  onClear,
  onConversationUpdate,
}: {
  dbType: string;
  dbVersion: string;
  clusterId: string;
  clusterName: string;
  database: string;
  messages: AIChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<AIChatMessage[]>>;
  onUseSQL: (sql: string) => void;
  onExecute: (sql: string) => void;
  onClear?: () => void;
  onConversationUpdate?: (msgs: AIChatMessage[]) => void;
}) {
  const [prompt, setPrompt] = useState("");
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
      setMessages((prev) => {
        const finalMsgs = prev.map((m) => (m.streaming ? { ...m, streaming: false } : m));
        // Notify parent to persist conversation to DB
        onConversationUpdate?.(finalMsgs);
        return finalMsgs;
      });
    }
  }, [prompt, clusterId, database, isRedis, dbType, dbVersion, clusterName, schemaText, refetchSchema, messages, streaming, onConversationUpdate]);

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
                <p key={pi} className="text-xs text-fg-base leading-relaxed whitespace-pre-wrap break-words">
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
              </div>
            </div>
            <p className="text-xs text-fg-muted leading-relaxed mb-3">
              {isRedis
                ? "Ask about Redis commands, keys, data structures, or performance."
                : database
                ? `Connected to "${database}". Ask about your schema, queries, or design.`
                : "Ask about SQL queries, schema design, or your database."}
            </p>
            <div className="grid gap-1.5">
              {examplePrompts.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="text-left text-xs text-fg-muted hover:text-fg-base px-3 py-2 rounded-lg hover:bg-surface-100 border border-surface-border hover:border-brand-500/40 transition-colors"
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
              onClick={() => { setMessages([]); onClear?.(); }}
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

// ─── Interactive Mode Panel ───────────────────────────────────────────────────

/** Parse the first affected table name from a SQL statement */
function parseAffectedTable(sql: string): string | null {
  const s = sql.trim().replace(/\s+/g, " ");
  const patterns = [
    /^(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:"?(\w+)"?\.)?"?(\w+)"?/i,
    /^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"?(\w+)"?\.)?"?(\w+)"?/i,
    /^DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+(?:"?(\w+)"?\.)?"?(\w+)"?/i,
    /^ALTER\s+TABLE\s+(?:"?(\w+)"?\.)?"?(\w+)"?/i,
    /^SELECT\s+.+?\s+FROM\s+(?:"?(\w+)"?\.)?"?(\w+)"?/i,
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) return m[2] ?? m[1] ?? null;
  }
  return null;
}

function classifyQuery(sql: string): "select" | "insert" | "update" | "delete" | "ddl" | "other" {
  const s = sql.trim().toUpperCase();
  if (s.startsWith("SELECT")) return "select";
  if (s.startsWith("INSERT")) return "insert";
  if (s.startsWith("UPDATE")) return "update";
  if (s.startsWith("DELETE") || s.startsWith("TRUNCATE")) return "delete";
  if (/^(CREATE|DROP|ALTER|RENAME)/.test(s)) return "ddl";
  return "other";
}

function InteractiveModePanel({
  clusterId,
  database,
  dbType,
  lastQuery,
  lastResult,
  isRunning,
}: {
  clusterId: string;
  database: string;
  dbType: string;
  lastQuery: string;
  lastResult: QueryResult | null;
  isRunning: boolean;
}) {
  const [tables, setTables] = useState<{ name: string; row_count?: number; schema?: string }[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [focusedTable, setFocusedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<QueryResult | null>(null);
  const [tableDataLoading, setTableDataLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const isRedis = dbType === "redis";

  // Load table list when cluster/database changes or refreshKey changes
  useEffect(() => {
    if (!clusterId || !database || isRedis) {
      setTables([]);
      return;
    }
    setTablesLoading(true);
    browserApi.listTables(clusterId, database)
      .then((res: { name: string; row_count?: number; schema?: string }[] | { tables?: { name: string; row_count?: number; schema?: string }[] }) => {
        const list = Array.isArray(res) ? res : (res?.tables ?? []);
        setTables(list);
        setLastRefreshedAt(new Date());
      })
      .catch(() => setTables([]))
      .finally(() => setTablesLoading(false));
  }, [clusterId, database, isRedis, refreshKey]);

  // Auto-detect affected table and load its data after each query
  useEffect(() => {
    if (!lastQuery || !lastResult || !clusterId || !database || isRedis) return;
    // Refresh table list on any DDL or DML
    const kind = classifyQuery(lastQuery);
    if (kind !== "other") {
      setRefreshKey((k) => k + 1);
    }
    // Load data for the affected table
    const tbl = parseAffectedTable(lastQuery);
    if (tbl) {
      setFocusedTable(tbl);
      setTableDataLoading(true);
      browserApi.getData(clusterId, database, tbl, { page_size: 20 })
        .then((res: { columns?: string[]; rows?: unknown[][]; total_rows?: number }) => setTableData({
          columns: res.columns ?? [],
          rows: res.rows ?? [],
          row_count: res.total_rows ?? res.rows?.length ?? 0,
          execution_time_ms: 0,
          query: `SELECT * FROM ${tbl}`,
          error: null,
        }))
        .catch(() => setTableData(null))
        .finally(() => setTableDataLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResult]);

  const handleTableClick = (tableName: string) => {
    if (!clusterId || !database) return;
    setFocusedTable(tableName);
    setTableDataLoading(true);
    browserApi.getData(clusterId, database, tableName, { page_size: 20 })
      .then((res: { columns?: string[]; rows?: unknown[][]; total_rows?: number }) => setTableData({
        columns: res.columns ?? [],
        rows: res.rows ?? [],
        row_count: res.total_rows ?? res.rows?.length ?? 0,
        execution_time_ms: 0,
        query: `SELECT * FROM ${tableName}`,
        error: null,
      }))
      .catch(() => setTableData(null))
      .finally(() => setTableDataLoading(false));
  };

  const queryKind = lastQuery ? classifyQuery(lastQuery) : null;
  const kindColor: Record<string, string> = {
    select: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    insert: "text-green-400 bg-green-500/10 border-green-500/20",
    update: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    delete: "text-red-400 bg-red-500/10 border-red-500/20",
    ddl:    "text-purple-400 bg-purple-500/10 border-purple-500/20",
    other:  "text-fg-subtle bg-surface-100 border-surface-border",
  };

  if (!clusterId || !database) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-5 pt-8">
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
          <FontAwesomeIcon icon={faChartLine} className="text-brand-400 text-lg" />
        </div>
        <p className="text-xs font-semibold text-fg-base">Interactive Mode</p>
        <p className="text-2xs text-fg-subtle leading-relaxed">
          Select a cluster and database to see live table changes as you execute queries.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header strip */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-surface-border bg-surface-50/60">
        <FontAwesomeIcon icon={faDatabase} className="text-brand-400 text-xs shrink-0" />
        <span className="text-2xs font-semibold text-fg-base truncate">{database}</span>
        {lastRefreshedAt && (
          <span className="ml-auto text-2xs text-fg-subtle whitespace-nowrap">
            {lastRefreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-surface-100 text-fg-subtle hover:text-fg-base transition-colors"
          title="Refresh tables"
        >
          <FontAwesomeIcon icon={faRotateRight} className={cn("text-xs", tablesLoading && "animate-spin")} />
        </button>
      </div>

      {/* Last query badge */}
      {lastQuery && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-surface-border">
          {isRunning
            ? <FontAwesomeIcon icon={faSpinner} className="text-brand-400 text-xs animate-spin shrink-0" />
            : queryKind && (
              <span className={cn("text-2xs px-1.5 py-0.5 rounded border font-mono font-semibold uppercase shrink-0", kindColor[queryKind])}>
                {queryKind}
              </span>
            )
          }
          <code className="text-2xs text-fg-muted font-mono truncate flex-1">
            {lastQuery.trim().replace(/\s+/g, " ")}
          </code>
          {lastResult && !lastResult.error && (
            <span className="text-2xs text-green-400 shrink-0 whitespace-nowrap">
              {lastResult.row_count} row{lastResult.row_count !== 1 ? "s" : ""}
            </span>
          )}
          {lastResult?.error && (
            <span className="text-2xs text-red-400 shrink-0">error</span>
          )}
        </div>
      )}

      {/* Table list */}
      <div className="shrink-0 border-b border-surface-border">
        <div className="px-3 py-1.5 flex items-center gap-1">
          <span className="text-2xs font-semibold text-fg-subtle uppercase tracking-wide">Tables</span>
          {tables.length > 0 && (
            <span className="ml-1 text-2xs bg-surface-100 text-fg-subtle px-1.5 rounded-full">{tables.length}</span>
          )}
        </div>
        {tablesLoading && tables.length === 0 ? (
          <div className="flex items-center gap-2 px-3 pb-2">
            <FontAwesomeIcon icon={faSpinner} className="text-brand-400 text-xs animate-spin" />
            <span className="text-2xs text-fg-subtle">Loading tables…</span>
          </div>
        ) : tables.length === 0 ? (
          <p className="px-3 pb-2 text-2xs text-fg-subtle">No tables yet</p>
        ) : (
          <div className="flex flex-wrap gap-1 px-3 pb-2 max-h-24 overflow-y-auto">
            {tables.map((t) => {
              const affected = lastQuery ? parseAffectedTable(lastQuery) === t.name : false;
              return (
                <button
                  key={t.name}
                  onClick={() => handleTableClick(t.name)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-2xs font-mono transition-all",
                    focusedTable === t.name
                      ? "bg-brand-500/15 border-brand-500/40 text-brand-400"
                      : affected
                      ? "bg-green-500/10 border-green-500/30 text-green-400 animate-pulse"
                      : "bg-surface-100 border-surface-border text-fg-muted hover:border-brand-500/40 hover:text-fg-base",
                  )}
                >
                  <FontAwesomeIcon icon={faTableCells} className="text-xs opacity-70" />
                  {t.name}
                  {t.row_count !== undefined && (
                    <span className="opacity-60">{t.row_count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Focused table data */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {!focusedTable ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
            <FontAwesomeIcon icon={faTableCells} className="text-fg-subtle/30 text-2xl" />
            <p className="text-2xs text-fg-subtle">Click a table above or run a query to see live data</p>
          </div>
        ) : (
          <>
            {/* Table data header */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-surface-border bg-surface-50">
              <FontAwesomeIcon icon={faTableCells} className="text-brand-400 text-xs" />
              <span className="text-2xs font-semibold text-fg-base font-mono">{focusedTable}</span>
              {tableData && (
                <span className="text-2xs text-fg-subtle ml-1">{tableData.row_count} rows</span>
              )}
              {tableDataLoading && (
                <FontAwesomeIcon icon={faSpinner} className="text-brand-400 text-xs animate-spin ml-1" />
              )}
              <button
                onClick={() => handleTableClick(focusedTable)}
                className="ml-auto w-5 h-5 flex items-center justify-center rounded hover:bg-surface-100 text-fg-subtle hover:text-fg-base transition-colors"
                title="Refresh table data"
              >
                <FontAwesomeIcon icon={faRotateRight} className="text-xs" />
              </button>
            </div>

            {/* Table data body */}
            <div className="flex-1 overflow-auto min-h-0">
              {tableDataLoading && !tableData ? (
                <div className="h-full flex items-center justify-center">
                  <FontAwesomeIcon icon={faSpinner} className="text-brand-400 animate-spin" />
                </div>
              ) : tableData && tableData.columns.length > 0 ? (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-surface-100">
                    <tr>
                      {tableData.columns.map((col) => (
                        <th key={col} className="text-left px-2.5 py-1.5 text-fg-subtle font-semibold border-b border-surface-border whitespace-nowrap text-2xs">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-surface-border/30 hover:bg-surface-50 transition-colors">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-2.5 py-1.5 font-mono text-fg-base max-w-[120px] truncate text-2xs" title={String(cell ?? "")}>
                            {cell === null
                              ? <span className="text-fg-subtle italic">NULL</span>
                              : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {tableData.rows.length === 0 && (
                      <tr>
                        <td colSpan={tableData.columns.length} className="px-3 py-4 text-center text-2xs text-fg-subtle">
                          Table is empty
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-2xs text-fg-subtle">No data</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── UserDatabasePicker ───────────────────────────────────────────────────────

function UserDatabasePicker({
  databases,
  value,
  onChange,
}: {
  databases: UserDatabase[];
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

  const selected = databases.find((d) => d.id === value) ?? null;
  const filtered = databases.filter((d) =>
    d.database_name.toLowerCase().includes(search.toLowerCase())
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
              icon={dbMeta(selected.db_type).icon}
              className={cn("text-xs shrink-0", dbMeta(selected.db_type).color)}
            />
            <span className="flex-1 text-left truncate text-xs text-fg-base font-medium font-mono">
              {selected.database_name}
            </span>
            <span className={cn(
              "text-xs font-semibold px-1.5 py-0.5 rounded shrink-0",
              dbMeta(selected.db_type).bg,
              dbMeta(selected.db_type).color,
            )}>
              {selected.db_type.toUpperCase()}
            </span>
          </>
        ) : (
          <>
            <FontAwesomeIcon icon={faDatabase} className="text-fg-subtle text-xs shrink-0" />
            <span className="flex-1 text-left text-xs text-fg-subtle">— Select your database —</span>
          </>
        )}
        <FontAwesomeIcon
          icon={faChevronDown}
          className={cn("text-fg-subtle text-xs shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-full min-w-[260px] rounded-xl border border-surface-border bg-surface shadow-xl shadow-black/30 overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-surface-border">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="text-fg-subtle text-xs shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your databases…"
              className="flex-1 bg-transparent text-xs text-fg-base placeholder:text-fg-subtle outline-none"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {databases.length === 0 && (
              <p className="px-3 py-3 text-xs text-fg-subtle text-center">No databases yet — create one first</p>
            )}
            {filtered.length === 0 && databases.length > 0 && (
              <p className="px-3 py-3 text-xs text-fg-subtle text-center">No databases match</p>
            )}
            {filtered.map((d) => {
              const m = dbMeta(d.db_type);
              const isActive = d.id === value;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleSelect(d.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors group",
                    isActive
                      ? "bg-brand-500/10 text-brand-400"
                      : "text-fg-muted hover:bg-surface-100 hover:text-fg-base",
                  )}
                >
                  <FontAwesomeIcon icon={m.icon} className={cn("text-xs shrink-0", isActive ? "text-brand-400" : m.color)} />
                  <span className="flex-1 text-left truncate font-mono">{d.database_name}</span>
                  <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded shrink-0", m.bg, m.color)}>
                    {d.db_type.toUpperCase()}
                  </span>
                  {isActive && <FontAwesomeIcon icon={faCheck} className="text-brand-400 text-xs shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QueryEditorPage() {
  const { data: userDatabases = [] } = useUserDatabases();
  const { mutate: execUserDbQuery, isPending } = useExecuteUserDbQuery();
  const queryClient = useQueryClient();

  const [selectedDbId, setSelectedDbId] = useState<string>("");
  const [query, setQuery]       = useState("SELECT version();");
  const [result, setResult]     = useState<QueryResult | null>(null);
  // ── DB-backed history state ──────────────────────────────────────────────
  const [historyItems, setHistoryItems] = useState<QueryHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage]   = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const HISTORY_PAGE_SIZE = 20;
  // ─────────────────────────────────────────────────────────────────────────
  const [copied, setCopied]     = useState(false);
  const [rightPanel, setRightPanel] = useState<null | "history" | "ai">(null);
  const [activeTab, setActiveTab] = useState<"output" | "browse" | "interactive">("output");
  const [showExitModal, setShowExitModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionRecords, setSessionRecords] = useState<
    { query: string; database: string; clusterName: string; dbType: string; time: Date; result: QueryResult }[]
  >([]);
  const [showERD, setShowERD] = useState(false);
  const [lastRunQuery, setLastRunQuery] = useState<string>("");
  const [runCount, setRunCount] = useState(0);
  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>([]);

  // ── Resize state ────────────────────────────────────────────────────────────
  // editorHeightPct: fraction of the center column taken by the editor (0.2–0.85)
  const [editorHeightPct, setEditorHeightPct] = useState(0.38);
  // rightPanelWidth: pixel width of the right panel
  const [rightPanelWidth, setRightPanelWidth] = useState<number | null>(null);
  const mainAreaRef   = useRef<HTMLDivElement>(null);
  const centerColRef  = useRef<HTMLDivElement>(null);
  const isDraggingV   = useRef(false); // vertical (editor/results splitter)
  const isDraggingH   = useRef(false); // horizontal (right panel splitter)

  const startVerticalDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingV.current = true;
    const col = centerColRef.current;
    if (!col) return;
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingV.current) return;
      const rect = col.getBoundingClientRect();
      const pct = (ev.clientY - rect.top) / rect.height;
      setEditorHeightPct(Math.min(0.85, Math.max(0.15, pct)));
    };
    const onUp = () => {
      isDraggingV.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const startHorizontalDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingH.current = true;
    const area = mainAreaRef.current;
    if (!area) return;
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingH.current) return;
      const rect = area.getBoundingClientRect();
      const w = rect.right - ev.clientX;
      setRightPanelWidth(Math.min(900, Math.max(240, w)));
    };
    const onUp = () => {
      isDraggingH.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // ────────────────────────────────────────────────────────────────────────────

  const openPanel = useCallback((panel: "history" | "ai" | null) => {
    setRightPanel(panel);
    setRightPanelWidth(null); // reset to default width for each panel type
  }, []);

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

  // Derived from selected user database
  const selectedUserDb = useMemo(
    () => (userDatabases as UserDatabase[]).find((d) => d.id === selectedDbId) ?? null,
    [userDatabases, selectedDbId],
  );

  const selectedClusterId = selectedUserDb?.cluster_id ?? "";
  const selectedDatabase  = selectedUserDb?.database_name ?? "";
  const dbType  = ((selectedUserDb?.db_type ?? "postgres") as DbType);
  const isRedis = false; // User databases are only postgres/mysql
  const meta    = DB_META[dbType] ?? DB_META.postgres;

  // Schema for autocomplete (scoped to user's db)
  const { data: acSchemaData } = useSchemaContext(
    isRedis ? "" : selectedClusterId,
    selectedDatabase,
  );
  const { tables: acTables, columnsByTable: acColumns } = useMemo(
    () => parseSchemaForCompletions(acSchemaData?.schema_text ?? ""),
    [acSchemaData?.schema_text],
  );

  // ── Load history from DB when cluster/database/page changes ──────────────
  const loadHistory = useCallback((clusterId: string, db: string, page: number) => {
    if (!clusterId) { setHistoryItems([]); setHistoryTotal(0); return; }
    setHistoryLoading(true);
    queryHistoryApi.list(clusterId, db, page, HISTORY_PAGE_SIZE)
      .then((data: QueryHistoryPage) => {
        setHistoryItems(data.items);
        setHistoryTotal(data.total);
        setHistoryPage(data.page);
      })
      .catch(() => { setHistoryItems([]); setHistoryTotal(0); })
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    setHistoryPage(1);
    loadHistory(selectedClusterId, selectedDatabase, 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDbId]);
  // ─────────────────────────────────────────────────────────────────────────

  // ── Load / save AI conversation from DB ──────────────────────────────────
  useEffect(() => {
    if (!selectedClusterId) { setAiMessages([]); return; }
    aiConversationApi.get(selectedClusterId, selectedDatabase)
      .then((data: { messages_json?: AIChatMessage[] } | null) => {
        setAiMessages(data?.messages_json ?? []);
      })
      .catch(() => setAiMessages([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDbId]);

  const handleAiConversationUpdate = useCallback((msgs: AIChatMessage[]) => {
    if (!selectedClusterId) return;
    aiConversationApi.upsert(selectedClusterId, selectedDatabase, msgs).catch(() => { /* silently ignore */ });
  }, [selectedClusterId, selectedDatabase]);

  const handleClearAiConversation = useCallback(() => {
    if (!selectedClusterId) return;
    aiConversationApi.clear(selectedClusterId, selectedDatabase).catch(() => { /* silently ignore */ });
  }, [selectedClusterId, selectedDatabase]);
  // ─────────────────────────────────────────────────────────────────────────

  const handleSelectDb = (id: string) => {
    setSelectedDbId(id);
    const db = (userDatabases as UserDatabase[]).find((d) => d.id === id);
    setQuery(DEFAULT_QUERY[db?.db_type ?? "postgres"] ?? DEFAULT_QUERY.postgres);
    setResult(null);
    setLastRunQuery("");
    setRunCount(0);
  };

  const handleRun = useCallback((sqlOverride?: string) => {
    const sql = sqlOverride ?? query;
    if (!selectedDbId || !sql.trim()) return;
    const runStartTime = Date.now();
    setLastRunQuery(sql);
    setRunCount((c) => c + 1);

    execUserDbQuery(
      { databaseId: selectedDbId, query: sql },
      {
        onSuccess: (data) => {
          void (Date.now() - runStartTime);
          setResult(data);
          // Save to DB history
          queryHistoryApi.create({
            cluster_id: selectedClusterId,
            database_name: selectedDatabase || null,
            query_text: sql,
            execution_time_ms: data.execution_time_ms ?? null,
            row_count: data.row_count ?? null,
            had_error: !!data.error,
            error_message: data.error ?? null,
          }).then(() => {
            // Reload first page so the new entry appears at top
            loadHistory(selectedClusterId, selectedDatabase, 1);
          }).catch(() => { /* silently ignore save failure */ });
          if (selectedDatabase) {
            queryClient.invalidateQueries({ queryKey: clusterKeys.schema(selectedClusterId, selectedDatabase) });
          }
          setSessionRecords((prev) => {
            if (!isRecording) return prev;
            return [...prev, {
              query: sql,
              database: selectedDatabase,
              clusterName: selectedUserDb?.database_name ?? "",
              dbType: dbType,
              time: new Date(),
              result: data,
            }];
          });
        },
        onError: (err) => {
          // Save error entry to history too
          queryHistoryApi.create({
            cluster_id: selectedClusterId,
            database_name: selectedDatabase || null,
            query_text: sql,
            execution_time_ms: null,
            row_count: null,
            had_error: true,
            error_message: err.message,
          }).then(() => loadHistory(selectedClusterId, selectedDatabase, 1))
            .catch(() => { /* ignore */ });
        },
      },
    );
  }, [selectedDbId, selectedClusterId, selectedDatabase, query, execUserDbQuery, isRecording, selectedUserDb, dbType, queryClient, loadHistory]);

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

  // ── Session recording ───────────────────────────────────────────────────
  const exportSessionPDF = useCallback(() => {
    if (sessionRecords.length === 0) return;
    const dbName = selectedUserDb?.database_name ?? "unknown";
    const dbTypeLabel = (selectedUserDb?.db_type ?? "").toUpperCase();
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
      <strong>Database:</strong> ${escHtml(dbName)} &nbsp;&middot;&nbsp;
      <strong>Engine:</strong> ${escHtml(dbTypeLabel)} &nbsp;&middot;&nbsp;
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
  }, [sessionRecords, selectedUserDb]);

  return (
    <>
    <div className="h-full flex flex-col overflow-hidden">
      {!zenMode && <Topbar title="Query Editor" subtitle="Execute SQL queries on your databases" />}

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 border-b border-surface-border bg-surface-50/70">
        <div className={cn("flex items-center justify-center w-7 h-7 rounded-md shrink-0", meta.bg)}>
          <FontAwesomeIcon icon={meta.icon} className={cn("text-xs", meta.color)} />
        </div>

        <UserDatabasePicker
          databases={userDatabases as UserDatabase[]}
          value={selectedDbId}
          onChange={(id) => handleSelectDb(id)}
        />

        {selectedUserDb && (
          <span className={cn("hidden sm:inline-flex items-center gap-1.5 text-2xs font-semibold px-2 py-1 rounded-md", meta.bg, meta.color)}>
            <FontAwesomeIcon icon={meta.icon} className="text-xs" />
            {meta.label}
          </span>
        )}

        {(userDatabases as UserDatabase[]).length === 0 && (
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-yellow-400">
            <FontAwesomeIcon icon={faCircleDot} className="animate-pulse text-xs" />
            No databases yet
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* History button */}
          <button
            onClick={() => openPanel(rightPanel === "history" ? null : "history")}
            className={cn(
              "btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5",
              rightPanel === "history" && "bg-brand-500/10 border-brand-500/40 text-brand-400",
            )}
            title="Query History"
          >
            <FontAwesomeIcon icon={faClockRotateLeft} className="text-xs" />
            <span className="hidden sm:inline">History</span>
            {historyTotal > 0 && (
              <span className="text-xs bg-brand-500/20 text-brand-400 px-1.5 rounded-full leading-none">
                {historyTotal > 999 ? "999+" : historyTotal}
              </span>
            )}
          </button>

          {/* Browser button */}
          <button
            onClick={() => setActiveTab(activeTab === "browse" ? "output" : "browse")}
            className={cn(
              "btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5",
              activeTab === "browse" && "bg-brand-500/10 border-brand-500/40 text-brand-400",
            )}
            title="Schema Browser"
          >
            <FontAwesomeIcon icon={faDatabase} className="text-xs" />
            <span className="hidden sm:inline">Browse</span>
          </button>

          {/* ERD button — only when a database is selected (non-Redis) */}
          {selectedDbId && selectedDatabase && (
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
            onClick={() => openPanel(rightPanel === "ai" ? null : "ai")}
            className={cn(
              "btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5",
              rightPanel === "ai" && "bg-brand-500/10 border-brand-500/40 text-brand-400",
            )}
            title="AI Assistant"
          >
            <FontAwesomeIcon icon={faRobot} className="text-xs" />
            <span className="hidden sm:inline">AI</span>
          </button>

          {/* Interactive Mode button */}
          <button
            onClick={() => setActiveTab(activeTab === "interactive" ? "output" : "interactive")}
            className={cn(
              "btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5",
              activeTab === "interactive" && "bg-brand-500/10 border-brand-500/40 text-brand-400",
            )}
            title="Interactive Mode — live visual output"
          >
            <FontAwesomeIcon icon={faChartLine} className="text-xs" />
            <span className="hidden sm:inline">Live</span>
            {runCount > 0 && (
              <span className="text-2xs bg-brand-500/20 text-brand-400 px-1.5 rounded-full leading-none tabular-nums">
                {runCount}
              </span>
            )}
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
      {false && (
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
      <div ref={mainAreaRef} className="flex-1 overflow-hidden flex min-h-0">

        {/* ── Editor + Results ────────────────────────────────────────────── */}
        <div ref={centerColRef} className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Editor */}
          <div className="flex flex-col border-b border-surface-border" style={{ flex: `0 0 ${editorHeightPct * 100}%` }}>
            <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-surface-border bg-surface-50">
              <div className="flex items-center gap-1.5">
                <FontAwesomeIcon icon={isRedis ? faTerminal : faCode} className="text-brand-400 text-xs" />
                <span className="text-xs font-medium text-fg-muted">
                  {isRedis ? "Redis Command" : "SQL Editor"}
                </span>
              </div>
              <span className="text-2xs text-fg-subtle font-mono">Ctrl + ↵ to run</span>
            </div>
            {isRedis ? (
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
                placeholder="Type a Redis command… (e.g. PING  ·  SET mykey value  ·  KEYS *)"
              />
            ) : (
              <SQLAutoCompleteEditor
                value={query}
                onChange={setQuery}
                onRun={handleRun}
                tables={acTables}
                columnsByTable={acColumns}
                className="flex-1 w-full bg-surface font-mono text-base p-4 resize-none focus:outline-none"
                style={{ color: "var(--text-strong)", minHeight: 0 }}
                placeholder="Write your SQL here… (Ctrl + Enter to run)"
              />
            )}
            {/* ── Editor action bar ── */}
            <div className="shrink-0 flex items-center justify-end gap-2 px-3 py-2 border-t border-surface-border bg-surface-50">
              <button
                onClick={() => { setQuery(""); setResult(null); }}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <FontAwesomeIcon icon={faTrash} />
                <span>Clear</span>
              </button>
              <button
                onClick={() => handleRun()}
                disabled={isPending || !selectedClusterId || !query.trim()}
                className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5"
              >
                {isPending
                  ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                  : <FontAwesomeIcon icon={faPlay} />}
                {isRedis ? "Run" : "Run Query"}
              </button>
            </div>
          </div>

          {/* ── Vertical drag handle ─── */}
          <div
            onMouseDown={startVerticalDrag}
            className="shrink-0 h-[5px] cursor-row-resize group flex items-center justify-center hover:bg-brand-500/20 transition-colors"
            title="Drag to resize editor"
          >
            <div className="w-12 h-[3px] rounded-full bg-surface-border group-hover:bg-brand-500/50 transition-colors" />
          </div>

          {/* Results / Browse / Interactive toggle area */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">

            {/* Tab bar */}
            <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-surface-border bg-surface-50">
              {/* Tab: Output */}
              <button
                onClick={() => setActiveTab("output")}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md font-medium transition-colors",
                  activeTab === "output"
                    ? "bg-brand-500/10 text-brand-400 border border-brand-500/30"
                    : "text-fg-subtle hover:text-fg-base hover:bg-surface-100",
                )}
              >
                Output
                {isPending && <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xs" />}
                {result && !result.error && !isPending && (
                  <span className="text-2xs text-green-400">{result.row_count} row{result.row_count !== 1 ? "s" : ""}</span>
                )}
                {result?.error && !isPending && <span className="text-2xs text-red-400">error</span>}
              </button>

              {/* Tab: Browse */}
              <button
                onClick={() => setActiveTab("browse")}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md font-medium transition-colors",
                  activeTab === "browse"
                    ? "bg-brand-500/10 text-brand-400 border border-brand-500/30"
                    : "text-fg-subtle hover:text-fg-base hover:bg-surface-100",
                )}
              >
                <FontAwesomeIcon icon={faDatabase} className="text-xs" />
                Browse
              </button>

              {/* Tab: Interactive Mode */}
              <button
                onClick={() => setActiveTab("interactive")}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md font-medium transition-colors",
                  activeTab === "interactive"
                    ? "bg-brand-500/10 text-brand-400 border border-brand-500/30"
                    : "text-fg-subtle hover:text-fg-base hover:bg-surface-100",
                )}
              >
                <FontAwesomeIcon icon={faChartLine} className="text-xs" />
                Interactive Mode
                {runCount > 0 && (
                  <span className="text-2xs bg-brand-500/20 text-brand-400 px-1.5 rounded-full leading-none tabular-nums">{runCount}</span>
                )}
              </button>

              {/* Right actions */}
              <div className="ml-auto flex items-center gap-2">
                {activeTab === "output" && result && (
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg-strong transition-colors"
                  >
                    <FontAwesomeIcon icon={copied ? faCheck : faCopy} className={cn("text-xs", copied && "text-green-400")} />
                    {copied ? "Copied!" : "Copy"}
                  </button>
                )}
                {activeTab === "interactive" && result && !result.error && (
                  <span className="text-xs text-fg-subtle">{result.execution_time_ms}ms</span>
                )}
                {activeTab === "interactive" && runCount > 0 && (
                  <button
                    onClick={() => { setLastRunQuery(""); setRunCount(0); }}
                    className="text-2xs text-fg-subtle hover:text-fg-base transition-colors px-1.5 py-0.5 rounded hover:bg-surface-100"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Output pane */}
            {activeTab === "output" && (
              <div className="flex-1 overflow-auto min-h-0">
                {!result && !isPending && (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", meta.bg)}>
                      <FontAwesomeIcon icon={selectedUserDb ? meta.icon : faCode} className={cn("text-xl", meta.color)} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-fg-base">
                        {selectedUserDb ? `${meta.label} ready` : "Select a database to begin"}
                      </p>
                      <p className="text-xs text-fg-subtle mt-1">
                        {selectedUserDb
                          ? "Write your query above and press Ctrl + Enter"
                          : "Choose a database from the toolbar"}
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
            )}

            {/* Browse pane */}
            {activeTab === "browse" && (
              <div className="flex-1 min-h-0 overflow-hidden">
                <SchemaBrowserPanel
                  clusterId={selectedClusterId}
                  dbType={dbType}
                  initialDatabase={selectedDatabase || undefined}
                />
              </div>
            )}

            {/* Interactive Mode pane */}
            {activeTab === "interactive" && (
              <div className="flex-1 min-h-0 overflow-hidden">
                <InteractiveModePanel
                  clusterId={selectedClusterId ?? ""}
                  database={selectedDatabase}
                  dbType={dbType}
                  lastQuery={lastRunQuery}
                  lastResult={result}
                  isRunning={isPending}
                />
              </div>
            )}

          </div>{/* /Results / Browse / Interactive toggle area */}
        </div>

        {/* ── Right panel: History / AI ─────────────────────────────── */}
        {rightPanel && (
        <div
          className="shrink-0 flex flex-row border-l border-surface-border bg-surface overflow-hidden"
          style={{ width: rightPanelWidth ?? 320 }}
        >
          {/* Horizontal drag handle */}
          <div
            onMouseDown={startHorizontalDrag}
            className="w-[5px] shrink-0 cursor-col-resize group flex items-center justify-center hover:bg-brand-500/20 transition-colors h-full"
            title="Drag to resize panel"
          >
            <div className="w-[3px] h-12 rounded-full bg-surface-border group-hover:bg-brand-500/50 transition-colors" />
          </div>

          {/* Panel inner */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Panel header */}
            <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-surface-border bg-surface-50">
              <span className="flex items-center gap-2 text-xs font-semibold text-fg-base">
                <FontAwesomeIcon
                  icon={rightPanel === "history" ? faClockRotateLeft : faRobot}
                  className="text-brand-400 text-xs"
                />
                {rightPanel === "history" ? "Query History" : "AI Assistant"}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                    onClick={() => openPanel(rightPanel === "history" ? "ai" : "history")}
                    className="text-2xs text-fg-subtle hover:text-fg-base transition-colors px-1.5 py-0.5 rounded hover:bg-surface-100"
                  >
                    Switch to {rightPanel === "history" ? "AI" : "History"}
                  </button>
                <button
                  onClick={() => openPanel(null)}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-fg-subtle hover:text-fg-base hover:bg-surface-100 transition-colors"
                  title="Close panel"
                >
                  <FontAwesomeIcon icon={faXmark} className="text-xs" />
                </button>
              </div>
            </div>

            {/* History content */}
            {rightPanel === "history" && (
              <div className="flex flex-col h-full overflow-hidden">
                {/* Header strip with clear button */}
                <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-surface-border bg-surface-50/60">
                  <span className="text-2xs text-fg-subtle">
                    {!selectedClusterId
                      ? "Select a cluster to view history"
                      : historyTotal === 0
                      ? "No history yet"
                      : `${historyTotal} entr${historyTotal !== 1 ? "ies" : "y"}`
                    }
                    {selectedDatabase ? ` · ${selectedDatabase}` : ""}
                  </span>
                  {historyTotal > 0 && selectedClusterId && (
                    <button
                      onClick={() => {
                        queryHistoryApi.clear(selectedClusterId, selectedDatabase)
                          .then(() => { setHistoryItems([]); setHistoryTotal(0); setHistoryPage(1); })
                          .catch(() => toast.error("Failed to clear history"));
                      }}
                      className="text-2xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {/* Items */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {historyLoading && historyItems.length === 0 ? (
                    <div className="h-full flex items-center justify-center gap-2">
                      <FontAwesomeIcon icon={faSpinner} className="animate-spin text-brand-400 text-sm" />
                      <span className="text-xs text-fg-subtle">Loading…</span>
                    </div>
                  ) : historyItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
                      <FontAwesomeIcon icon={faClockRotateLeft} className="text-fg-subtle/40 text-2xl" />
                      <p className="text-xs text-fg-subtle">
                        {selectedClusterId ? "Run a query to build history" : "Select a cluster first"}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-surface-border/40">
                      {historyItems.map((item) => {
                        const execAt = new Date(item.executed_at);
                        const now = Date.now();
                        const diffSec = Math.floor((now - execAt.getTime()) / 1000);
                        const relTime = diffSec < 60 ? `${diffSec}s ago`
                          : diffSec < 3600 ? `${Math.floor(diffSec / 60)}m ago`
                          : diffSec < 86400 ? `${Math.floor(diffSec / 3600)}h ago`
                          : execAt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                        return (
                          <button
                            key={item.id}
                            onClick={() => setQuery(item.query_text)}
                            className="w-full text-left px-3 py-2.5 hover:bg-surface-100 transition-colors group"
                          >
                            {/* Top row: timestamp + stats */}
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-2xs text-fg-subtle tabular-nums">{relTime}</span>
                              {item.had_error ? (
                                <span className="ml-auto text-2xs text-red-400 font-medium">error</span>
                              ) : (
                                <span className="ml-auto text-2xs text-fg-subtle tabular-nums">
                                  {item.row_count !== null && (
                                    <span className="text-green-400 mr-1.5">{item.row_count} row{item.row_count !== 1 ? "s" : ""}</span>
                                  )}
                                  {item.execution_time_ms !== null && `${item.execution_time_ms}ms`}
                                </span>
                              )}
                            </div>
                            {/* Query text */}
                            <p className="text-xs text-fg-muted group-hover:text-fg-base font-mono leading-relaxed line-clamp-2 break-all">
                              {item.query_text.replace(/\s+/g, " ").trim()}
                            </p>
                            {/* Error message */}
                            {item.had_error && item.error_message && (
                              <p className="text-2xs text-red-400/80 mt-0.5 truncate">{item.error_message}</p>
                            )}
                          </button>
                        );
                      })}
                      {historyLoading && (
                        <div className="flex justify-center py-2">
                          <FontAwesomeIcon icon={faSpinner} className="animate-spin text-brand-400 text-xs" />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Pagination footer */}
                {historyTotal > HISTORY_PAGE_SIZE && (
                  <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-surface-border bg-surface-50/60">
                    <button
                      disabled={historyPage <= 1 || historyLoading}
                      onClick={() => {
                        const p = historyPage - 1;
                        setHistoryPage(p);
                        loadHistory(selectedClusterId, selectedDatabase, p);
                      }}
                      className="text-2xs px-2 py-1 rounded border border-surface-border text-fg-muted hover:text-fg-base hover:border-brand-500/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      ← Newer
                    </button>
                    <span className="text-2xs text-fg-subtle tabular-nums">
                      {historyPage} / {Math.ceil(historyTotal / HISTORY_PAGE_SIZE)}
                    </span>
                    <button
                      disabled={historyPage >= Math.ceil(historyTotal / HISTORY_PAGE_SIZE) || historyLoading}
                      onClick={() => {
                        const p = historyPage + 1;
                        setHistoryPage(p);
                        loadHistory(selectedClusterId, selectedDatabase, p);
                      }}
                      className="text-2xs px-2 py-1 rounded border border-surface-border text-fg-muted hover:text-fg-base hover:border-brand-500/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      Older →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* AI content */}
            {rightPanel === "ai" && (
              <div className="flex-1 min-h-0 overflow-hidden">
                <AIAssistPanel
                  dbType={dbType}
                  dbVersion={""}
                  clusterId={selectedClusterId}
                  clusterName={selectedUserDb?.database_name ?? ""}
                  database={selectedDatabase}
                  messages={aiMessages}
                  setMessages={setAiMessages}
                  onUseSQL={(sql) => { setQuery(sql); toast.success("SQL inserted into editor"); }}
                  onExecute={(sql) => { setQuery(sql); handleRun(sql); }}
                  onClear={handleClearAiConversation}
                  onConversationUpdate={handleAiConversationUpdate}
                />
              </div>
            )}

          </div>
        </div>
        )}
      </div>

      {/* ── Status bar ────────────────────────────────────────────────────── */}
      <div className="shrink-0 h-6 flex items-center px-4 gap-4 border-t border-surface-border bg-surface-50">
        {selectedUserDb ? (
          <>
            <span className="flex items-center gap-1.5 text-2xs text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              {selectedUserDb.database_name}
            </span>
            <span className={cn("text-2xs font-medium", meta.color)}>
              {meta.label}
            </span>
          </>
        ) : (
          <span className="text-2xs text-fg-subtle">No database selected</span>
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

