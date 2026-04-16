"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShareNodes,
  faSpinner,
  faKey,
  faLink,
  faDatabase,
  faTriangleExclamation,
  faTableCellsLarge,
  faRotateRight,
  faMagnifyingGlassPlus,
  faMagnifyingGlassMinus,
  faFilter,
  faFileExport,
  faChevronDown,
  faCheck,
  faEye,
  faEyeSlash,
  faSitemap,
  faCircleInfo,
  faWandMagicSparkles,
  faXmark,
  faStop,
  faArrowRight,
  faRobot,
  faArrowRotateLeft,
  faArrowRotateRight,
  faFloppyDisk,
  faFolderOpen,
  faTrash,
  faPencil,
} from "@fortawesome/free-solid-svg-icons";
import { browserApi, aiApi, erdDiagramApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import Topbar from "@/components/layout/Topbar";
import toast from "react-hot-toast";
import { useUserDatabases } from "@/hooks/useClusters";
import type {
  BrowserColumn,
  BrowserForeignKey,
  BrowserTable,
  UserDatabase,
  ERDDiagram,
} from "@/types";

// ─── Layout constants ──────────────────────────────────────────────────────────
const TABLE_W   = 228;
const HEADER_H  = 38;
const COL_H     = 26;
const GRID_GAP_X = 96;
const GRID_GAP_Y = 72;
const GRID_COLS  = 4;

// ─── Types ─────────────────────────────────────────────────────────────────────
interface TableSchema {
  name:         string;
  schemaName:   string;
  columns:      BrowserColumn[];
  primary_keys: string[];
  foreign_keys: BrowserForeignKey[];
}
interface Pos { x: number; y: number; }
interface FKLine { id: string; path: string; label: string; srcX: number; srcY: number; dstX: number; dstY: number; }

// ─── Helpers ───────────────────────────────────────────────────────────────────
function tableHeight(t: TableSchema): number {
  return HEADER_H + Math.max(1, t.columns.length) * COL_H;
}

function colTypeColor(col: BrowserColumn): string {
  const t = (col.udt_name ?? col.data_type ?? "").toLowerCase();
  if (/int|serial|bigint|smallint|numeric|decimal|float|double|number/.test(t)) return "#60a5fa";
  if (/char|text|varchar|string|enum/.test(t)) return "#34d399";
  if (/bool/.test(t)) return "#f59e0b";
  if (/date|time|timestamp/.test(t)) return "#c084fc";
  if (/json|uuid/.test(t)) return "#fb923c";
  return "#94a3b8";
}

function shortType(col: BrowserColumn): string {
  const t = (col.udt_name ?? col.data_type ?? "?").toLowerCase();
  const map: Record<string, string> = {
    "character varying":               "varchar",
    character_varying:                 "varchar",
    "double precision":                "float8",
    "timestamp without time zone":     "timestamp",
    "timestamp with time zone":        "timestamptz",
    integer:   "int4",
    bigint:    "int8",
    smallint:  "int2",
    boolean:   "bool",
  };
  return map[t] ?? t;
}

function autoLayout(tables: TableSchema[]): Record<string, Pos> {
  const refCount: Record<string, number> = {};
  tables.forEach((t) =>
    t.foreign_keys.forEach((fk) => {
      refCount[fk.foreign_table] = (refCount[fk.foreign_table] ?? 0) + 1;
    })
  );
  const sorted = [...tables].sort(
    (a, b) => (refCount[b.name] ?? 0) - (refCount[a.name] ?? 0)
  );

  const positions: Record<string, Pos> = {};
  let col = 0, rowY = 40, rowMaxH = 0, x = 40;

  sorted.forEach((t) => {
    positions[t.name] = { x, y: rowY };
    rowMaxH = Math.max(rowMaxH, tableHeight(t));
    col++;
    if (col >= GRID_COLS) {
      col = 0;
      rowY += rowMaxH + GRID_GAP_Y;
      rowMaxH = 0;
      x = 40;
    } else {
      x += TABLE_W + GRID_GAP_X;
    }
  });
  return positions;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── DDL → TableSchema parser ──────────────────────────────────────────────────
// Parses PostgreSQL CREATE TABLE DDL into TableSchema objects for the canvas.
function parseDDLToSchemas(raw: string): TableSchema[] {
  const schemas: TableSchema[] = [];

  // Strip markdown code fences the AI may emit despite instructions
  const ddl = raw
    .replace(/^```[\w]*\n?/gim, "")
    .replace(/^```\s*$/gim, "");

  // Match each CREATE TABLE block
  const tableRegex =
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"?[\w]+"?\.)?"?(\w+)"?\s*\(([^;]+)\)/gis;

  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(ddl)) !== null) {
    const tableName = m[1];
    const body = m[2];

    const columns: BrowserColumn[] = [];
    const primary_keys: string[] = [];
    const foreign_keys: BrowserForeignKey[] = [];

    // Detect inline PRIMARY KEY constraint
    const pkConstraint = body.match(
      /PRIMARY\s+KEY\s*\(([^)]+)\)/i
    );
    if (pkConstraint) {
      pkConstraint[1]
        .split(",")
        .map((s) => s.replace(/"/g, "").trim())
        .forEach((k) => { if (k) primary_keys.push(k); });
    }

    // Detect FOREIGN KEY constraints
    const fkRegex =
      /FOREIGN\s+KEY\s*\(\s*"?(\w+)"?\s*\)\s*REFERENCES\s+"?(\w+)"?\s*\(\s*"?(\w+)"?\s*\)/gi;
    let fkM: RegExpExecArray | null;
    while ((fkM = fkRegex.exec(body)) !== null) {
      foreign_keys.push({
        constraint_name: `fk_${tableName}_${fkM[1]}`,
        column_name: fkM[1],
        foreign_table: fkM[2],
        foreign_column: fkM[3],
      });
    }

    // Parse column definitions (lines that are not constraints)
    const lines = body.split(",").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Skip constraint lines
      if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\s/i.test(line)) continue;

      // column_name  data_type  [optional modifiers]
      const colMatch = line.match(/^"?(\w+)"?\s+([\w\s()[\],']+?)(?:\s+DEFAULT\s+\S+|\s+NOT\s+NULL|\s+NULL|\s+REFERENCES|\s+UNIQUE|\s*$)/i);
      if (!colMatch) continue;

      const colName = colMatch[1];
      const rawType = colMatch[2].trim().toLowerCase().split(/\s+/)[0];

      const isInlinePK = /PRIMARY\s+KEY/i.test(line);
      const isInlineFK = /REFERENCES/i.test(line);
      const isNullable = !/NOT\s+NULL/i.test(line) && !isInlinePK ? "YES" : "NO";

      if (isInlinePK && !primary_keys.includes(colName)) {
        primary_keys.push(colName);
      }

      if (isInlineFK) {
        const inlineFKMatch = line.match(/REFERENCES\s+"?(\w+)"?\s*\(\s*"?(\w+)"?\s*\)/i);
        if (inlineFKMatch) {
          foreign_keys.push({
            constraint_name: `fk_${tableName}_${colName}`,
            column_name: colName,
            foreign_table: inlineFKMatch[1],
            foreign_column: inlineFKMatch[2],
          });
        }
      }

      columns.push({
        name: colName,
        data_type: rawType,
        udt_name: rawType,
        is_nullable: isNullable,
        column_default: null,
        character_maximum_length: null,
      });
    }

    if (tableName && columns.length > 0) {
      schemas.push({ name: tableName, schemaName: "public", columns, primary_keys, foreign_keys });
    }
  }

  return schemas;
}

// ─── AI ERD Bottom Bar ────────────────────────────────────────────────────────
const AI_SUGGESTIONS = [
  "E-commerce with users, products, orders & reviews",
  "Blog with posts, comments, tags & authors",
  "Add a notifications table linked to users",
  "SaaS with workspaces, members & subscriptions",
  "Remove the region table",
];

function AIERDPanel({
  existingTables,
  onApplySchemas,
  onFocusRef,
  initialPrompt,
}: {
  existingTables: TableSchema[];
  onApplySchemas: (schemas: TableSchema[], mode: "replace" | "merge") => void;
  onFocusRef?: (fn: () => void) => void;
  initialPrompt?: string;
}) {
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [inputFocused, setInputFocused] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [magicPhase, setMagicPhase] = useState<"idle" | "thinking" | "drawing" | "done" | "error">("idle");
  const [magicMsg, setMagicMsg] = useState("");
  const abortRef = useRef<{ abort: boolean }>({ abort: false });
  const ddlRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Apply initial prompt from page-level suggestion click
  useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt);
      inputRef.current?.focus();
    }
  }, [initialPrompt]);

  // Expose focus to parent
  useEffect(() => {
    onFocusRef?.(() => { inputRef.current?.focus(); });
  }, [onFocusRef]);

  // Image upload / paste state
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState("image/png");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const [header, b64] = dataUrl.split(",");
      const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
      setImageBase64(b64);
      setImageMimeType(mime);
      setImagePreviewUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }, []);

  const clearImage = useCallback(() => {
    setImageBase64(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) { e.preventDefault(); loadImageFile(file); }
        break;
      }
    }
  }, [loadImageFile]);

  const existingDDL = useMemo(() => {
    if (existingTables.length === 0) return "";
    return existingTables.map((t) => {
      const cols = t.columns.map((c) => {
        const isPK = t.primary_keys.includes(c.name);
        const isFK = t.foreign_keys.find((f) => f.column_name === c.name);
        let def = `  ${c.name} ${c.udt_name ?? c.data_type}`;
        if (isPK) def += " PRIMARY KEY";
        if (c.is_nullable === "NO" && !isPK) def += " NOT NULL";
        if (isFK) def += ` REFERENCES ${isFK.foreign_table}(${isFK.foreign_column})`;
        return def;
      }).join(",\n");
      return `CREATE TABLE ${t.name} (\n${cols}\n);`;
    }).join("\n\n");
  }, [existingTables]);

  const handleGenerate = useCallback(async () => {
    if ((!prompt.trim() && !imageBase64) || streaming) return;
    ddlRef.current = "";
    setStreaming(true);
    setMagicPhase("thinking");
    setMagicMsg("Thinking…");
    abortRef.current.abort = false;

    try {
      const stream = aiApi.erdGenerateStream({
        description: prompt.trim(),
        existingSchema: existingDDL,
        imageBase64: imageBase64 ?? undefined,
        imageMimeType: imageMimeType,
      });
      let chunkCount = 0;
      for await (const chunk of stream) {
        if (abortRef.current.abort) break;
        ddlRef.current += chunk;
        chunkCount++;
        if (chunkCount === 3) { setMagicPhase("drawing"); setMagicMsg("Designing schema…"); }
      }
      // Parse accumulated DDL into table schemas
      const schemas = parseDDLToSchemas(ddlRef.current);
      if (schemas.length === 0) {
        const commentOnly = /^[\s\-\-]+/.test(ddlRef.current.trim()) &&
          !/CREATE\s+TABLE/i.test(ddlRef.current);
        const errMsg = commentOnly
          ? (ddlRef.current.replace(/^--\s*/gm, "").trim().split("\n")[0] || "AI returned no CREATE TABLE statements")
          : "No tables could be parsed from the generated DDL";
        setMagicPhase("error");
        setMagicMsg(errMsg);
        toast.error(errMsg);
      } else {
        setMagicPhase("done");
        setMagicMsg(`${schemas.length} table${schemas.length !== 1 ? "s" : ""} applied to canvas`);
        onApplySchemas(schemas, "replace");
        toast.success(`Canvas updated — ${schemas.length} table${schemas.length !== 1 ? "s" : ""}`);
        setTimeout(() => { setMagicPhase("idle"); setMagicMsg(""); }, 2400);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI request failed";
      setMagicPhase("error");
      setMagicMsg(msg);
      toast.error(msg);
    } finally {
      setStreaming(false);
    }
  }, [prompt, streaming, existingDDL, imageBase64, imageMimeType, onApplySchemas]);

  const handleStop = () => { abortRef.current.abort = true; };
  const showSuggestions = magicPhase === "idle" && (prompt === "" || inputFocused);

  return (
    <div className="w-full flex flex-col items-center gap-2.5 pointer-events-none">
      {/* ── Suggestion chips ── */}
      {showSuggestions && (
        <div className="pointer-events-auto flex flex-wrap justify-center gap-2 max-w-2xl px-4">
          {AI_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { setPrompt(s); inputRef.current?.focus(); }}
              className="text-xs text-fg-muted hover:text-fg-base bg-surface-50/90 hover:bg-surface-100 border border-surface-border hover:border-brand-500/40 backdrop-blur-md rounded-full px-3 py-1.5 transition-all duration-150 shadow-sm"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* ── Magic status strip ── */}
      {magicPhase !== "idle" && (
        <div className={cn(
          "pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-2xl border backdrop-blur-md text-sm transition-all duration-300",
          magicPhase === "error"   ? "border-red-500/30 bg-red-500/10 text-red-400"
          : magicPhase === "done" ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-300"
          : "border-brand-500/25 bg-surface-50/90 text-fg-base"
        )}>
          {(magicPhase === "thinking" || magicPhase === "drawing") && (
            <div className="flex gap-1 items-center shrink-0">
              {[0, 120, 240].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          )}
          {magicPhase === "done" && <FontAwesomeIcon icon={faCheck} className="text-green-400 shrink-0" />}
          {magicPhase === "error" && <FontAwesomeIcon icon={faTriangleExclamation} className="text-red-400 shrink-0" />}
          <span className="text-xs font-medium">
            {magicPhase === "thinking" ? "Thinking…"
            : magicPhase === "drawing" ? "Designing schema…"
            : magicPhase === "done"    ? magicMsg
            : magicMsg}
          </span>
        </div>
      )}

      {/* ── Main input bar ── */}
      <div className="pointer-events-auto w-full max-w-2xl px-4">

        {/* Image preview pill */}
        {imagePreviewUrl && (
          <div className="relative mb-2 flex items-center gap-2 px-3 py-1.5 rounded-xl border border-brand-500/30 bg-surface-100/80 backdrop-blur-md w-fit max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreviewUrl} alt="Uploaded schema" className="h-8 w-8 rounded object-cover shrink-0" />
            <span className="text-2xs text-fg-subtle truncate">Image attached — AI will analyze it</span>
            <button onClick={clearImage} className="ml-1 w-4 h-4 flex items-center justify-center rounded-full bg-surface-200 hover:bg-red-500/40 text-fg-subtle hover:text-red-300 transition-colors shrink-0">
              <FontAwesomeIcon icon={faXmark} className="text-[9px]" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl border border-surface-border bg-surface-50/95 backdrop-blur-xl shadow-2xl shadow-black/20 ring-1 ring-surface-border/40">
          {/* Wand icon */}
          <FontAwesomeIcon icon={faWandMagicSparkles} className="text-brand-400 text-sm shrink-0 ml-1" />

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !streaming) handleGenerate();
            }}
            onPaste={handlePaste}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Describe your schema, or ask to modify it…"
            disabled={streaming}
            autoFocus
            className="flex-1 bg-transparent text-sm text-fg-base placeholder:text-fg-subtle outline-none disabled:opacity-50 min-w-0"
          />

          {/* Image upload */}
          {!streaming && (
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Upload image"
              className={cn(
                "w-7 h-7 flex items-center justify-center rounded-xl transition-colors shrink-0",
                imageBase64 ? "bg-brand-500/20 text-brand-300 border border-brand-500/40" : "text-fg-subtle hover:text-fg-base hover:bg-surface-100"
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909-.47-.47a.75.75 0 0 0-1.06 0L6.53 13.091 2.5 11.061Zm0-1.56 3.56 1.78a.75.75 0 0 0 .85-.12l2.5-2.5a.75.75 0 0 1 1.06 0l.47.47 1.91-1.909a2.25 2.25 0 0 1 3.182 0L18.5 13.06V5.25a.75.75 0 0 0-.75-.75H3.25a.75.75 0 0 0-.75.75v5ZM7 7.75a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {/* Hidden file input */}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImageFile(f); }} />

          {/* Divider */}
          <div className="w-px h-5 bg-surface-border shrink-0" />

          {/* Stop / Generate */}
          {streaming ? (
            <button onClick={handleStop} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium transition-colors shrink-0">
              <FontAwesomeIcon icon={faStop} className="text-xs" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() && !imageBase64}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors shrink-0"
            >
              <FontAwesomeIcon icon={faWandMagicSparkles} className="text-xs" />
              Generate
            </button>
          )}
        </div>

        {/* Existing context note */}
        {existingTables.length > 0 && showSuggestions && (
          <p className="text-center text-2xs text-fg-muted mt-1.5">
            <FontAwesomeIcon icon={faDatabase} className="mr-1 text-brand-400/70" />
            AI can see your {existingTables.length} existing table{existingTables.length !== 1 ? "s" : ""} — add, remove or modify any of them
          </p>
        )}
      </div>
    </div>
  );
}

// ─── SVG Export ────────────────────────────────────────────────────────────────
function generateERDSvg(
  tables: TableSchema[],
  positions: Record<string, Pos>,
  showCardinality: boolean
): string {
  const PADDING = 60;
  let maxX = 800, maxY = 600;
  tables.forEach((t) => {
    const pos = positions[t.name];
    if (pos) {
      maxX = Math.max(maxX, pos.x + TABLE_W + PADDING);
      maxY = Math.max(maxY, pos.y + tableHeight(t) + PADDING);
    }
  });

  const bgColor      = "#0d1117";
  const headerBg     = "#1f2937";
  const bodyBg       = "#161b22";
  const borderColor  = "#30363d";
  const textBase     = "#e6edf3";
  const textSubtle   = "#8b949e";
  const textMuted    = "#6e7681";
  const brandColor   = "#818cf8";

  const parts: string[] = [];

  // Background
  parts.push(`<rect width="${maxX}" height="${maxY}" fill="${bgColor}"/>`);

  // Dot grid
  parts.push(`<defs>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.8" fill="${textMuted}" fill-opacity="0.35"/>
    </pattern>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3.5" orient="auto">
      <path d="M0,0 L0,7 L10,3.5 z" fill="${brandColor}" fill-opacity="0.7"/>
    </marker>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`);
  parts.push(`<rect width="${maxX}" height="${maxY}" fill="url(#grid)"/>`);

  // FK relationship lines
  tables.forEach((t) => {
    t.foreign_keys.forEach((fk) => {
      const srcPos = positions[t.name];
      const dstPos = positions[fk.foreign_table];
      if (!srcPos || !dstPos) return;

      const srcColIdx = t.columns.findIndex((c) => c.name === fk.column_name);
      const dstTable  = tables.find((tb) => tb.name === fk.foreign_table);
      const dstColIdx = dstTable
        ? dstTable.columns.findIndex((c) => c.name === fk.foreign_column)
        : 0;

      const sy = srcPos.y + HEADER_H + (srcColIdx >= 0 ? srcColIdx : 0) * COL_H + COL_H / 2;
      const dy = dstPos.y + HEADER_H + (dstColIdx >= 0 ? dstColIdx : 0) * COL_H + COL_H / 2;

      let path: string;
      let srcEndX: number, dstEndX: number;

      if (srcPos.x + TABLE_W <= dstPos.x) {
        srcEndX = srcPos.x + TABLE_W;
        dstEndX = dstPos.x;
        const cp = Math.min(140, Math.abs(dstEndX - srcEndX) * 0.55);
        path = `M ${srcEndX} ${sy} C ${srcEndX + cp} ${sy}, ${dstEndX - cp} ${dy}, ${dstEndX} ${dy}`;
      } else if (dstPos.x + TABLE_W <= srcPos.x) {
        srcEndX = srcPos.x;
        dstEndX = dstPos.x + TABLE_W;
        const cp = Math.min(140, Math.abs(srcEndX - dstEndX) * 0.55);
        path = `M ${srcEndX} ${sy} C ${srcEndX - cp} ${sy}, ${dstEndX + cp} ${dy}, ${dstEndX} ${dy}`;
      } else {
        srcEndX = srcPos.x + TABLE_W;
        dstEndX = dstPos.x + TABLE_W;
        const bend = Math.max(srcPos.x, dstPos.x) + TABLE_W + 60;
        path = `M ${srcEndX} ${sy} C ${bend} ${sy}, ${bend} ${dy}, ${dstEndX} ${dy}`;
      }

      parts.push(`<path d="${path}" stroke="${brandColor}" stroke-opacity="0.55" stroke-width="1.5" fill="none" stroke-dasharray="6,3" marker-end="url(#arrow)">
        <title>${escapeXml(t.name)}.${escapeXml(fk.column_name)} → ${escapeXml(fk.foreign_table)}.${escapeXml(fk.foreign_column)}</title>
      </path>`);

      if (showCardinality) {
        // "N" label near source
        const nLabelX = srcPos.x + TABLE_W <= dstPos.x ? srcEndX + 12 : srcEndX - 18;
        parts.push(`<text x="${nLabelX}" y="${sy - 4}" font-size="10" fill="${brandColor}" fill-opacity="0.85" font-family="ui-monospace, monospace" font-weight="600">N</text>`);
        // "1" label near destination
        const oneLabelX = srcPos.x + TABLE_W <= dstPos.x ? dstEndX - 16 : dstEndX + 6;
        parts.push(`<text x="${oneLabelX}" y="${dy - 4}" font-size="10" fill="#34d399" fill-opacity="0.85" font-family="ui-monospace, monospace" font-weight="600">1</text>`);
      }
    });
  });

  // Table boxes
  tables.forEach((t) => {
    const pos = positions[t.name];
    if (!pos) return;
    const h = tableHeight(t);

    // Drop shadow
    parts.push(`<rect x="${pos.x + 3}" y="${pos.y + 3}" width="${TABLE_W}" height="${h}" rx="10" fill="#000" fill-opacity="0.35"/>`);
    // Body background
    parts.push(`<rect x="${pos.x}" y="${pos.y}" width="${TABLE_W}" height="${h}" rx="10" fill="${bodyBg}" stroke="${borderColor}" stroke-width="1"/>`);
    // Header background
    parts.push(`<rect x="${pos.x}" y="${pos.y}" width="${TABLE_W}" height="${HEADER_H}" rx="10" fill="${headerBg}" stroke="${borderColor}" stroke-width="1"/>`);
    // Cover bottom rounded corners of header
    parts.push(`<rect x="${pos.x}" y="${pos.y + HEADER_H - 6}" width="${TABLE_W}" height="6" fill="${headerBg}"/>`);
    // Header bottom divider
    parts.push(`<line x1="${pos.x}" y1="${pos.y + HEADER_H}" x2="${pos.x + TABLE_W}" y2="${pos.y + HEADER_H}" stroke="${borderColor}" stroke-width="1"/>`);

    // Table name
    parts.push(`<text x="${pos.x + 12}" y="${pos.y + HEADER_H / 2 + 5}" font-size="12" font-weight="700" fill="#93c5fd" font-family="ui-sans-serif, system-ui, sans-serif">${escapeXml(t.name)}</text>`);
    // Column count badge
    const badgeW = 28;
    parts.push(`<rect x="${pos.x + TABLE_W - badgeW - 6}" y="${pos.y + 10}" width="${badgeW}" height="16" rx="4" fill="${bgColor}" stroke="${borderColor}" stroke-width="1"/>`);
    parts.push(`<text x="${pos.x + TABLE_W - badgeW / 2 - 6}" y="${pos.y + 21}" font-size="9" fill="${textSubtle}" text-anchor="middle" font-family="ui-monospace, monospace">${t.columns.length}</text>`);

    // Columns
    t.columns.forEach((col, idx) => {
      const colY   = pos.y + HEADER_H + idx * COL_H;
      const isPK   = t.primary_keys.includes(col.name);
      const isFK   = t.foreign_keys.some((f) => f.column_name === col.name);
      const isLast = idx === t.columns.length - 1;

      // Row background tint
      if (isPK) {
        parts.push(`<rect x="${pos.x}" y="${colY}" width="${TABLE_W}" height="${COL_H}" fill="#78350f" fill-opacity="0.12" ${isLast ? `rx="0" ry="0"` : ""}/>`);
      } else if (isFK) {
        parts.push(`<rect x="${pos.x}" y="${colY}" width="${TABLE_W}" height="${COL_H}" fill="#1e3a5f" fill-opacity="0.18" ${isLast ? `rx="0" ry="0"` : ""}/>`);
      }

      // Row bottom divider (skip last)
      if (!isLast) {
        parts.push(`<line x1="${pos.x}" y1="${colY + COL_H}" x2="${pos.x + TABLE_W}" y2="${colY + COL_H}" stroke="${borderColor}" stroke-width="0.5" stroke-opacity="0.4"/>`);
      }

      // PK/FK badge text
      const badgeTextY = colY + COL_H / 2 + 4;
      if (isPK) {
        parts.push(`<text x="${pos.x + 10}" y="${badgeTextY}" font-size="8" fill="#fbbf24" font-family="ui-monospace, monospace" font-weight="700">PK</text>`);
      } else if (isFK) {
        parts.push(`<text x="${pos.x + 10}" y="${badgeTextY}" font-size="8" fill="#60a5fa" font-family="ui-monospace, monospace" font-weight="700">FK</text>`);
      }

      // Column name
      const nameColor = isPK ? "#fcd34d" : isFK ? "#93c5fd" : textMuted;
      parts.push(`<text x="${pos.x + 26}" y="${badgeTextY}" font-size="11" fill="${nameColor}" font-family="ui-monospace, SFMono-Regular, monospace">${escapeXml(col.name)}</text>`);

      // Nullable marker
      if (col.is_nullable === "YES") {
        parts.push(`<text x="${pos.x + TABLE_W - 38}" y="${badgeTextY}" font-size="9" fill="${textSubtle}" fill-opacity="0.5" font-family="ui-monospace, monospace">?</text>`);
      }

      // Type badge
      const typeColor = colTypeColor(col);
      parts.push(`<text x="${pos.x + TABLE_W - 7}" y="${badgeTextY}" font-size="9" fill="${typeColor}" text-anchor="end" font-family="ui-monospace, SFMono-Regular, monospace">${escapeXml(shortType(col))}</text>`);
    });

    // Round bottom corners clip (fake via rect overlay)
    parts.push(`<rect x="${pos.x}" y="${pos.y + h - 10}" width="${TABLE_W}" height="10" rx="0" fill="${bodyBg}"/>`);
    parts.push(`<rect x="${pos.x}" y="${pos.y + h - 10}" width="${TABLE_W}" height="10" rx="10" fill="${bodyBg}" stroke="${borderColor}" stroke-width="1"/>`);
  });

  // Title watermark
  parts.push(`<text x="12" y="${maxY - 10}" font-size="9" fill="${textSubtle}" fill-opacity="0.4" font-family="ui-sans-serif, sans-serif">Generated by PocketDB Manager</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}">${parts.join("")}</svg>`;
}

// ─── Main Page Component ────────────────────────────────────────────────────────
export default function ERDGeneratorPage() {
  // ── User Database selection ──────────────────────────────────────────────────
  const { data: rawUserDbs = [] } = useUserDatabases();
  const userDatabases = rawUserDbs as UserDatabase[];
  const [selectedDbId,     setSelectedDbId]     = useState<string>("");
  const [dbDropOpen,       setDbDropOpen]       = useState(false);

  // Derived from selected user database
  const selectedUserDb    = userDatabases.find((d) => d.id === selectedDbId) ?? null;
  const selectedClusterId = selectedUserDb?.cluster_id ?? "";
  const selectedDatabase  = selectedUserDb?.database_name ?? "";

  // ── ERD data ─────────────────────────────────────────────────────────────────
  const [tables,    setTables]    = useState<TableSchema[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [loadMsg,   setLoadMsg]   = useState("");
  const [error,     setError]     = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, Pos>>({});

  // ── Canvas state ─────────────────────────────────────────────────────────────
  const [zoom,      setZoom]      = useState(0.78);
  const [pan,       setPan]       = useState<Pos>({ x: 32, y: 32 });
  const [hoveredFK, setHoveredFK] = useState<string | null>(null);

  // ── Undo / Redo history ───────────────────────────────────────────────────
  type HistoryEntry = { tables: TableSchema[]; positions: Record<string, Pos> };
  const [history,    setHistory]    = useState<HistoryEntry[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [filterOpen,       setFilterOpen]       = useState(false);
  const [aiPanelOpen,      setAiPanelOpen]      = useState(true);
  const [aiInitialPrompt,  setAiInitialPrompt]  = useState<string | undefined>(undefined);
  const aiInputFocusFn = useRef<(() => void) | null>(null);
  const [hiddenTables,     setHiddenTables]     = useState<Set<string>>(new Set());
  const [view,             setView]             = useState<"erd" | "schema">("erd");
  const [showCardinality,  setShowCardinality]  = useState(true);
  const [filterSearch,     setFilterSearch]     = useState("");
  const [exportLoading,    setExportLoading]    = useState(false);

  // ── Saved diagrams state ───────────────────────────────────────────────────
  const [savedDiagrams,      setSavedDiagrams]      = useState<ERDDiagram[]>([]);
  const [savedDropOpen,      setSavedDropOpen]       = useState(false);
  const [saveModalOpen,      setSaveModalOpen]       = useState(false);
  const [saveName,           setSaveName]            = useState("");
  const [savingDiagram,      setSavingDiagram]       = useState(false);
  const [activeDiagramId,    setActiveDiagramId]     = useState<string | null>(null);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const zoomRef = useRef(zoom);
  const panRef  = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current  = pan;  }, [pan]);

  type DragState = { name: string; startX: number; startY: number; origX: number; origY: number };
  const dragRef    = useRef<DragState | null>(null);
  type PanState    = { startX: number; startY: number; origPX: number; origPY: number };
  const panDragRef = useRef<PanState | null>(null);

  // ── Fetch saved diagrams on mount ────────────────────────────────────────────
  useEffect(() => {
    erdDiagramApi.list().then((data: ERDDiagram[]) => setSavedDiagrams(data)).catch(() => {});
  }, []);

  // ── Fetch schema when database selected ──────────────────────────────────────
  useEffect(() => {
    if (!selectedDbId) return;
    const clusterId = selectedUserDb?.cluster_id ?? "";
    const dbName    = selectedUserDb?.database_name ?? "";
    if (!clusterId || !dbName) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTables([]);
    setPositions({});
    setHiddenTables(new Set());
    setLoadMsg("Fetching table list…");

    (async () => {
      try {
        const raw = await browserApi.listTables(clusterId, dbName);
        const tableList: BrowserTable[] = Array.isArray(raw) ? raw : (raw?.tables ?? []);
        if (cancelled) return;

        const limited = tableList.slice(0, 80);
        setLoadMsg(`Loading structure for ${limited.length} tables…`);

        const pgSchema = "public";
        const schemas: TableSchema[] = [];

        for (let i = 0; i < limited.length; i += 8) {
          if (cancelled) return;
          const batch = limited.slice(i, i + 8);
          const results = await Promise.all(
            batch.map(async (t) => {
              try {
                const s = await browserApi.getStructure(clusterId, dbName, t.name, pgSchema);
                return {
                  name:         t.name,
                  schemaName:   t.schema ?? pgSchema,
                  columns:      s.columns      ?? [],
                  primary_keys: s.primary_keys ?? [],
                  foreign_keys: s.foreign_keys ?? [],
                } as TableSchema;
              } catch {
                return { name: t.name, schemaName: pgSchema, columns: [], primary_keys: [], foreign_keys: [] } as TableSchema;
              }
            })
          );
          if (cancelled) return;
          schemas.push(...results);
          setLoadMsg(`Loaded ${schemas.length} / ${limited.length} tables…`);
        }

        if (cancelled) return;
        setTables(schemas);
        setPositions(autoLayout(schemas));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load schema");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDbId]);

  // ── Derived: visible tables (filter applied) ──────────────────────────────────
  const visibleTables = useMemo(
    () => tables.filter((t) => !hiddenTables.has(t.name)),
    [tables, hiddenTables]
  );

  // ── Canvas size ───────────────────────────────────────────────────────────────
  const canvasSize = useMemo(() => {
    let maxX = 1200, maxY = 800;
    visibleTables.forEach((t) => {
      const pos = positions[t.name];
      if (pos) {
        maxX = Math.max(maxX, pos.x + TABLE_W + 120);
        maxY = Math.max(maxY, pos.y + tableHeight(t) + 120);
      }
    });
    return { w: maxX, h: maxY };
  }, [visibleTables, positions]);

  // ── FK relationship lines ─────────────────────────────────────────────────────
  const fkLines = useMemo<FKLine[]>(() => {
    const lines: FKLine[] = [];
    const visibleNames = new Set(visibleTables.map((t) => t.name));

    visibleTables.forEach((t) => {
      t.foreign_keys.forEach((fk) => {
        if (!visibleNames.has(fk.foreign_table)) return;
        const srcPos = positions[t.name];
        const dstPos = positions[fk.foreign_table];
        if (!srcPos || !dstPos) return;

        const srcColIdx = t.columns.findIndex((c) => c.name === fk.column_name);
        const dstTable  = visibleTables.find((tb) => tb.name === fk.foreign_table);
        const dstColIdx = dstTable
          ? dstTable.columns.findIndex((c) => c.name === fk.foreign_column)
          : 0;

        const sy = srcPos.y + HEADER_H + (srcColIdx >= 0 ? srcColIdx : 0) * COL_H + COL_H / 2;
        const dy = dstPos.y + HEADER_H + (dstColIdx >= 0 ? dstColIdx : 0) * COL_H + COL_H / 2;

        let path: string;
        let srcEndX: number, dstEndX: number;

        if (srcPos.x + TABLE_W <= dstPos.x) {
          srcEndX = srcPos.x + TABLE_W;
          dstEndX = dstPos.x;
          const cp = Math.min(140, Math.abs(dstEndX - srcEndX) * 0.55);
          path = `M ${srcEndX} ${sy} C ${srcEndX + cp} ${sy}, ${dstEndX - cp} ${dy}, ${dstEndX} ${dy}`;
        } else if (dstPos.x + TABLE_W <= srcPos.x) {
          srcEndX = srcPos.x;
          dstEndX = dstPos.x + TABLE_W;
          const cp = Math.min(140, Math.abs(srcEndX - dstEndX) * 0.55);
          path = `M ${srcEndX} ${sy} C ${srcEndX - cp} ${sy}, ${dstEndX + cp} ${dy}, ${dstEndX} ${dy}`;
        } else {
          srcEndX = srcPos.x + TABLE_W;
          dstEndX = dstPos.x + TABLE_W;
          const bend = Math.max(srcPos.x, dstPos.x) + TABLE_W + 60;
          path = `M ${srcEndX} ${sy} C ${bend} ${sy}, ${bend} ${dy}, ${dstEndX} ${dy}`;
        }

        lines.push({
          id:    `${t.name}__${fk.column_name}__${fk.foreign_table}__${fk.foreign_column}`,
          path,
          label: `${t.name}.${fk.column_name} → ${fk.foreign_table}.${fk.foreign_column}`,
          srcX: srcEndX,
          srcY: sy,
          dstX: dstEndX,
          dstY: dy,
        });
      });
    });
    return lines;
  }, [visibleTables, positions]);

  const fkCount = useMemo(() => fkLines.length, [fkLines]);

  // ── Table drag ────────────────────────────────────────────────────────────────
  const onTableMouseDown = useCallback((e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    const pos = positions[name];
    if (!pos) return;
    dragRef.current = { name, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  }, [positions]);

  // ── Canvas pan ────────────────────────────────────────────────────────────────
  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    panDragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origPX: panRef.current.x, origPY: panRef.current.y,
    };
  }, []);

  // ── Global mouse move/up ──────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const { name, startX, startY, origX, origY } = dragRef.current;
        const z = zoomRef.current;
        setPositions((prev) => ({
          ...prev,
          [name]: {
            x: Math.max(0, origX + (e.clientX - startX) / z),
            y: Math.max(0, origY + (e.clientY - startY) / z),
          },
        }));
      } else if (panDragRef.current) {
        const { startX, startY, origPX, origPY } = panDragRef.current;
        const next = { x: origPX + (e.clientX - startX), y: origPY + (e.clientY - startY) };
        setPan(next);
        panRef.current = next;
      }
    };
    const onUp = () => { dragRef.current = null; panDragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, []);

  // ── Wheel zoom ────────────────────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const next = Math.min(2.2, Math.max(0.15, zoomRef.current - e.deltaY * 0.0008));
    setZoom(next);
    zoomRef.current = next;
  }, []);

  // ── Reset view ────────────────────────────────────────────────────────────────
  const resetView = useCallback(() => {
    const z = 0.78;
    const p = { x: 32, y: 32 };
    setZoom(z); zoomRef.current = z;
    setPan(p);  panRef.current  = p;
    if (tables.length > 0) setPositions(autoLayout(tables));
  }, [tables]);

  // ── Toggle table visibility ───────────────────────────────────────────────────
  const toggleTable = useCallback((name: string) => {
    setHiddenTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const showAllTables  = useCallback(() => setHiddenTables(new Set()), []);
  const hideAllTables  = useCallback(() => setHiddenTables(new Set(tables.map((t) => t.name))), [tables]);

  // ── Push to undo history ──────────────────────────────────────────────────
  const pushHistory = useCallback((t: TableSchema[], pos: Record<string, Pos>) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIdx + 1);
      return [...trimmed, { tables: t, positions: pos }].slice(-40);
    });
    setHistoryIdx((prev) => Math.min(prev + 1, 39));
  }, [historyIdx]);

  // ── Save diagram ──────────────────────────────────────────────────────────────
  const handleSaveDiagram = useCallback(async () => {
    if (tables.length === 0 || !saveName.trim()) return;
    setSavingDiagram(true);
    try {
      if (activeDiagramId) {
        const updated: ERDDiagram = await erdDiagramApi.update(activeDiagramId, {
          name: saveName.trim(),
          tables_json: tables,
          positions_json: positions,
        });
        setSavedDiagrams((prev) => prev.map((d) => d.id === updated.id ? updated : d));
        toast.success("Diagram updated");
      } else {
        const created: ERDDiagram = await erdDiagramApi.create({
          name: saveName.trim(),
          cluster_id: selectedClusterId || null,
          database_name: selectedDatabase || null,
          tables_json: tables,
          positions_json: positions,
        });
        setSavedDiagrams((prev) => [created, ...prev]);
        setActiveDiagramId(created.id);
        toast.success("Diagram saved");
      }
      setSaveModalOpen(false);
    } catch {
      toast.error("Failed to save diagram");
    } finally {
      setSavingDiagram(false);
    }
  }, [tables, positions, saveName, activeDiagramId, selectedClusterId, selectedDatabase]);

  // ── Load diagram ──────────────────────────────────────────────────────────────
  const handleLoadDiagram = useCallback((diagram: ERDDiagram) => {
    const loadedTables = diagram.tables_json as TableSchema[];
    const loadedPositions = diagram.positions_json as Record<string, Pos>;
    pushHistory(loadedTables, loadedPositions);
    setTables(loadedTables);
    setPositions(loadedPositions);
    setHiddenTables(new Set());
    setActiveDiagramId(diagram.id);
    setSaveName(diagram.name);
    setSavedDropOpen(false);
    const z = 0.78;
    const p = { x: 32, y: 32 };
    setZoom(z); zoomRef.current = z;
    setPan(p);  panRef.current  = p;
    toast.success(`Loaded "${diagram.name}"`);
  }, [pushHistory]);

  // ── Delete saved diagram ──────────────────────────────────────────────────────
  const handleDeleteDiagram = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await erdDiagramApi.delete(id);
      setSavedDiagrams((prev) => prev.filter((d) => d.id !== id));
      if (activeDiagramId === id) {
        setActiveDiagramId(null);
        setSaveName("");
      }
      toast.success("Diagram deleted");
    } catch {
      toast.error("Failed to delete diagram");
    }
  }, [activeDiagramId]);

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const entry = history[historyIdx - 1];
    setHistoryIdx((i) => i - 1);
    setTables(entry.tables);
    setPositions(entry.positions);
    setHiddenTables(new Set());
  }, [history, historyIdx]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const entry = history[historyIdx + 1];
    setHistoryIdx((i) => i + 1);
    setTables(entry.tables);
    setPositions(entry.positions);
    setHiddenTables(new Set());
  }, [history, historyIdx]);

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  // ── Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z) ───────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  // ── Apply AI-generated schemas to canvas ──────────────────────────────────────
  const applyAISchemas = useCallback((schemas: TableSchema[], mode: "replace" | "merge") => {
    const merged = mode === "merge"
      ? [
          ...tables.filter((t) => !schemas.some((s) => s.name === t.name)),
          ...schemas,
        ]
      : schemas;
    const newPos = autoLayout(merged);
    pushHistory(merged, newPos);
    setTables(merged);
    setPositions(newPos);
    setHiddenTables(new Set());
    const z = 0.78;
    const p = { x: 32, y: 32 };
    setZoom(z); zoomRef.current = z;
    setPan(p);  panRef.current  = p;
  }, [tables, pushHistory]);

  // ── SVG Export ────────────────────────────────────────────────────────────────
  const exportSVG = useCallback(() => {
    if (visibleTables.length === 0) return;
    setExportLoading(true);
    try {
      const svgStr = generateERDSvg(visibleTables, positions, showCardinality);
      const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${selectedDatabase || "erd"}_diagram.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  }, [visibleTables, positions, showCardinality, selectedDatabase]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const filteredTableList = tables.filter((t) =>
    filterSearch === "" || t.name.toLowerCase().includes(filterSearch.toLowerCase())
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="ER Diagram Generator"
        subtitle={selectedUserDb ? selectedUserDb.database_name : undefined}
      />

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-surface-border bg-surface flex-wrap">

        {/* My Database Picker */}
        <div className="relative">
          <button
            onClick={() => setDbDropOpen((o) => !o)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors min-w-[180px]",
              dbDropOpen
                ? "border-brand-500/60 bg-brand-500/8 text-fg-base"
                : "border-surface-border bg-surface hover:bg-surface-100 text-fg-muted hover:text-fg-base"
            )}
          >
            <FontAwesomeIcon icon={faDatabase} className="text-brand-400 text-xs shrink-0" />
            <span className="flex-1 text-left truncate">
              {selectedUserDb ? selectedUserDb.database_name : "Select database"}
            </span>
            {selectedUserDb && (
              <span className="text-2xs px-1.5 py-0.5 rounded-full font-medium bg-brand-500/15 text-brand-300 shrink-0">
                {selectedUserDb.db_type}
              </span>
            )}
            <FontAwesomeIcon icon={faChevronDown} className="text-xs shrink-0 text-fg-subtle" />
          </button>

          {dbDropOpen && (
            <div className="absolute z-50 top-full mt-1 left-0 w-64 rounded-xl border border-surface-border bg-surface shadow-xl shadow-black/30 overflow-hidden">
              <div className="p-1 max-h-64 overflow-y-auto">
                {userDatabases.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-fg-subtle italic">No databases found — create one first</p>
                ) : (
                  userDatabases.map((db) => (
                    <button
                      key={db.id}
                      onClick={() => {
                        setSelectedDbId(db.id);
                        setDbDropOpen(false);
                        setTables([]);
                        setError(null);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                        selectedDbId === db.id
                          ? "bg-brand-500/15 text-fg-base"
                          : "text-fg-muted hover:bg-surface-100 hover:text-fg-base"
                      )}
                    >
                      <FontAwesomeIcon icon={faDatabase} className="text-brand-400 text-xs shrink-0" />
                      <span className="flex-1 text-left truncate font-mono text-xs">{db.database_name}</span>
                      <span className="text-2xs px-1.5 py-0.5 rounded-full font-medium bg-surface-200 text-fg-subtle shrink-0">
                        {db.db_type}
                      </span>
                      {selectedDbId === db.id && (
                        <FontAwesomeIcon icon={faCheck} className="text-brand-400 text-xs shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-surface-border mx-1 shrink-0" />

        {/* View toggle */}
        <div className="flex items-center rounded-lg bg-surface-100 border border-surface-border p-0.5 gap-0.5">
          <button
            onClick={() => setView("erd")}
            className={cn(
              "px-2.5 py-1.5 text-xs rounded-md font-medium transition-colors flex items-center gap-1.5",
              view === "erd" ? "bg-brand-600 text-white shadow-sm" : "text-fg-subtle hover:text-fg-base"
            )}
          >
            <FontAwesomeIcon icon={faShareNodes} className="text-xs" />
            ERD
          </button>
          <button
            onClick={() => setView("schema")}
            className={cn(
              "px-2.5 py-1.5 text-xs rounded-md font-medium transition-colors flex items-center gap-1.5",
              view === "schema" ? "bg-brand-600 text-white shadow-sm" : "text-fg-subtle hover:text-fg-base"
            )}
          >
            <FontAwesomeIcon icon={faTableCellsLarge} className="text-xs" />
            Schema
          </button>
        </div>

        {/* Cardinality toggle */}
        {view === "erd" && (
          <button
            onClick={() => setShowCardinality((v) => !v)}
            title={showCardinality ? "Hide cardinality labels" : "Show cardinality labels (N:1)"}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors",
              showCardinality
                ? "border-brand-500/40 bg-brand-500/10 text-brand-300"
                : "border-surface-border bg-surface text-fg-subtle hover:text-fg-base hover:bg-surface-100"
            )}
          >
            <FontAwesomeIcon icon={faCircleInfo} className="text-xs" />
            N:1
          </button>
        )}

        {/* Zoom controls */}
        {view === "erd" && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { const n = Math.min(2.2, zoomRef.current + 0.1); setZoom(n); zoomRef.current = n; }}
              className="w-7 h-7 rounded-md border border-surface-border bg-surface hover:bg-surface-100 flex items-center justify-center text-fg-subtle hover:text-fg-base transition-colors"
              title="Zoom in"
            >
              <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="text-xs" />
            </button>
            <span className="text-xs text-fg-subtle w-10 text-center tabular-nums select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => { const n = Math.max(0.15, zoomRef.current - 0.1); setZoom(n); zoomRef.current = n; }}
              className="w-7 h-7 rounded-md border border-surface-border bg-surface hover:bg-surface-100 flex items-center justify-center text-fg-subtle hover:text-fg-base transition-colors"
              title="Zoom out"
            >
              <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="text-xs" />
            </button>
            <button
              onClick={resetView}
              className="w-7 h-7 rounded-md border border-surface-border bg-surface hover:bg-surface-100 flex items-center justify-center text-fg-subtle hover:text-fg-base transition-colors"
              title="Reset layout"
            >
              <FontAwesomeIcon icon={faRotateRight} className="text-xs" />
            </button>
          </div>
        )}

        {/* Undo / Redo */}
        {(canUndo || canRedo) && (
          <div className="flex items-center gap-1">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className={cn(
                "w-7 h-7 rounded-md border flex items-center justify-center text-xs transition-colors",
                canUndo
                  ? "border-surface-border bg-surface hover:bg-surface-100 text-fg-subtle hover:text-fg-base"
                  : "border-surface-border/40 bg-surface/40 text-fg-subtle/30 cursor-not-allowed"
              )}
            >
              <FontAwesomeIcon icon={faArrowRotateLeft} />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              className={cn(
                "w-7 h-7 rounded-md border flex items-center justify-center text-xs transition-colors",
                canRedo
                  ? "border-surface-border bg-surface hover:bg-surface-100 text-fg-subtle hover:text-fg-base"
                  : "border-surface-border/40 bg-surface/40 text-fg-subtle/30 cursor-not-allowed"
              )}
            >
              <FontAwesomeIcon icon={faArrowRotateRight} />
            </button>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Saved Diagrams dropdown */}
        <div className="relative">
          <button
            onClick={() => { setSavedDropOpen((o) => !o); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              savedDropOpen
                ? "border-brand-500/50 bg-brand-500/10 text-brand-300"
                : "border-surface-border bg-surface text-fg-muted hover:text-fg-base hover:bg-surface-100"
            )}
            title="Load a saved diagram"
          >
            <FontAwesomeIcon icon={faFolderOpen} className="text-xs" />
            Saved
            {savedDiagrams.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-2xs bg-surface-200 text-fg-subtle font-semibold">
                {savedDiagrams.length}
              </span>
            )}
            <FontAwesomeIcon icon={faChevronDown} className="text-xs text-fg-subtle" />
          </button>

          {savedDropOpen && (
            <div className="absolute z-50 top-full mt-1 right-0 w-72 rounded-xl border border-surface-border bg-surface shadow-xl shadow-black/30 overflow-hidden">
              <div className="p-2 border-b border-surface-border">
                <p className="text-xs font-medium text-fg-subtle px-1">Saved Diagrams</p>
              </div>
              <div className="p-1 max-h-64 overflow-y-auto">
                {savedDiagrams.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-fg-subtle italic text-center">No saved diagrams yet</p>
                ) : (
                  savedDiagrams.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => handleLoadDiagram(d)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer group",
                        activeDiagramId === d.id
                          ? "bg-brand-500/15 text-fg-base"
                          : "text-fg-muted hover:bg-surface-100 hover:text-fg-base"
                      )}
                    >
                      <FontAwesomeIcon icon={faFloppyDisk} className="text-brand-400 text-xs shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{d.name}</p>
                        {d.database_name && (
                          <p className="text-2xs text-fg-subtle truncate">{d.database_name}</p>
                        )}
                      </div>
                      {activeDiagramId === d.id && (
                        <FontAwesomeIcon icon={faCheck} className="text-brand-400 text-xs shrink-0" />
                      )}
                      <button
                        onClick={(e) => handleDeleteDiagram(d.id, e)}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-fg-subtle hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                        title="Delete diagram"
                      >
                        <FontAwesomeIcon icon={faTrash} className="text-xs" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={() => {
            if (tables.length === 0) { toast.error("Nothing to save — add tables first"); return; }
            setSaveName(activeDiagramId ? (savedDiagrams.find((d) => d.id === activeDiagramId)?.name ?? "") : (selectedDatabase ? `${selectedDatabase} diagram` : "My Diagram"));
            setSaveModalOpen(true);
          }}
          disabled={tables.length === 0}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
            tables.length === 0
              ? "opacity-40 cursor-not-allowed border-surface-border bg-surface text-fg-subtle"
              : "border-brand-500/40 bg-brand-500/8 text-brand-300 hover:bg-brand-500/15 hover:border-brand-500/60"
          )}
          title={activeDiagramId ? "Update saved diagram" : "Save diagram"}
        >
          <FontAwesomeIcon icon={faFloppyDisk} className="text-xs" />
          {activeDiagramId ? "Update" : "Save"}
        </button>

        {/* AI Design button */}
        <button
          onClick={() => {
            if (aiPanelOpen) {
              aiInputFocusFn.current?.();
            } else {
              setAiPanelOpen(true);
              setFilterOpen(false);
            }
          }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
            "border-brand-500/30 bg-brand-500/5 text-brand-400 hover:bg-brand-500/10 hover:border-brand-500/50"
          )}
          title="AI Schema Designer — generate ERD from a description"
        >
          <FontAwesomeIcon icon={faWandMagicSparkles} className="text-xs" />
          AI Design
        </button>

        {/* Filter toggle */}
        {tables.length > 0 && (
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              filterOpen
                ? "border-brand-500/50 bg-brand-500/10 text-brand-300"
                : "border-surface-border bg-surface text-fg-muted hover:text-fg-base hover:bg-surface-100"
            )}
          >
            <FontAwesomeIcon icon={faFilter} className="text-xs" />
            Filter
            {hiddenTables.size > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-2xs bg-brand-500/20 text-brand-300 font-semibold">
                {tables.length - hiddenTables.size}/{tables.length}
              </span>
            )}
          </button>
        )}

        {/* Export SVG */}
        <button
          onClick={exportSVG}
          disabled={visibleTables.length === 0 || exportLoading}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
            visibleTables.length === 0
              ? "opacity-40 cursor-not-allowed border-surface-border bg-surface text-fg-subtle"
              : "border-green-500/40 bg-green-500/8 text-green-300 hover:bg-green-500/15 hover:border-green-500/60"
          )}
          title="Export diagram as SVG file"
        >
          {exportLoading
            ? <FontAwesomeIcon icon={faSpinner} className="text-xs animate-spin" />
            : <FontAwesomeIcon icon={faFileExport} className="text-xs" />
          }
          Export SVG
        </button>
      </div>

      {/* ── Main body ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ── Canvas / Schema area ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative select-none">

          {/* Empty state – no tables loaded */}
          {!selectedDbId && tables.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center px-8">
              <div className="w-20 h-20 rounded-2xl bg-brand-500/8 border border-brand-500/15 flex items-center justify-center">
                <FontAwesomeIcon icon={faShareNodes} className="text-brand-400 text-3xl" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-fg-base mb-2">ER Diagram Generator</h2>
                <p className="text-sm text-fg-subtle max-w-sm">
                  Select a database above to automatically generate an interactive
                  Entity-Relationship diagram from your schema.
                </p>
              </div>
              <div className="flex items-center gap-6 text-xs text-fg-subtle mt-2">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-amber-500/20 border border-amber-500/50 inline-block" />
                  Primary Key
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-blue-500/20 border border-blue-500/50 inline-block" />
                  Foreign Key
                </span>
                <span className="flex items-center gap-2">
                  <svg width="28" height="8" viewBox="0 0 28 8" className="inline-block">
                    <path d="M 0 4 C 7 4, 21 4, 28 4" stroke="#6366f1" strokeWidth="1.5" fill="none" strokeDasharray="4,2" />
                  </svg>
                  Relationship
                </span>
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {loading && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4"
              style={{ background: "var(--color-bg, #0d1117)" }}
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                  <FontAwesomeIcon icon={faShareNodes} className="text-brand-400 text-2xl" />
                </div>
                <FontAwesomeIcon icon={faSpinner} className="text-brand-400 text-sm animate-spin absolute -top-1 -right-1" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-fg-base">{loadMsg}</p>
                <p className="text-xs text-fg-subtle mt-1">Building interactive diagram…</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-red-400 text-2xl" />
              </div>
              <div className="text-center max-w-sm">
                <p className="text-sm font-medium text-fg-base">Failed to load schema</p>
                <p className="text-xs text-red-400 mt-2 font-mono break-all">{error}</p>
              </div>
            </div>
          )}

          {/* ── ERD Canvas ─────────────────────────────────────────────────── */}
          {!loading && !error && view === "erd" && visibleTables.length > 0 && (
            <div
              className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
              style={{
                background: `
                  radial-gradient(circle at 50% 50%, transparent 60%, var(--bg) 100%),
                  radial-gradient(circle at 1px 1px, rgb(var(--surface-100)) 1px, transparent 0) 0 0 / 24px 24px
                `,
              }}
              onMouseDown={onCanvasMouseDown}
              onWheel={onWheel}
            >
              <div
                style={{
                  position:        "relative",
                  width:           canvasSize.w,
                  height:          canvasSize.h,
                  transformOrigin: "0 0",
                  transform:       `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
              >
                {/* SVG FK lines + cardinality */}
                <svg
                  style={{
                    position:      "absolute",
                    inset:         0,
                    width:         canvasSize.w,
                    height:        canvasSize.h,
                    pointerEvents: "none",
                    overflow:      "visible",
                  }}
                >
                  <defs>
                    <marker id="erd-arrowhead" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L9,3 z" fill="#6366f1" opacity="0.75" />
                    </marker>
                    <marker id="erd-arrowhead-hov" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L9,3 z" fill="#818cf8" opacity="1" />
                    </marker>
                    <filter id="line-glow">
                      <feGaussianBlur stdDeviation="2" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>

                  {fkLines.map((line) => {
                    const isHov = hoveredFK === line.id;
                    // "N" near source, "1" near destination
                    const nX = line.srcX + (line.srcX < line.dstX ? 10 : -18);
                    const oneX = line.dstX + (line.dstX > line.srcX ? -18 : 10);
                    return (
                      <g key={line.id}>
                        <path
                          d={line.path}
                          stroke={isHov ? "#818cf8" : "#6366f1"}
                          strokeOpacity={isHov ? 1 : 0.45}
                          strokeWidth={isHov ? 2.5 : 1.5}
                          fill="none"
                          strokeDasharray={isHov ? "none" : "6,3"}
                          markerEnd={isHov ? "url(#erd-arrowhead-hov)" : "url(#erd-arrowhead)"}
                          filter={isHov ? "url(#line-glow)" : undefined}
                          style={{ pointerEvents: "visibleStroke", cursor: "default" }}
                          onMouseEnter={() => setHoveredFK(line.id)}
                          onMouseLeave={() => setHoveredFK(null)}
                        >
                          <title>{line.label}</title>
                        </path>

                        {/* Cardinality labels */}
                        {showCardinality && (
                          <>
                            <text
                              x={nX}
                              y={line.srcY - 5}
                              fontSize="10"
                              fontWeight="700"
                              fill={isHov ? "#818cf8" : "#6366f1"}
                              fillOpacity={isHov ? 1 : 0.7}
                              fontFamily="ui-monospace, monospace"
                              style={{ pointerEvents: "none" }}
                            >
                              N
                            </text>
                            <text
                              x={oneX}
                              y={line.dstY - 5}
                              fontSize="10"
                              fontWeight="700"
                              fill={isHov ? "#34d399" : "#22c55e"}
                              fillOpacity={isHov ? 1 : 0.7}
                              fontFamily="ui-monospace, monospace"
                              style={{ pointerEvents: "none" }}
                            >
                              1
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* Table boxes */}
                {visibleTables.map((t) => {
                  const pos = positions[t.name] ?? { x: 0, y: 0 };
                  return (
                    <div
                      key={t.name}
                      style={{ position: "absolute", left: pos.x, top: pos.y, width: TABLE_W, userSelect: "none" }}
                      className="rounded-xl border border-surface-border bg-[#161b22] shadow-lg shadow-black/50 overflow-hidden"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {/* Header – drag handle */}
                      <div
                        className="flex items-center gap-2 px-2.5 py-2 bg-surface-100 border-b border-surface-border cursor-move select-none"
                        onMouseDown={(e) => onTableMouseDown(e, t.name)}
                      >
                        <FontAwesomeIcon icon={faDatabase} className="text-brand-400 text-xs shrink-0" />
                        <span className="text-xs font-bold text-fg-base truncate flex-1" title={t.name}>{t.name}</span>
                        <span
                          className="text-2xs text-fg-subtle shrink-0 bg-surface px-1.5 py-0.5 rounded border border-surface-border/60"
                          title={`${t.columns.length} columns`}
                        >
                          {t.columns.length}
                        </span>
                      </div>

                      {/* Column rows */}
                      {t.columns.map((col) => {
                        const isPK     = t.primary_keys.includes(col.name);
                        const isFK     = t.foreign_keys.some((fk) => fk.column_name === col.name);
                        const fkTarget = isFK ? t.foreign_keys.find((fk) => fk.column_name === col.name) : null;
                        return (
                          <div
                            key={col.name}
                            title={fkTarget ? `FK → ${fkTarget.foreign_table}.${fkTarget.foreign_column}` : `${col.name} ${shortType(col)}`}
                            className={cn(
                              "flex items-center gap-1.5 px-2 border-b border-surface-border/25 last:border-b-0",
                              isPK && "bg-amber-500/6",
                              isFK && !isPK && "bg-blue-500/6",
                            )}
                            style={{ height: COL_H }}
                          >
                            <span className="w-4 shrink-0 flex items-center justify-center">
                              {isPK && <FontAwesomeIcon icon={faKey}  className="text-amber-400" style={{ fontSize: 9 }} />}
                              {isFK && !isPK && <FontAwesomeIcon icon={faLink} className="text-blue-400" style={{ fontSize: 9 }} />}
                            </span>
                            <span className={cn(
                              "text-xs font-mono flex-1 truncate",
                              isPK ? "text-amber-300" : isFK ? "text-blue-300" : "text-fg-muted"
                            )}>
                              {col.name}
                            </span>
                            {col.is_nullable === "YES" && (
                              <span className="text-fg-subtle/40 text-xs shrink-0">?</span>
                            )}
                            <span
                              className="text-2xs font-mono shrink-0 px-1 rounded leading-tight"
                              style={{ color: colTypeColor(col), background: colTypeColor(col) + "18" }}
                            >
                              {shortType(col)}
                            </span>
                          </div>
                        );
                      })}

                      {t.columns.length === 0 && (
                        <div className="px-3 py-2 text-2xs text-fg-subtle italic text-center">No columns loaded</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Schema List view ──────────────────────────────────────────── */}
          {!loading && !error && view === "schema" && (
            <div className="h-full overflow-y-auto p-5">
              {visibleTables.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <FontAwesomeIcon icon={faDatabase} className="text-fg-subtle/30 text-4xl" />
                  <p className="text-sm text-fg-subtle">
                    {tables.length === 0
                      ? `No tables found${selectedDatabase ? ` in ${selectedDatabase}` : ""}`
                      : "All tables are hidden — open the filter panel to show them"}
                  </p>
                </div>
              ) : (
                <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {visibleTables.map((t) => (
                    <div
                      key={t.name}
                      className="rounded-xl border border-surface-border bg-surface-50 overflow-hidden flex flex-col"
                    >
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-100 border-b border-surface-border">
                        <FontAwesomeIcon icon={faDatabase} className="text-brand-400 text-xs shrink-0" />
                        <span className="text-sm font-bold text-fg-base truncate flex-1" title={t.name}>{t.name}</span>
                        <span className="text-xs text-fg-subtle shrink-0">
                          {t.columns.length} col{t.columns.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="divide-y divide-surface-border/30 flex-1">
                        {t.columns.map((col) => {
                          const isPK = t.primary_keys.includes(col.name);
                          const isFK = t.foreign_keys.some((fk) => fk.column_name === col.name);
                          return (
                            <div
                              key={col.name}
                              className={cn(
                                "flex items-center gap-2 px-3 py-1.5",
                                isPK && "bg-amber-500/5",
                                isFK && !isPK && "bg-blue-500/5",
                              )}
                            >
                              <span className="w-4 shrink-0 flex items-center justify-center">
                                {isPK && <FontAwesomeIcon icon={faKey}  className="text-amber-400" style={{ fontSize: 9 }} />}
                                {isFK && !isPK && <FontAwesomeIcon icon={faLink} className="text-blue-400" style={{ fontSize: 9 }} />}
                              </span>
                              <span className={cn(
                                "text-xs font-mono flex-1 truncate",
                                isPK ? "text-amber-300" : isFK ? "text-blue-300" : "text-fg-muted",
                              )}>
                                {col.name}
                              </span>
                              {col.is_nullable === "YES" && (
                                <span className="text-2xs text-fg-subtle/50">nullable</span>
                              )}
                              <span className="text-2xs font-mono shrink-0" style={{ color: colTypeColor(col) }}>
                                {shortType(col)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {t.foreign_keys.length > 0 && (
                        <div className="px-3 py-2 border-t border-surface-border bg-surface-100/60">
                          <p className="text-2xs text-fg-subtle mb-1.5 font-semibold uppercase tracking-wide">Foreign Keys</p>
                          {t.foreign_keys.map((fk) => (
                            <p key={fk.constraint_name} className="text-2xs text-blue-400 font-mono truncate mb-0.5">
                              <span className="text-fg-subtle">{fk.column_name}</span>
                              {" → "}
                              <span className="text-blue-300">{fk.foreign_table}</span>
                              <span className="text-fg-subtle">.{fk.foreign_column}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── AI Design Bottom Bar ────────────────────────────────────── */}
        <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-center pointer-events-none">
          <AIERDPanel
            existingTables={tables}
            initialPrompt={aiInitialPrompt}
            onFocusRef={(fn) => { aiInputFocusFn.current = fn; }}
            onApplySchemas={(schemas, mode) => {
              applyAISchemas(schemas, mode);
              setView("erd");
            }}
          />
        </div>

        {/* ── Filter Panel ─────────────────────────────────────────────────── */}
        {filterOpen && tables.length > 0 && (
          <div className="w-64 shrink-0 border-l border-surface-border bg-surface flex flex-col overflow-hidden">
            {/* Filter header */}
            <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faFilter} className="text-brand-400 text-xs" />
                <span className="text-sm font-semibold text-fg-base">Table Filter</span>
              </div>
              <span className="text-2xs text-fg-subtle tabular-nums">
                {tables.length - hiddenTables.size}/{tables.length}
              </span>
            </div>

            {/* Show/Hide all */}
            <div className="shrink-0 flex gap-1.5 px-3 py-2 border-b border-surface-border">
              <button
                onClick={showAllTables}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-surface-100 hover:bg-surface-200 border border-surface-border text-2xs text-fg-muted hover:text-fg-base transition-colors"
              >
                <FontAwesomeIcon icon={faEye} className="text-2xs" />
                Show all
              </button>
              <button
                onClick={hideAllTables}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-surface-100 hover:bg-surface-200 border border-surface-border text-2xs text-fg-muted hover:text-fg-base transition-colors"
              >
                <FontAwesomeIcon icon={faEyeSlash} className="text-2xs" />
                Hide all
              </button>
            </div>

            {/* Search */}
            <div className="shrink-0 px-3 py-2 border-b border-surface-border">
              <input
                type="text"
                placeholder="Search tables…"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-surface-100 border border-surface-border text-xs text-fg-base placeholder-fg-subtle focus:outline-none focus:border-brand-500/50 focus:bg-surface-200"
              />
            </div>

            {/* Table list */}
            <div className="flex-1 overflow-y-auto p-2">
              {filteredTableList.map((t) => {
                const hidden = hiddenTables.has(t.name);
                const fkOut  = t.foreign_keys.length;
                const fkIn   = tables.filter((other) =>
                  other.foreign_keys.some((fk) => fk.foreign_table === t.name)
                ).length;
                return (
                  <button
                    key={t.name}
                    onClick={() => toggleTable(t.name)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg mb-0.5 text-left transition-colors",
                      hidden
                        ? "opacity-40 hover:opacity-70 bg-surface hover:bg-surface-100 text-fg-subtle"
                        : "bg-surface-100 hover:bg-surface-200 text-fg-base border border-surface-border/50"
                    )}
                  >
                    <span className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      hidden
                        ? "border-surface-border bg-surface"
                        : "border-brand-500/60 bg-brand-500/15"
                    )}>
                      {!hidden && <FontAwesomeIcon icon={faCheck} className="text-brand-400" style={{ fontSize: 8 }} />}
                    </span>
                    <span className="text-xs font-mono flex-1 truncate" title={t.name}>{t.name}</span>
                    <span className="text-2xs text-fg-subtle shrink-0 tabular-nums">
                      {t.columns.length}c
                    </span>
                    {(fkOut > 0 || fkIn > 0) && (
                      <span className="text-2xs text-blue-400/70 shrink-0 tabular-nums" title={`${fkOut} FK out, ${fkIn} FK in`}>
                        {fkOut + fkIn}🔗
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 h-6 flex items-center px-4 gap-3 border-t border-surface-border bg-surface text-2xs text-fg-subtle select-none">
        {selectedUserDb && (
          <>
            <FontAwesomeIcon icon={faDatabase} className="text-brand-400" style={{ fontSize: 9 }} />
            <span className="text-fg-base font-medium">{selectedUserDb.database_name}</span>
            <span className="text-fg-subtle/50">·</span>
          </>
        )}
        {tables.length > 0 ? (
          <>
            <span>
              {visibleTables.length === tables.length
                ? `${tables.length} table${tables.length !== 1 ? "s" : ""}`
                : `${visibleTables.length}/${tables.length} tables visible`}
            </span>
            {fkCount > 0 && (
              <>
                <span className="text-fg-subtle/50">·</span>
                <span>{fkCount} FK relationship{fkCount !== 1 ? "s" : ""}</span>
              </>
            )}
          </>
        ) : (
          <span>{loading ? loadMsg : "No data loaded"}</span>
        )}
        {view === "erd" && tables.length > 0 && (
          <>
            <span className="text-fg-subtle/50">·</span>
            <span className="hidden sm:inline">Drag tables · Scroll to zoom · Drag canvas to pan</span>
          </>
        )}
        {hoveredFK && (
          <span className="ml-auto text-brand-400 font-mono truncate max-w-[40%]">
            {hoveredFK.replace(/__/g, " → ").split(" → ").slice(0, 2).join(".")}
          </span>
        )}
        {activeDiagramId && (
          <span className="ml-auto flex items-center gap-1 text-brand-400">
            <FontAwesomeIcon icon={faFloppyDisk} style={{ fontSize: 9 }} />
            {savedDiagrams.find((d) => d.id === activeDiagramId)?.name}
          </span>
        )}
      </div>

      {/* ── Save Diagram Modal ─────────────────────────────────────────────────── */}
      {saveModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setSaveModalOpen(false); }}
        >
          <div className="w-full max-w-sm mx-4 rounded-2xl border border-surface-border bg-surface shadow-2xl shadow-black/50 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                <FontAwesomeIcon icon={faFloppyDisk} className="text-brand-400 text-sm" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-fg-base">
                  {activeDiagramId ? "Update Diagram" : "Save Diagram"}
                </h2>
                <p className="text-xs text-fg-subtle mt-0.5">
                  {tables.length} table{tables.length !== 1 ? "s" : ""} will be saved
                </p>
              </div>
              <button
                onClick={() => setSaveModalOpen(false)}
                className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg text-fg-subtle hover:text-fg-base hover:bg-surface-100 transition-colors"
              >
                <FontAwesomeIcon icon={faXmark} className="text-xs" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-fg-muted mb-1.5">Diagram name</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveDiagram(); }}
                  placeholder="e.g. E-commerce schema"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-surface-border bg-surface-100 text-sm text-fg-base placeholder:text-fg-subtle outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/20 transition-colors"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setSaveModalOpen(false)}
                  className="flex-1 px-3 py-2 rounded-lg border border-surface-border bg-surface text-xs font-medium text-fg-muted hover:bg-surface-100 hover:text-fg-base transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDiagram}
                  disabled={!saveName.trim() || savingDiagram}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
                >
                  {savingDiagram
                    ? <FontAwesomeIcon icon={faSpinner} className="text-xs animate-spin" />
                    : <FontAwesomeIcon icon={faFloppyDisk} className="text-xs" />
                  }
                  {activeDiagramId ? "Update" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
