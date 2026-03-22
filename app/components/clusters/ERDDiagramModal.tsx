"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark, faSpinner, faSitemap, faKey, faLink,
  faRotateRight, faMagnifyingGlassPlus, faMagnifyingGlassMinus,
  faDatabase, faTriangleExclamation, faTableCellsLarge,
} from "@fortawesome/free-solid-svg-icons";
import { browserApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BrowserColumn, BrowserForeignKey, BrowserTable } from "@/types";

// ─── Layout constants ─────────────────────────────────────────────────────────
const TABLE_W   = 228;
const HEADER_H  = 38;
const COL_H     = 26;
const GRID_GAP_X = 96;
const GRID_GAP_Y = 72;
const GRID_COLS  = 4;

// ─── Types ────────────────────────────────────────────────────────────────────
interface TableSchema {
  name: string;
  schemaName: string;
  columns: BrowserColumn[];
  primary_keys: string[];
  foreign_keys: BrowserForeignKey[];
}
interface Pos { x: number; y: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
    "character varying": "varchar",
    character_varying:   "varchar",
    "double precision":  "float8",
    "timestamp without time zone": "timestamp",
    "timestamp with time zone":    "timestamptz",
    integer:   "int4",
    bigint:    "int8",
    smallint:  "int2",
    boolean:   "bool",
  };
  return map[t] ?? t;
}

function autoLayout(tables: TableSchema[]): Record<string, Pos> {
  // Most-referenced tables go first (left/top)
  const refCount: Record<string, number> = {};
  tables.forEach((t) => t.foreign_keys.forEach((fk) => {
    refCount[fk.foreign_table] = (refCount[fk.foreign_table] ?? 0) + 1;
  }));
  const sorted = [...tables].sort((a, b) => (refCount[b.name] ?? 0) - (refCount[a.name] ?? 0));

  const positions: Record<string, Pos> = {};
  let col = 0, rowY = 40, rowMaxH = 0;
  let x = 40;

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

// ─── Component ────────────────────────────────────────────────────────────────
export default function ERDDiagramModal({
  clusterId,
  database,
  dbType,
  onClose,
}: {
  clusterId: string;
  database: string;
  dbType: string;
  onClose: () => void;
}) {
  const [tables,    setTables]    = useState<TableSchema[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadMsg,   setLoadMsg]   = useState("Fetching table list…");
  const [error,     setError]     = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [zoom,      setZoom]      = useState(0.82);
  const [pan,       setPan]       = useState<Pos>({ x: 32, y: 32 });
  const [view,      setView]      = useState<"erd" | "schema">("erd");
  const [hoveredFK, setHoveredFK] = useState<string | null>(null);

  // Refs for use inside global event handlers (avoids stale closure)
  const zoomRef = useRef(zoom);
  const panRef  = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current  = pan;  }, [pan]);

  type DragState = { name: string; startX: number; startY: number; origX: number; origY: number };
  const dragRef    = useRef<DragState | null>(null);
  type PanState    = { startX: number; startY: number; origPX: number; origPY: number };
  const panDragRef = useRef<PanState | null>(null);

  // ── Fetch schema ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLoadMsg("Fetching table list…");

    (async () => {
      try {
        const raw = await browserApi.listTables(clusterId, database);
        const tableList: BrowserTable[] = Array.isArray(raw) ? raw : (raw?.tables ?? []);
        if (cancelled) return;

        const limited = tableList.slice(0, 60);
        setLoadMsg(`Loading structure for ${limited.length} tables…`);

        const pgSchema = dbType === "postgres" ? "public" : "public";
        const schemas: TableSchema[] = [];

        for (let i = 0; i < limited.length; i += 8) {
          if (cancelled) return;
          const batch = limited.slice(i, i + 8);
          const results = await Promise.all(
            batch.map(async (t) => {
              try {
                const s = await browserApi.getStructure(clusterId, database, t.name, pgSchema);
                return {
                  name:        t.name,
                  schemaName:  t.schema ?? pgSchema,
                  columns:     s.columns     ?? [],
                  primary_keys: s.primary_keys ?? [],
                  foreign_keys: s.foreign_keys ?? [],
                } as TableSchema;
              } catch {
                return {
                  name: t.name, schemaName: pgSchema,
                  columns: [], primary_keys: [], foreign_keys: [],
                } as TableSchema;
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
  }, [clusterId, database, dbType]);

  // ── Canvas size ─────────────────────────────────────────────────────────────
  const canvasSize = useMemo(() => {
    let maxX = 1200, maxY = 800;
    tables.forEach((t) => {
      const pos = positions[t.name];
      if (pos) {
        maxX = Math.max(maxX, pos.x + TABLE_W + 120);
        maxY = Math.max(maxY, pos.y + tableHeight(t) + 120);
      }
    });
    return { w: maxX, h: maxY };
  }, [tables, positions]);

  // ── FK relationship lines ────────────────────────────────────────────────────
  const fkLines = useMemo(() => {
    type FKLine = { id: string; path: string; label: string };
    const lines: FKLine[] = [];

    tables.forEach((t) => {
      t.foreign_keys.forEach((fk) => {
        const srcPos = positions[t.name];
        const dstPos = positions[fk.foreign_table];
        if (!srcPos || !dstPos) return;

        const srcColIdx = t.columns.findIndex((c) => c.name === fk.column_name);
        const dstTable  = tables.find((tb) => tb.name === fk.foreign_table);
        const dstColIdx = dstTable ? dstTable.columns.findIndex((c) => c.name === fk.foreign_column) : 0;

        const sy = srcPos.y + HEADER_H + (srcColIdx >= 0 ? srcColIdx : 0) * COL_H + COL_H / 2;
        const dy = dstPos.y + HEADER_H + (dstColIdx >= 0 ? dstColIdx : 0) * COL_H + COL_H / 2;

        let path: string;
        if (srcPos.x + TABLE_W <= dstPos.x) {
          // src is to the left of dst → left-to-right
          const x1 = srcPos.x + TABLE_W;
          const x2 = dstPos.x;
          const cp = Math.min(140, Math.abs(x2 - x1) * 0.55);
          path = `M ${x1} ${sy} C ${x1 + cp} ${sy}, ${x2 - cp} ${dy}, ${x2} ${dy}`;
        } else if (dstPos.x + TABLE_W <= srcPos.x) {
          // dst is to the left of src → right-to-left (exit from left side of src, enter right side of dst)
          const x1 = srcPos.x;
          const x2 = dstPos.x + TABLE_W;
          const cp = Math.min(140, Math.abs(x1 - x2) * 0.55);
          path = `M ${x1} ${sy} C ${x1 - cp} ${sy}, ${x2 + cp} ${dy}, ${x2} ${dy}`;
        } else {
          // Overlapping x ranges — route below/above
          const x1 = srcPos.x + TABLE_W;
          const x2 = dstPos.x + TABLE_W;
          const bend = Math.max(srcPos.x, dstPos.x) + TABLE_W + 60;
          path = `M ${x1} ${sy} C ${bend} ${sy}, ${bend} ${dy}, ${x2} ${dy}`;
        }

        lines.push({
          id:    `${t.name}__${fk.column_name}__${fk.foreign_table}__${fk.foreign_column}`,
          path,
          label: `${t.name}.${fk.column_name} → ${fk.foreign_table}.${fk.foreign_column}`,
        });
      });
    });
    return lines;
  }, [tables, positions]);

  // ── Table drag ───────────────────────────────────────────────────────────────
  const onTableMouseDown = useCallback((e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    const pos = positions[name];
    if (!pos) return;
    dragRef.current = { name, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  }, [positions]);

  // ── Canvas pan ───────────────────────────────────────────────────────────────
  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    panDragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origPX: panRef.current.x, origPY: panRef.current.y,
    };
  }, []);

  // ── Global move / up ─────────────────────────────────────────────────────────
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

  // ── Wheel zoom ───────────────────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const next = Math.min(2.2, Math.max(0.22, zoomRef.current - e.deltaY * 0.0008));
    setZoom(next);
    zoomRef.current = next;
  }, []);

  // ── Keyboard close ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Reset view ───────────────────────────────────────────────────────────────
  const resetView = useCallback(() => {
    const next = 0.82;
    const nextPan = { x: 32, y: 32 };
    setZoom(next); zoomRef.current = next;
    setPan(nextPan); panRef.current = nextPan;
    setPositions(autoLayout(tables));
  }, [tables]);

  const fkCount = tables.reduce((acc, t) => acc + t.foreign_keys.length, 0);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: "#0d1117" }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-surface-border bg-surface">
        {/* Icon + title */}
        <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
          <FontAwesomeIcon icon={faSitemap} className="text-brand-400 text-sm" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-fg-base leading-tight">
            ERD &mdash; <span className="text-brand-400">{database}</span>
          </h2>
          <p className="text-xs text-fg-subtle leading-tight">
            {loading
              ? loadMsg
              : `${tables.length} table${tables.length !== 1 ? "s" : ""} · ${fkCount} relationship${fkCount !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* View toggle */}
        <div className="ml-5 flex items-center rounded-lg bg-surface-100 border border-surface-border p-0.5 gap-0.5">
          <button
            onClick={() => setView("erd")}
            className={cn(
              "px-3 py-1.5 text-xs rounded-md font-medium transition-colors flex items-center gap-1.5",
              view === "erd" ? "bg-brand-600 text-white shadow-sm" : "text-fg-subtle hover:text-fg-base",
            )}
          >
            <FontAwesomeIcon icon={faSitemap} className="text-xs" />
            ERD View
          </button>
          <button
            onClick={() => setView("schema")}
            className={cn(
              "px-3 py-1.5 text-xs rounded-md font-medium transition-colors flex items-center gap-1.5",
              view === "schema" ? "bg-brand-600 text-white shadow-sm" : "text-fg-subtle hover:text-fg-base",
            )}
          >
            <FontAwesomeIcon icon={faTableCellsLarge} className="text-xs" />
            Schema List
          </button>
        </div>

        {/* Zoom controls (ERD mode only) */}
        {view === "erd" && (
          <div className="ml-2 flex items-center gap-1">
            <button
              onClick={() => { const n = Math.min(2.2, zoomRef.current + 0.12); setZoom(n); zoomRef.current = n; }}
              className="w-7 h-7 rounded-md border border-surface-border bg-surface hover:bg-surface-100 flex items-center justify-center text-fg-subtle hover:text-fg-base transition-colors"
              title="Zoom in"
            >
              <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="text-xs" />
            </button>
            <span className="text-xs text-fg-subtle w-10 text-center tabular-nums select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => { const n = Math.max(0.22, zoomRef.current - 0.12); setZoom(n); zoomRef.current = n; }}
              className="w-7 h-7 rounded-md border border-surface-border bg-surface hover:bg-surface-100 flex items-center justify-center text-fg-subtle hover:text-fg-base transition-colors"
              title="Zoom out"
            >
              <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="text-xs" />
            </button>
            <button
              onClick={resetView}
              className="w-7 h-7 rounded-md border border-surface-border bg-surface hover:bg-surface-100 flex items-center justify-center text-fg-subtle hover:text-fg-base transition-colors ml-0.5"
              title="Reset layout & zoom"
            >
              <FontAwesomeIcon icon={faRotateRight} className="text-xs" />
            </button>
          </div>
        )}

        {/* Legend */}
        {view === "erd" && !loading && (
          <div className="hidden lg:flex items-center gap-3 ml-3 text-2xs text-fg-subtle select-none">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/20 border border-amber-500/50 inline-block" />
              Primary Key
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/20 border border-blue-500/50 inline-block" />
              Foreign Key
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="32" height="8" viewBox="0 0 32 8" className="inline-block">
                <path d="M 0 4 C 8 4, 24 4, 32 4" stroke="#6366f1" strokeWidth="1.5" fill="none" strokeDasharray="4,2" />
              </svg>
              Relationship
            </span>
          </div>
        )}

        {/* Spacer + close */}
        <div className="ml-auto flex items-center">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-surface-border bg-surface hover:bg-red-500/10 hover:border-red-500/40 flex items-center justify-center text-fg-subtle hover:text-red-400 transition-colors"
            title="Close (Esc)"
          >
            <FontAwesomeIcon icon={faXmark} className="text-sm" />
          </button>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative select-none">

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4" style={{ background: "#0d1117" }}>
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                <FontAwesomeIcon icon={faSitemap} className="text-brand-400 text-2xl" />
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

        {/* ── ERD Canvas ──────────────────────────────────────────────────── */}
        {!loading && !error && view === "erd" && (
          <div
            className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
            style={{
              background: `
                radial-gradient(circle at 50% 50%, transparent 60%, #0d1117 100%),
                radial-gradient(circle at 1px 1px, #1e2433 1px, transparent 0) 0 0 / 24px 24px
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
              {/* SVG: FK relationship arrows */}
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
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {fkLines.map((line) => {
                  const isHov = hoveredFK === line.id;
                  return (
                    <path
                      key={line.id}
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
                  );
                })}
              </svg>

              {/* Table boxes */}
              {tables.map((t) => {
                const pos = positions[t.name] ?? { x: 0, y: 0 };
                return (
                  <div
                    key={t.name}
                    style={{
                      position: "absolute",
                      left:     pos.x,
                      top:      pos.y,
                      width:    TABLE_W,
                      userSelect: "none",
                    }}
                    className="rounded-xl border border-surface-border bg-[#161b22] shadow-lg shadow-black/50 overflow-hidden"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {/* Header — drag handle */}
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
                      const isPK = t.primary_keys.includes(col.name);
                      const isFK = t.foreign_keys.some((fk) => fk.column_name === col.name);
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
                          {/* Key badge */}
                          <span className="w-4 shrink-0 flex items-center justify-center">
                            {isPK && (
                              <FontAwesomeIcon icon={faKey} className="text-amber-400" style={{ fontSize: 9 }} />
                            )}
                            {isFK && !isPK && (
                              <FontAwesomeIcon icon={faLink} className="text-blue-400" style={{ fontSize: 9 }} />
                            )}
                          </span>

                          {/* Column name */}
                          <span
                            className={cn(
                              "text-xs font-mono flex-1 truncate",
                              isPK ? "text-amber-300" : isFK ? "text-blue-300" : "text-fg-muted",
                            )}
                          >
                            {col.name}
                          </span>

                          {/* Nullable indicator */}
                          {col.is_nullable === "YES" && (
                            <span className="text-fg-subtle/40 text-xs shrink-0">?</span>
                          )}

                          {/* Type badge */}
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
                      <div className="px-3 py-2 text-2xs text-fg-subtle italic text-center">
                        No columns loaded
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Schema List ──────────────────────────────────────────────────── */}
        {!loading && !error && view === "schema" && (
          <div className="h-full overflow-y-auto p-5">
            {tables.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <FontAwesomeIcon icon={faDatabase} className="text-fg-subtle/30 text-4xl" />
                <p className="text-sm text-fg-subtle">No tables found in <strong>{database}</strong></p>
              </div>
            ) : (
              <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {tables.map((t) => (
                  <div
                    key={t.name}
                    className="rounded-xl border border-surface-border bg-surface-50 overflow-hidden flex flex-col"
                  >
                    {/* Table header */}
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-100 border-b border-surface-border">
                      <FontAwesomeIcon icon={faDatabase} className="text-brand-400 text-xs shrink-0" />
                      <span className="text-sm font-bold text-fg-base truncate flex-1" title={t.name}>{t.name}</span>
                      <span className="text-xs text-fg-subtle shrink-0">
                        {t.columns.length} col{t.columns.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Columns */}
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
                            <span
                              className="text-2xs font-mono shrink-0"
                              style={{ color: colTypeColor(col) }}
                            >
                              {shortType(col)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* FK relationships section */}
                    {t.foreign_keys.length > 0 && (
                      <div className="px-3 py-2 border-t border-surface-border bg-surface-100/60">
                        <p className="text-2xs text-fg-subtle mb-1.5 font-semibold uppercase tracking-wide">
                          Foreign Keys
                        </p>
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

      {/* ── Status bar ────────────────────────────────────────────────────── */}
      <div className="shrink-0 h-6 flex items-center px-4 gap-3 border-t border-surface-border bg-surface text-2xs text-fg-subtle">
        <FontAwesomeIcon icon={faDatabase} className="text-brand-400" style={{ fontSize: 9 }} />
        <span className="text-fg-base font-medium">{database}</span>
        <span>·</span>
        <span>{tables.length} tables</span>
        {fkCount > 0 && (
          <>
            <span>·</span>
            <span>{fkCount} FK relationship{fkCount !== 1 ? "s" : ""}</span>
          </>
        )}
        {view === "erd" && (
          <>
            <span>·</span>
            <span className="hidden sm:inline">Drag tables to reposition · Scroll to zoom · Drag background to pan</span>
          </>
        )}
        {hoveredFK && (
          <span className="ml-auto text-brand-400 font-mono truncate max-w-[40%]">{hoveredFK.replace(/__/g, " → ").split(" → ").slice(0, 2).join(".")}</span>
        )}
      </div>
    </div>
  );
}
