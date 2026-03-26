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
} from "@fortawesome/free-solid-svg-icons";
import { browserApi, clusterApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import Topbar from "@/components/layout/Topbar";
import type {
  BrowserColumn,
  BrowserForeignKey,
  BrowserTable,
  ClusterListItem,
  BrowserDatabase,
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
  // ── Cluster / DB selection ───────────────────────────────────────────────────
  const [clusters,          setClusters]          = useState<ClusterListItem[]>([]);
  const [clustersLoading,   setClustersLoading]   = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<string>("");
  const [databases,         setDatabases]         = useState<BrowserDatabase[]>([]);
  const [dbLoading,         setDbLoading]         = useState(false);
  const [selectedDatabase,  setSelectedDatabase]  = useState<string>("");
  const [clusterDropOpen,   setClusterDropOpen]   = useState(false);
  const [dbDropOpen,        setDbDropOpen]        = useState(false);

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

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [filterOpen,       setFilterOpen]       = useState(false);
  const [hiddenTables,     setHiddenTables]     = useState<Set<string>>(new Set());
  const [view,             setView]             = useState<"erd" | "schema">("erd");
  const [showCardinality,  setShowCardinality]  = useState(true);
  const [filterSearch,     setFilterSearch]     = useState("");
  const [exportLoading,    setExportLoading]    = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const zoomRef = useRef(zoom);
  const panRef  = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current  = pan;  }, [pan]);

  type DragState = { name: string; startX: number; startY: number; origX: number; origY: number };
  const dragRef    = useRef<DragState | null>(null);
  type PanState    = { startX: number; startY: number; origPX: number; origPY: number };
  const panDragRef = useRef<PanState | null>(null);

  // ── Fetch clusters on mount ───────────────────────────────────────────────────
  useEffect(() => {
    clusterApi.list().then((data) => {
      const list: ClusterListItem[] = Array.isArray(data) ? data : (data?.clusters ?? []);
      setClusters(list);
    }).catch(() => {}).finally(() => setClustersLoading(false));
  }, []);

  // ── Fetch databases when cluster selected ────────────────────────────────────
  useEffect(() => {
    if (!selectedClusterId) { setDatabases([]); setSelectedDatabase(""); return; }
    setDbLoading(true);
    setDatabases([]);
    setSelectedDatabase("");
    setTables([]);
    setError(null);
    browserApi.listDatabases(selectedClusterId)
      .then((data) => {
        const list: BrowserDatabase[] = Array.isArray(data) ? data : (data?.databases ?? []);
        setDatabases(list);
        if (list.length === 1) setSelectedDatabase(list[0].name);
      })
      .catch(() => {})
      .finally(() => setDbLoading(false));
  }, [selectedClusterId]);

  // ── Fetch schema when database selected ──────────────────────────────────────
  useEffect(() => {
    if (!selectedClusterId || !selectedDatabase) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTables([]);
    setPositions({});
    setHiddenTables(new Set());
    setLoadMsg("Fetching table list…");

    (async () => {
      try {
        const raw = await browserApi.listTables(selectedClusterId, selectedDatabase);
        const tableList: BrowserTable[] = Array.isArray(raw) ? raw : (raw?.tables ?? []);
        if (cancelled) return;

        const limited = tableList.slice(0, 80);
        setLoadMsg(`Loading structure for ${limited.length} tables…`);

        const selectedCluster = clusters.find((c) => c.id === selectedClusterId);
        const pgSchema = "public";
        const schemas: TableSchema[] = [];

        for (let i = 0; i < limited.length; i += 8) {
          if (cancelled) return;
          const batch = limited.slice(i, i + 8);
          const results = await Promise.all(
            batch.map(async (t) => {
              try {
                const s = await browserApi.getStructure(selectedClusterId, selectedDatabase, t.name, pgSchema);
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
  }, [selectedClusterId, selectedDatabase]);

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

  // ── Derived: selected cluster label ───────────────────────────────────────────
  const selectedCluster = clusters.find((c) => c.id === selectedClusterId);
  const filteredTableList = tables.filter((t) =>
    filterSearch === "" || t.name.toLowerCase().includes(filterSearch.toLowerCase())
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="ER Diagram Generator"
        subtitle={
          selectedCluster && selectedDatabase
            ? `${selectedCluster.name} / ${selectedDatabase}`
            : undefined
        }
      />

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-surface-border bg-surface flex-wrap">

        {/* Cluster Picker */}
        <div className="relative">
          <button
            onClick={() => { setClusterDropOpen((o) => !o); setDbDropOpen(false); }}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors min-w-[160px]",
              clusterDropOpen
                ? "border-brand-500/60 bg-brand-500/8 text-fg-base"
                : "border-surface-border bg-surface hover:bg-surface-100 text-fg-muted hover:text-fg-base"
            )}
          >
            <FontAwesomeIcon icon={faDatabase} className="text-brand-400 text-xs shrink-0" />
            <span className="flex-1 text-left truncate">
              {clustersLoading
                ? "Loading…"
                : selectedCluster
                  ? selectedCluster.name
                  : "Select cluster"}
            </span>
            <FontAwesomeIcon icon={faChevronDown} className="text-xs shrink-0 text-fg-subtle" />
          </button>

          {clusterDropOpen && (
            <div className="absolute z-50 top-full mt-1 left-0 w-64 rounded-xl border border-surface-border bg-surface shadow-xl shadow-black/30 overflow-hidden">
              <div className="p-1 max-h-64 overflow-y-auto">
                {clusters.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-fg-subtle italic">No clusters available</p>
                ) : (
                  clusters.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedClusterId(c.id); setClusterDropOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                        selectedClusterId === c.id
                          ? "bg-brand-500/15 text-fg-base"
                          : "text-fg-muted hover:bg-surface-100 hover:text-fg-base"
                      )}
                    >
                      <FontAwesomeIcon icon={faDatabase} className="text-brand-400 text-xs shrink-0" />
                      <span className="flex-1 text-left truncate">{c.name}</span>
                      <span className={cn(
                        "text-2xs px-1.5 py-0.5 rounded-full font-medium shrink-0",
                        c.status === "running" ? "bg-green-500/15 text-green-400" : "bg-surface-200 text-fg-subtle"
                      )}>
                        {c.db_type}
                      </span>
                      {selectedClusterId === c.id && (
                        <FontAwesomeIcon icon={faCheck} className="text-brand-400 text-xs shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Database Picker */}
        <div className="relative">
          <button
            disabled={!selectedClusterId || dbLoading}
            onClick={() => { setDbDropOpen((o) => !o); setClusterDropOpen(false); }}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors min-w-[140px]",
              !selectedClusterId || dbLoading
                ? "opacity-40 cursor-not-allowed border-surface-border bg-surface text-fg-subtle"
                : dbDropOpen
                  ? "border-brand-500/60 bg-brand-500/8 text-fg-base"
                  : "border-surface-border bg-surface hover:bg-surface-100 text-fg-muted hover:text-fg-base"
            )}
          >
            {dbLoading
              ? <FontAwesomeIcon icon={faSpinner} className="text-xs animate-spin text-brand-400" />
              : <FontAwesomeIcon icon={faSitemap}  className="text-brand-400 text-xs shrink-0" />
            }
            <span className="flex-1 text-left truncate">
              {dbLoading ? "Loading…" : selectedDatabase || "Select database"}
            </span>
            <FontAwesomeIcon icon={faChevronDown} className="text-xs shrink-0 text-fg-subtle" />
          </button>

          {dbDropOpen && (
            <div className="absolute z-50 top-full mt-1 left-0 w-52 rounded-xl border border-surface-border bg-surface shadow-xl shadow-black/30 overflow-hidden">
              <div className="p-1 max-h-60 overflow-y-auto">
                {databases.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-fg-subtle italic">No databases found</p>
                ) : (
                  databases.map((db) => (
                    <button
                      key={db.name}
                      onClick={() => { setSelectedDatabase(db.name); setDbDropOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                        selectedDatabase === db.name
                          ? "bg-brand-500/15 text-fg-base"
                          : "text-fg-muted hover:bg-surface-100 hover:text-fg-base"
                      )}
                    >
                      <FontAwesomeIcon icon={faSitemap} className="text-brand-400 text-xs shrink-0" />
                      <span className="flex-1 text-left truncate font-mono text-xs">{db.name}</span>
                      {db.size && (
                        <span className="text-2xs text-fg-subtle shrink-0">{db.size}</span>
                      )}
                      {selectedDatabase === db.name && (
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

        {/* Spacer */}
        <div className="flex-1" />

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

          {/* Empty state – no cluster/db selected */}
          {!selectedClusterId && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center px-8">
              <div className="w-20 h-20 rounded-2xl bg-brand-500/8 border border-brand-500/15 flex items-center justify-center">
                <FontAwesomeIcon icon={faShareNodes} className="text-brand-400 text-3xl" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-fg-base mb-2">ER Diagram Generator</h2>
                <p className="text-sm text-fg-subtle max-w-sm">
                  Select a cluster and database above to automatically generate an interactive
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
        {selectedCluster && (
          <>
            <FontAwesomeIcon icon={faDatabase} className="text-brand-400" style={{ fontSize: 9 }} />
            <span className="text-fg-base font-medium">{selectedCluster.name}</span>
            <span className="text-fg-subtle/50">·</span>
            <span className="font-mono">{selectedDatabase || "—"}</span>
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
      </div>
    </div>
  );
}
