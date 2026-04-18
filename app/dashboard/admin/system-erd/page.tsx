"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faKey, faLink, faSitemap, faSpinner, faTriangleExclamation,
  faMagnifyingGlassPlus, faMagnifyingGlassMinus, faRotateRight,
  faArrowLeft, faCircleInfo,
} from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { adminApi, type SystemErdTable } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import Topbar from "@/components/layout/Topbar";

// ─── Layout constants ─────────────────────────────────────────────────────────
const TABLE_W    = 232;
const HEADER_H   = 40;
const COL_H      = 24;
const GRID_GAP_X = 100;
const GRID_GAP_Y = 80;
const GRID_COLS  = 4;

interface Pos { x: number; y: number; }

function tableHeight(t: SystemErdTable): number {
  return HEADER_H + Math.max(1, t.columns.length) * COL_H + 8;
}

function colTypeColor(udt: string): string {
  const t = udt.toLowerCase();
  if (/int|serial|bigint|smallint|numeric|decimal|float|double/.test(t)) return "#60a5fa";
  if (/char|text|varchar|string|enum/.test(t))  return "#34d399";
  if (/bool/.test(t))                           return "#f59e0b";
  if (/date|time|timestamp/.test(t))            return "#c084fc";
  if (/json|uuid/.test(t))                      return "#fb923c";
  return "#94a3b8";
}

function shortType(udt: string, dataType: string): string {
  const t = (udt || dataType || "?").toLowerCase();
  const map: Record<string, string> = {
    "character varying": "varchar", character_varying: "varchar",
    "double precision": "float8", "timestamp without time zone": "timestamp",
    "timestamp with time zone": "timestamptz",
    integer: "int4", bigint: "int8", smallint: "int2", boolean: "bool",
  };
  return map[t] ?? t;
}

function autoLayout(tables: SystemErdTable[]): Record<string, Pos> {
  const refCount: Record<string, number> = {};
  tables.forEach((t) => t.foreign_keys.forEach((fk) => {
    refCount[fk.foreign_table] = (refCount[fk.foreign_table] ?? 0) + 1;
  }));
  const sorted = [...tables].sort((a, b) => (refCount[b.name] ?? 0) - (refCount[a.name] ?? 0));

  const positions: Record<string, Pos> = {};
  let col = 0, rowY = 48, rowMaxH = 0, x = 48;
  sorted.forEach((t) => {
    positions[t.name] = { x, y: rowY };
    rowMaxH = Math.max(rowMaxH, tableHeight(t));
    col++;
    if (col >= GRID_COLS) { col = 0; rowY += rowMaxH + GRID_GAP_Y; rowMaxH = 0; x = 48; }
    else { x += TABLE_W + GRID_GAP_X; }
  });
  return positions;
}

// ─── FK lines ─────────────────────────────────────────────────────────────────
interface FKLine { id: string; path: string; label: string; }

function buildFKLines(tables: SystemErdTable[], positions: Record<string, Pos>): FKLine[] {
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
        const x1 = srcPos.x + TABLE_W, x2 = dstPos.x;
        const cp = Math.min(140, Math.abs(x2 - x1) * 0.55);
        path = `M ${x1} ${sy} C ${x1 + cp} ${sy}, ${x2 - cp} ${dy}, ${x2} ${dy}`;
      } else if (dstPos.x + TABLE_W <= srcPos.x) {
        const x1 = srcPos.x, x2 = dstPos.x + TABLE_W;
        const cp = Math.min(140, Math.abs(x1 - x2) * 0.55);
        path = `M ${x1} ${sy} C ${x1 - cp} ${sy}, ${x2 + cp} ${dy}, ${x2} ${dy}`;
      } else {
        const x1 = srcPos.x + TABLE_W, x2 = dstPos.x + TABLE_W;
        const bend = Math.max(srcPos.x, dstPos.x) + TABLE_W + 60;
        path = `M ${x1} ${sy} C ${bend} ${sy}, ${bend} ${dy}, ${x2} ${dy}`;
      }

      lines.push({
        id: `${t.name}__${fk.column_name}__${fk.foreign_table}`,
        path,
        label: `${t.name}.${fk.column_name} → ${fk.foreign_table}.${fk.foreign_column}`,
      });
    });
  });
  return lines;
}

// ─── Canvas ────────────────────────────────────────────────────────────────────
function ERDCanvas({ tables }: { tables: SystemErdTable[] }) {
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [zoom,      setZoom]      = useState(0.78);
  const [pan,       setPan]       = useState<Pos>({ x: 32, y: 32 });
  const [hoveredFK, setHoveredFK] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const zoomRef = useRef(zoom);
  const panRef  = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current  = pan;  }, [pan]);

  type DragState  = { name: string; startX: number; startY: number; origX: number; origY: number };
  type PanState   = { startX: number; startY: number; origPX: number; origPY: number };
  const dragRef    = useRef<DragState | null>(null);
  const panDragRef = useRef<PanState | null>(null);

  useEffect(() => { setPositions(autoLayout(tables)); }, [tables]);

  const fkLines = useMemo(() => buildFKLines(tables, positions), [tables, positions]);

  const canvasSize = useMemo(() => {
    let maxX = 1400, maxY = 900;
    tables.forEach((t) => {
      const pos = positions[t.name];
      if (pos) {
        maxX = Math.max(maxX, pos.x + TABLE_W + 120);
        maxY = Math.max(maxY, pos.y + tableHeight(t) + 120);
      }
    });
    return { w: maxX, h: maxY };
  }, [tables, positions]);

  // Wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(2, Math.max(0.2, z * delta)));
  }, []);

  // Table drag
  const onTableMouseDown = useCallback((e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    const pos = positions[name];
    if (!pos) return;
    dragRef.current = { name, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  }, [positions]);

  // Canvas pan
  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    panDragRef.current = { startX: e.clientX, startY: e.clientY, origPX: panRef.current.x, origPY: panRef.current.y };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const { name, startX, startY, origX, origY } = dragRef.current;
        const z = zoomRef.current;
        setPositions((p) => ({ ...p, [name]: { x: origX + (e.clientX - startX) / z, y: origY + (e.clientY - startY) / z } }));
      } else if (panDragRef.current) {
        const { startX, startY, origPX, origPY } = panDragRef.current;
        setPan({ x: origPX + e.clientX - startX, y: origPY + e.clientY - startY });
      }
    };
    const onUp = () => { dragRef.current = null; panDragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const resetView = () => { setPositions(autoLayout(tables)); setZoom(0.78); setPan({ x: 32, y: 32 }); };

  // Highlighted tables (selected + its FK neighbours)
  const highlighted = useMemo(() => {
    if (!selectedTable) return null;
    const set = new Set<string>([selectedTable]);
    tables.forEach((t) => {
      t.foreign_keys.forEach((fk) => {
        if (t.name === selectedTable) set.add(fk.foreign_table);
        if (fk.foreign_table === selectedTable) set.add(t.name);
      });
    });
    return set;
  }, [selectedTable, tables]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-surface select-none" onWheel={onWheel}>

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5">
        <button onClick={() => setZoom((z) => Math.min(2, z * 1.2))} className="w-8 h-8 rounded-lg border border-surface-border bg-surface-50 flex items-center justify-center text-fg-muted hover:text-fg-base hover:bg-surface-100 transition-colors shadow-sm">
          <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="text-xs" />
        </button>
        <button onClick={() => setZoom((z) => Math.max(0.2, z * 0.8))} className="w-8 h-8 rounded-lg border border-surface-border bg-surface-50 flex items-center justify-center text-fg-muted hover:text-fg-base hover:bg-surface-100 transition-colors shadow-sm">
          <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="text-xs" />
        </button>
        <button onClick={resetView} title="Reset layout" className="w-8 h-8 rounded-lg border border-surface-border bg-surface-50 flex items-center justify-center text-fg-muted hover:text-fg-base hover:bg-surface-100 transition-colors shadow-sm">
          <FontAwesomeIcon icon={faRotateRight} className="text-xs" />
        </button>
      </div>

      {/* Zoom level indicator */}
      <div className="absolute bottom-3 right-3 z-20 text-2xs text-fg-subtle bg-surface-50 border border-surface-border rounded-md px-2 py-1 shadow-sm tabular-nums">
        {Math.round(zoom * 100)}%
      </div>

      {/* Stats */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-3 text-2xs text-fg-subtle bg-surface-50 border border-surface-border rounded-md px-3 py-1 shadow-sm">
        <span><strong className="text-fg-base tabular-nums">{tables.length}</strong> tables</span>
        <span><strong className="text-fg-base tabular-nums">{tables.reduce((a, t) => a + t.foreign_keys.length, 0)}</strong> FK relationships</span>
        {selectedTable && (
          <button onClick={() => setSelectedTable(null)} className="text-brand-400 hover:text-brand-300 ml-1">
            ✕ deselect
          </button>
        )}
      </div>

      {/* Canvas */}
      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={onCanvasMouseDown}
        style={{ backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.12) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
      >
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0", position: "absolute" }}>
          {/* SVG FK lines */}
          <svg
            style={{ position: "absolute", top: 0, left: 0, width: canvasSize.w, height: canvasSize.h, pointerEvents: "none", overflow: "visible", zIndex: 0 }}
          >
            <defs>
              <marker id="sys-arrow" markerWidth="8" markerHeight="8" refX="8" refY="3.5" orient="auto">
                <path d="M0,0 L0,7 L8,3.5 z" fill="#6366f1" fillOpacity="0.6" />
              </marker>
              <marker id="sys-arrow-hover" markerWidth="8" markerHeight="8" refX="8" refY="3.5" orient="auto">
                <path d="M0,0 L0,7 L8,3.5 z" fill="#818cf8" />
              </marker>
            </defs>
            {fkLines.map((line) => {
              const isHovered = hoveredFK === line.id;
              const isRelated = selectedTable
                ? line.id.startsWith(selectedTable + "__") || line.id.includes("__" + selectedTable)
                : false;
              const dim = !!selectedTable && !isRelated;
              return (
                <path
                  key={line.id}
                  d={line.path}
                  fill="none"
                  stroke={isHovered || isRelated ? "#818cf8" : "#6366f1"}
                  strokeWidth={isHovered || isRelated ? 1.8 : 1.2}
                  strokeOpacity={dim ? 0.1 : isHovered || isRelated ? 1 : 0.45}
                  strokeDasharray={isHovered || isRelated ? "none" : "4 3"}
                  markerEnd={isHovered || isRelated ? "url(#sys-arrow-hover)" : "url(#sys-arrow)"}
                  style={{ transition: "stroke-opacity 0.15s, stroke-width 0.15s" }}
                />
              );
            })}
          </svg>

          {/* Table nodes */}
          {tables.map((t) => {
            const pos = positions[t.name];
            if (!pos) return null;
            const isSelected  = selectedTable === t.name;
            const isDimmed    = !!highlighted && !highlighted.has(t.name);
            return (
              <div
                key={t.name}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  width: TABLE_W,
                  zIndex: isSelected ? 20 : 10,
                  opacity: isDimmed ? 0.25 : 1,
                  transition: "opacity 0.15s",
                }}
                onMouseDown={(e) => onTableMouseDown(e, t.name)}
                onClick={() => setSelectedTable(isSelected ? null : t.name)}
              >
                <div className={cn(
                  "rounded-xl border overflow-hidden shadow-lg cursor-pointer transition-all duration-150",
                  isSelected
                    ? "border-brand-500/70 ring-2 ring-brand-500/30 shadow-brand-500/10"
                    : "border-surface-border hover:border-brand-500/40 hover:shadow-xl",
                )}>
                  {/* Header */}
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-0 border-b border-surface-border/50",
                    isSelected ? "bg-brand-500/10" : "bg-surface-100",
                  )} style={{ height: HEADER_H }}>
                    <div className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0", isSelected ? "bg-brand-500/20" : "bg-surface-200")}>
                      <FontAwesomeIcon icon={faSitemap} className={cn("text-[9px]", isSelected ? "text-brand-400" : "text-fg-subtle")} />
                    </div>
                    <span className={cn("text-xs font-bold truncate flex-1", isSelected ? "text-brand-300" : "text-fg-strong")}>{t.name}</span>
                    <span className="text-[10px] text-fg-subtle shrink-0">{t.columns.length}</span>
                  </div>

                  {/* Columns */}
                  <div className="bg-surface-50">
                    {t.columns.map((col) => {
                      const isPK = t.primary_keys.includes(col.name);
                      const isFK = t.foreign_keys.some((fk) => fk.column_name === col.name);
                      const typeColor = colTypeColor(col.udt_name ?? col.data_type);
                      return (
                        <div
                          key={col.name}
                          style={{ height: COL_H }}
                          className={cn(
                            "flex items-center gap-1.5 px-2 border-b border-surface-border/20 last:border-b-0",
                            isPK && "bg-amber-500/5",
                            isFK && !isPK && "bg-blue-500/5",
                          )}
                          onMouseEnter={() => {
                            if (isFK) {
                              const fk = t.foreign_keys.find((f) => f.column_name === col.name);
                              if (fk) setHoveredFK(`${t.name}__${col.name}__${fk.foreign_table}`);
                            }
                          }}
                          onMouseLeave={() => setHoveredFK(null)}
                        >
                          <span className="w-3.5 shrink-0 flex items-center justify-center">
                            {isPK && <FontAwesomeIcon icon={faKey}  className="text-amber-400" style={{ fontSize: 8 }} />}
                            {isFK && !isPK && <FontAwesomeIcon icon={faLink} className="text-blue-400" style={{ fontSize: 8 }} />}
                          </span>
                          <span className={cn("text-[11px] flex-1 truncate font-mono", isPK ? "text-amber-300" : "text-fg-base")}>{col.name}</span>
                          <span className="text-[10px] font-mono shrink-0 ml-1" style={{ color: typeColor, opacity: 0.85 }}>
                            {shortType(col.udt_name ?? "", col.data_type)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function SystemERDPage() {
  const user = useAuthStore((s) => s.user);
  const [filter, setFilter] = useState("");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "system-erd"],
    queryFn: adminApi.systemErd,
    staleTime: 60_000,
    enabled: user?.role === "admin",
  });

  const allTables: SystemErdTable[] = data?.tables ?? [];
  const visibleTables = useMemo(() =>
    filter.trim()
      ? allTables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()))
      : allTables,
    [allTables, filter]
  );

  const fkCount = allTables.reduce((a, t) => a + t.foreign_keys.length, 0);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Topbar
        title="System Database ERD"
        subtitle="Live entity-relationship diagram of the PocketDB application schema"
      />

      <div className="flex flex-col flex-1 overflow-hidden">

        {/* ── Toolbar ──────────────────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-3 border-b border-surface-border bg-surface-50 flex items-center gap-4">
          <Link href="/dashboard/admin" className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg-base transition-colors">
            <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
            User Management
          </Link>

          <div className="h-4 w-px bg-surface-border" />

          {/* Stats pills */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs bg-surface-100 border border-surface-border rounded-full px-3 py-1 text-fg-muted">
              <FontAwesomeIcon icon={faSitemap} className="text-[10px] text-brand-400" />
              <strong className="text-fg-base tabular-nums">{allTables.length}</strong> tables
            </span>
            <span className="flex items-center gap-1.5 text-xs bg-surface-100 border border-surface-border rounded-full px-3 py-1 text-fg-muted">
              <FontAwesomeIcon icon={faLink} className="text-[10px] text-blue-400" />
              <strong className="text-fg-base tabular-nums">{fkCount}</strong> relationships
            </span>
          </div>

          {/* Search */}
          <div className="relative ml-auto w-52">
            <input
              className="input text-xs py-1.5 pl-8"
              placeholder="Filter tables…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <FontAwesomeIcon icon={faSitemap} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle text-[10px]" />
          </div>

          {/* Refresh */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <FontAwesomeIcon icon={faRotateRight} className={cn("text-xs", isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* ── Legend ───────────────────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-2 border-b border-surface-border bg-surface-50/60 flex items-center gap-5 text-2xs text-fg-subtle">
          <span className="flex items-center gap-1.5">
            <FontAwesomeIcon icon={faKey} className="text-amber-400" style={{ fontSize: 9 }} />
            Primary Key
          </span>
          <span className="flex items-center gap-1.5">
            <FontAwesomeIcon icon={faLink} className="text-blue-400" style={{ fontSize: 9 }} />
            Foreign Key
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="20" height="8"><path d="M0 4 C5 4 15 4 20 4" stroke="#6366f1" strokeWidth="1.2" strokeDasharray="4 3" fill="none" markerEnd="url(#leg)" /></svg>
            Relationship
          </span>
          <span className="ml-2 flex items-center gap-1.5">
            <FontAwesomeIcon icon={faCircleInfo} className="text-[10px]" />
            Click a table to highlight its relationships · Drag to rearrange · Scroll to zoom
          </span>
        </div>

        {/* ── Canvas area ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative">
          {isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <FontAwesomeIcon icon={faSpinner} className="text-brand-400 text-2xl animate-spin" />
              <p className="text-sm text-fg-subtle">Introspecting application schema…</p>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-red-400 text-xl" />
              </div>
              <p className="text-sm text-fg-base font-semibold">Failed to load schema</p>
              <p className="text-xs text-fg-subtle">{error instanceof Error ? error.message : "Unknown error"}</p>
              <button onClick={() => refetch()} className="btn-primary text-xs mt-2">Retry</button>
            </div>
          ) : visibleTables.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <FontAwesomeIcon icon={faSitemap} className="text-fg-subtle/30 text-4xl" />
              <p className="text-sm text-fg-subtle">No tables found</p>
            </div>
          ) : (
            <ERDCanvas key={filter} tables={visibleTables} />
          )}
        </div>
      </div>
    </div>
  );
}
