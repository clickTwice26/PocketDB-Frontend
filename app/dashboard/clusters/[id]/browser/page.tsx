"use client";
import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDatabase, faTable, faColumns, faChevronRight, faChevronDown,
  faArrowLeft, faSpinner, faRefresh, faPlus, faPen, faTrash,
  faKey, faLink, faSort, faSortUp, faSortDown, faSearch,
  faCheck, faXmark, faCircle, faLayerGroup, faBolt, faChevronLeft,
  faAngleDoubleLeft, faAngleDoubleRight, faTableColumns, faList,
} from "@fortawesome/free-solid-svg-icons";
import { useCluster } from "@/hooks/useClusters";
import Topbar from "@/components/layout/Topbar";
import { browserApi } from "@/lib/api";
import type {
  BrowserDatabase, BrowserTable, BrowserColumn, BrowserIndex,
  BrowserForeignKey, BrowserStructure, BrowserData,
} from "@/types";
import clsx from "clsx";
import toast from "react-hot-toast";

// ─── Type helpers ─────────────────────────────────────────────────────────────

type DbType = "postgres" | "mysql" | "redis";
type ActiveTab = "data" | "structure" | "indexes" | "foreign_keys";

interface Selection {
  database: string;
  table: string;
  schema: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_META: Record<DbType, { color: string; icon: typeof faDatabase }> = {
  postgres: { color: "text-blue-400", icon: faDatabase },
  mysql:    { color: "text-orange-400", icon: faLayerGroup },
  redis:    { color: "text-red-400", icon: faBolt },
};

// ─── Schema Tree ──────────────────────────────────────────────────────────────

function SchemaTree({
  clusterId,
  dbType,
  selection,
  onSelect,
}: {
  clusterId: string;
  dbType: DbType;
  selection: Selection | null;
  onSelect: (sel: Selection) => void;
}) {
  const [databases, setDatabases] = useState<BrowserDatabase[]>([]);
  const [dbsLoading, setDbsLoading] = useState(true);
  const [expandedDbs, setExpandedDbs] = useState<Record<string, boolean>>({});
  const [tables, setTables] = useState<Record<string, BrowserTable[]>>({});
  const [tablesLoading, setTablesLoading] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  const meta = DB_META[dbType] ?? DB_META.postgres;

  useEffect(() => {
    setDbsLoading(true);
    browserApi.listDatabases(clusterId)
      .then((d) => setDatabases(d.databases ?? []))
      .catch(() => setDatabases([]))
      .finally(() => setDbsLoading(false));
  }, [clusterId]);

  const toggleDb = useCallback(async (dbName: string) => {
    const nowOpen = !expandedDbs[dbName];
    setExpandedDbs((p) => ({ ...p, [dbName]: nowOpen }));
    if (nowOpen && !tables[dbName]) {
      setTablesLoading((p) => ({ ...p, [dbName]: true }));
      try {
        const d = await browserApi.listTables(clusterId, dbName);
        setTables((p) => ({ ...p, [dbName]: d.tables ?? [] }));
      } catch {
        setTables((p) => ({ ...p, [dbName]: [] }));
      } finally {
        setTablesLoading((p) => ({ ...p, [dbName]: false }));
      }
    }
  }, [clusterId, expandedDbs, tables]);

  const filteredDbs = search
    ? databases.filter((db) => db.name.toLowerCase().includes(search.toLowerCase()))
    : databases;

  if (dbsLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search */}
      <div className="p-2 border-b border-surface-border">
        <div className="relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter databases..."
            className="w-full bg-surface-100 border border-surface-border rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1 min-h-0">
        {filteredDbs.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-6">No databases found</p>
        )}
        {filteredDbs.map((db) => (
          <div key={db.name}>
            {/* Database row */}
            <button
              onClick={() => toggleDb(db.name)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-surface-100 transition-colors group"
            >
              <FontAwesomeIcon
                icon={expandedDbs[db.name] ? faChevronDown : faChevronRight}
                className="text-slate-500 text-xs w-3 flex-shrink-0"
              />
              <FontAwesomeIcon icon={meta.icon} className={clsx("text-xs flex-shrink-0", meta.color)} />
              <span className="text-sm font-medium text-white truncate">{db.name}</span>
              {db.size && (
                <span className="ml-auto text-[10px] text-slate-500 flex-shrink-0 opacity-0 group-hover:opacity-100">
                  {db.size}
                </span>
              )}
            </button>

            {/* Tables */}
            {expandedDbs[db.name] && (
              <div className="ml-2">
                {tablesLoading[db.name] ? (
                  <div className="flex items-center gap-2 px-5 py-2">
                    <FontAwesomeIcon icon={faSpinner} className="animate-spin text-slate-500 text-xs" />
                    <span className="text-xs text-slate-500">Loading tables...</span>
                  </div>
                ) : (tables[db.name] ?? []).length === 0 ? (
                  <p className="text-xs text-slate-500 px-5 py-2">No tables</p>
                ) : (
                  (tables[db.name] ?? []).map((tbl) => {
                    const schema = tbl.schema ?? "public";
                    const isSelected = selection?.database === db.name && selection?.table === tbl.name;
                    return (
                      <button
                        key={`${schema}.${tbl.name}`}
                        onClick={() => onSelect({ database: db.name, table: tbl.name, schema })}
                        className={clsx(
                          "w-full flex items-center gap-1.5 px-4 py-1.5 text-left transition-colors",
                          isSelected
                            ? "bg-brand-600/20 border-r-2 border-brand-500"
                            : "hover:bg-surface-100"
                        )}
                      >
                        <FontAwesomeIcon
                          icon={faTable}
                          className={clsx("text-xs flex-shrink-0", isSelected ? "text-brand-400" : "text-slate-400")}
                        />
                        <span className={clsx("text-xs truncate", isSelected ? "text-white font-medium" : "text-slate-300")}>
                          {tbl.name}
                        </span>
                        {tbl.estimated_rows != null && (
                          <span className="ml-auto text-[10px] text-slate-500 flex-shrink-0">
                            {tbl.estimated_rows.toLocaleString()}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Column type badge ────────────────────────────────────────────────────────

function TypeBadge({ col }: { col: BrowserColumn }) {
  const type = col.udt_name ?? col.data_type;
  const colors: Record<string, string> = {
    int4: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    int8: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    int2: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    integer: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    bigint: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    varchar: "bg-green-500/10 text-green-400 border-green-500/20",
    text: "bg-green-500/10 text-green-400 border-green-500/20",
    bool: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    boolean: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    timestamp: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    timestamptz: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    uuid: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    json: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    jsonb: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    float4: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    float8: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    numeric: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  };
  const cls = colors[type.toLowerCase()] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20";
  const display = col.character_maximum_length
    ? `${type}(${col.character_maximum_length})`
    : type;
  return (
    <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-mono border", cls)}>
      {display}
    </span>
  );
}

// ─── Structure Tab ────────────────────────────────────────────────────────────

function StructureTab({ structure }: { structure: BrowserStructure }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border text-left">
            <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider w-6">#</th>
            <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
            <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
            <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nullable</th>
            <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Default</th>
            <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Key</th>
          </tr>
        </thead>
        <tbody>
          {structure.columns.map((col, i) => (
            <tr key={col.name} className={clsx("border-b border-surface-border/50 hover:bg-surface-100 transition-colors", i % 2 === 0 ? "" : "bg-surface-50/30")}>
              <td className="px-3 py-2.5 text-xs text-slate-500">{col.ordinal_position}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {(col.is_primary_key === true || col.is_primary_key === 1) && (
                    <FontAwesomeIcon icon={faKey} className="text-yellow-400 text-[10px]" title="Primary Key" />
                  )}
                  <span className="font-medium text-white text-xs">{col.name}</span>
                </div>
              </td>
              <td className="px-3 py-2.5"><TypeBadge col={col} /></td>
              <td className="px-3 py-2.5">
                <span className={clsx("text-xs", col.is_nullable === "YES" ? "text-green-400" : "text-slate-500")}>
                  {col.is_nullable === "YES" ? "YES" : "NO"}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span className="text-xs text-slate-400 font-mono">{col.column_default ?? <span className="text-slate-600">—</span>}</span>
              </td>
              <td className="px-3 py-2.5">
                {col.column_key && (
                  <span className={clsx(
                    "text-[10px] px-1.5 py-0.5 rounded border",
                    col.column_key === "PRI" ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                    : col.column_key === "UNI" ? "text-blue-400 border-blue-500/30 bg-blue-500/10"
                    : col.column_key === "MUL" ? "text-purple-400 border-purple-500/30 bg-purple-500/10"
                    : "text-slate-400 border-slate-500/30"
                  )}>
                    {col.column_key}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Indexes Tab ─────────────────────────────────────────────────────────────

function IndexesTab({ structure }: { structure: BrowserStructure }) {
  const indexes = structure.indexes;
  if (indexes.length === 0) {
    return <p className="text-slate-500 text-sm p-4">No indexes found.</p>;
  }
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border text-left">
            <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
            <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
            <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Definition / Column</th>
          </tr>
        </thead>
        <tbody>
          {indexes.map((idx, i) => {
            const name = idx.name ?? idx.indexname ?? idx.Key_name ?? "";
            const isPrimary = idx.is_primary || idx.Key_name === "PRIMARY";
            const isUnique = idx.is_unique || idx.Non_unique === 0;
            const definition = idx.definition ?? idx.indexdef ?? idx.Column_name ?? "";
            return (
              <tr key={`${name}-${i}`} className="border-b border-surface-border/50 hover:bg-surface-100 transition-colors">
                <td className="px-3 py-2.5 text-xs font-medium text-white font-mono">{name}</td>
                <td className="px-3 py-2.5">
                  <span className={clsx(
                    "text-[10px] px-1.5 py-0.5 rounded border",
                    isPrimary ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                    : isUnique ? "text-blue-400 border-blue-500/30 bg-blue-500/10"
                    : "text-slate-400 border-slate-500/30"
                  )}>
                    {isPrimary ? "PRIMARY" : isUnique ? "UNIQUE" : "INDEX"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-400 font-mono max-w-xs truncate" title={definition}>
                  {definition}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Foreign Keys Tab ────────────────────────────────────────────────────────

function ForeignKeysTab({ structure }: { structure: BrowserStructure }) {
  const fkeys = structure.foreign_keys;
  if (fkeys.length === 0) {
    return <p className="text-slate-500 text-sm p-4">No foreign keys found.</p>;
  }
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border text-left">
            <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Constraint</th>
            <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Column</th>
            <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">References</th>
          </tr>
        </thead>
        <tbody>
          {fkeys.map((fk) => (
            <tr key={fk.constraint_name} className="border-b border-surface-border/50 hover:bg-surface-100 transition-colors">
              <td className="px-3 py-2.5 text-xs text-slate-400 font-mono">{fk.constraint_name}</td>
              <td className="px-3 py-2.5 text-xs text-white font-medium">{fk.column_name}</td>
              <td className="px-3 py-2.5 text-xs text-brand-400 flex items-center gap-1">
                <FontAwesomeIcon icon={faLink} className="text-[10px]" />
                {fk.foreign_table}.{fk.foreign_column}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Row Edit / Insert Modal ──────────────────────────────────────────────────

function RowModal({
  mode,
  columns,
  initialData,
  pkColumn,
  onSave,
  onClose,
  saving,
}: {
  mode: "insert" | "edit";
  columns: BrowserColumn[];
  initialData?: Record<string, string>;
  pkColumn?: string;
  onSave: (data: Record<string, string>) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(columns.map((c) => [c.name, initialData?.[c.name] ?? ""]))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-50 border border-surface-border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <h2 className="text-base font-semibold text-white">
            {mode === "insert" ? "Insert Row" : "Edit Row"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
          {columns.map((col) => {
            const isPk = col.is_primary_key === true || col.is_primary_key === 1;
            const isAutoInc = col.extra?.toLowerCase().includes("auto_increment") ||
              col.column_default?.toLowerCase?.()?.includes("nextval");
            const readOnly = mode === "insert" && isAutoInc;
            return (
              <div key={col.name}>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  <span className="flex items-center gap-1.5">
                    {isPk && <FontAwesomeIcon icon={faKey} className="text-yellow-400 text-[10px]" />}
                    {col.name}
                    <TypeBadge col={col} />
                    {col.is_nullable === "NO" && !isAutoInc && (
                      <span className="text-red-400 text-[10px]">required</span>
                    )}
                  </span>
                </label>
                {col.data_type === "boolean" || col.data_type === "tinyint(1)" ? (
                  <select
                    value={form[col.name]}
                    onChange={(e) => setForm((p) => ({ ...p, [col.name]: e.target.value }))}
                    disabled={readOnly}
                    className="w-full bg-surface-100 border border-surface-border rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50 focus:outline-none focus:border-brand-500"
                  >
                    <option value="">NULL</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form[col.name]}
                    onChange={(e) => setForm((p) => ({ ...p, [col.name]: e.target.value }))}
                    disabled={readOnly}
                    placeholder={readOnly ? "(auto)" : col.column_default ? `default: ${col.column_default}` : ""}
                    className="w-full bg-surface-100 border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 disabled:opacity-40 focus:outline-none focus:border-brand-500"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            className="btn-primary flex-1"
          >
            {saving ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" /> : <FontAwesomeIcon icon={faCheck} />}
            {mode === "insert" ? "Insert" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Data Tab ─────────────────────────────────────────────────────────────────

function DataTab({
  clusterId,
  selection,
  structure,
}: {
  clusterId: string;
  selection: Selection;
  structure: BrowserStructure;
}) {
  const [data, setData] = useState<BrowserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [sort, setSort] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [modal, setModal] = useState<"insert" | "edit" | null>(null);
  const [editRow, setEditRow] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingPk, setDeletingPk] = useState<string | null>(null);

  const pkColumn = structure.primary_keys[0] ?? null;

  const load = useCallback(async (p: number, s: string | null, sd: "asc" | "desc") => {
    setLoading(true);
    try {
      const d = await browserApi.getData(clusterId, selection.database, selection.table, {
        schema: selection.schema,
        page: p,
        page_size: pageSize,
        sort: s ?? undefined,
        dir: sd,
      });
      setData(d);
    } catch (e: unknown) {
      setData({ columns: [], rows: [], total: 0, page: p, page_size: pageSize, error: String(e) });
    } finally {
      setLoading(false);
    }
  }, [clusterId, selection, pageSize]);

  useEffect(() => {
    setPage(1);
    setSort(null);
    setSortDir("asc");
    load(1, null, "asc");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.database, selection.table]);

  const handleSort = (col: string) => {
    const newDir = sort === col && sortDir === "asc" ? "desc" : "asc";
    setSort(col);
    setSortDir(newDir);
    setPage(1);
    load(1, col, newDir);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    load(p, sort, sortDir);
  };

  const handleInsert = async (row: Record<string, string>) => {
    setSaving(true);
    try {
      // Filter out empty auto-increment fields
      const filtered = Object.fromEntries(
        Object.entries(row).filter(([, v]) => v !== "")
      );
      await browserApi.insertRow(clusterId, selection.database, selection.table, filtered, selection.schema);
      toast.success("Row inserted");
      setModal(null);
      load(page, sort, sortDir);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Insert failed");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (row: Record<string, string>) => {
    if (!pkColumn || !editRow) return;
    setSaving(true);
    try {
      const { [pkColumn]: _, ...updateData } = row;
      await browserApi.updateRow(
        clusterId, selection.database, selection.table,
        pkColumn, editRow[pkColumn],
        updateData, selection.schema,
      );
      toast.success("Row updated");
      setModal(null);
      setEditRow(null);
      load(page, sort, sortDir);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: Record<string, string>) => {
    if (!pkColumn) return;
    const pkVal = row[pkColumn];
    if (!confirm(`Delete row where ${pkColumn} = "${pkVal}"?`)) return;
    setDeletingPk(pkVal);
    try {
      await browserApi.deleteRow(clusterId, selection.database, selection.table, pkColumn, pkVal, selection.schema);
      toast.success("Row deleted");
      load(page, sort, sortDir);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingPk(null);
    }
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  const SortIcon = ({ col }: { col: string }) => {
    if (sort !== col) return <FontAwesomeIcon icon={faSort} className="text-slate-600 ml-1" />;
    return <FontAwesomeIcon icon={sortDir === "asc" ? faSortUp : faSortDown} className="text-brand-400 ml-1" />;
  };

  if (data?.error) {
    return (
      <div className="m-4 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
        {data.error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border flex-shrink-0">
        <div className="flex items-center gap-2">
          {data && (
            <span className="text-xs text-slate-400">
              <span className="text-white font-medium">{data.total.toLocaleString()}</span> rows
              {totalPages > 1 && ` · page ${page} of ${totalPages}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(page, sort, sortDir)}
            className="btn-secondary text-xs"
            title="Refresh"
          >
            <FontAwesomeIcon icon={faRefresh} className={loading ? "animate-spin" : ""} />
          </button>
          {structure.primary_keys.length > 0 && (
            <button
              onClick={() => { setModal("insert"); setEditRow(null); }}
              className="btn-primary text-xs"
            >
              <FontAwesomeIcon icon={faPlus} />
              Insert Row
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
            <FontAwesomeIcon icon={faSpinner} className="text-brand-400 text-2xl animate-spin" />
          </div>
        )}
        {data && data.columns.length > 0 ? (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-surface-50">
              <tr className="border-b border-surface-border">
                {pkColumn && <th className="w-8 px-2 py-2.5" />}
                {data.columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2.5 text-left font-semibold text-slate-400 whitespace-nowrap cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => handleSort(col)}
                  >
                    {col}
                    <SortIcon col={col} />
                  </th>
                ))}
                <th className="px-2 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, ri) => {
                const rowObj = Object.fromEntries(data.columns.map((c, i) => [c, String(row[i] ?? "")]));
                const pkVal = pkColumn ? rowObj[pkColumn] : null;
                const isDeleting = deletingPk === pkVal;
                return (
                  <tr
                    key={ri}
                    className={clsx(
                      "border-b border-surface-border/40 hover:bg-surface-100/60 transition-colors group",
                      ri % 2 === 0 ? "" : "bg-surface-50/20"
                    )}
                  >
                    {pkColumn && (
                      <td className="px-2 py-2 text-center">
                        <FontAwesomeIcon icon={faKey} className="text-yellow-500/30 group-hover:text-yellow-500/60 text-[9px]" />
                      </td>
                    )}
                    {data.columns.map((col, ci) => {
                      const val = row[ci];
                      const isNull = val === null || val === undefined;
                      const str = isNull ? "NULL" : String(val);
                      return (
                        <td key={col} className="px-3 py-2 max-w-xs">
                          {isNull ? (
                            <span className="text-slate-600 italic">NULL</span>
                          ) : str.length > 80 ? (
                            <span className="text-slate-300 truncate block" title={str}>{str.slice(0, 80)}…</span>
                          ) : (
                            <span className="text-slate-200">{str}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 w-16">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {pkColumn && (
                          <>
                            <button
                              onClick={() => { setEditRow(rowObj); setModal("edit"); }}
                              className="w-6 h-6 flex items-center justify-center rounded bg-brand-600/20 hover:bg-brand-600/40 text-brand-400 transition-colors"
                              title="Edit row"
                            >
                              <FontAwesomeIcon icon={faPen} className="text-[10px]" />
                            </button>
                            <button
                              onClick={() => handleDelete(rowObj)}
                              disabled={isDeleting}
                              className="w-6 h-6 flex items-center justify-center rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 transition-colors disabled:opacity-50"
                              title="Delete row"
                            >
                              {isDeleting
                                ? <FontAwesomeIcon icon={faSpinner} className="text-[10px] animate-spin" />
                                : <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                              }
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : !loading && (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-sm gap-2">
            <FontAwesomeIcon icon={faTable} className="text-2xl opacity-30" />
            <span>No data in this table</span>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-surface-border flex-shrink-0">
          <div className="flex items-center gap-1">
            <button onClick={() => handlePageChange(1)} disabled={page === 1} className="btn-secondary text-xs px-2 py-1 disabled:opacity-30">
              <FontAwesomeIcon icon={faAngleDoubleLeft} />
            </button>
            <button onClick={() => handlePageChange(page - 1)} disabled={page === 1} className="btn-secondary text-xs px-2 py-1 disabled:opacity-30">
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 3, totalPages - 6));
              const p = start + i;
              return (
                <button
                  key={p}
                  onClick={() => handlePageChange(p)}
                  className={clsx(
                    "w-7 h-7 text-xs rounded-lg transition-colors",
                    p === page ? "bg-brand-600 text-white" : "btn-secondary"
                  )}
                >
                  {p}
                </button>
              );
            })}
            <button onClick={() => handlePageChange(page + 1)} disabled={page === totalPages} className="btn-secondary text-xs px-2 py-1 disabled:opacity-30">
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
            <button onClick={() => handlePageChange(totalPages)} disabled={page === totalPages} className="btn-secondary text-xs px-2 py-1 disabled:opacity-30">
              <FontAwesomeIcon icon={faAngleDoubleRight} />
            </button>
          </div>
          <span className="text-xs text-slate-500">
            Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, data?.total ?? 0)} of {data?.total.toLocaleString()} rows
          </span>
        </div>
      )}

      {/* Modal */}
      {modal === "insert" && (
        <RowModal
          mode="insert"
          columns={structure.columns}
          pkColumn={pkColumn ?? undefined}
          onSave={handleInsert}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}
      {modal === "edit" && editRow && (
        <RowModal
          mode="edit"
          columns={structure.columns}
          initialData={editRow}
          pkColumn={pkColumn ?? undefined}
          onSave={handleUpdate}
          onClose={() => { setModal(null); setEditRow(null); }}
          saving={saving}
        />
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

function MainPanel({
  clusterId,
  selection,
}: {
  clusterId: string;
  selection: Selection;
}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("data");
  const [structure, setStructure] = useState<BrowserStructure | null>(null);
  const [structureLoading, setStructureLoading] = useState(true);

  useEffect(() => {
    setStructureLoading(true);
    setActiveTab("data");
    browserApi.getStructure(clusterId, selection.database, selection.table, selection.schema)
      .then(setStructure)
      .catch(() => setStructure({ columns: [], indexes: [], foreign_keys: [], primary_keys: [], error: "Failed to load structure" }))
      .finally(() => setStructureLoading(false));
  }, [clusterId, selection.database, selection.table, selection.schema]);

  const tabs: { id: ActiveTab; label: string; icon: typeof faTableColumns }[] = [
    { id: "data",         label: "Data",         icon: faList          },
    { id: "structure",    label: "Structure",     icon: faTableColumns  },
    { id: "indexes",      label: "Indexes",       icon: faSearch        },
    { id: "foreign_keys", label: "Foreign Keys",  icon: faLink          },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Breadcrumb + tabs */}
      <div className="flex-shrink-0 border-b border-surface-border">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-slate-400">
          <FontAwesomeIcon icon={faDatabase} className="text-brand-400" />
          <span>{selection.database}</span>
          <FontAwesomeIcon icon={faChevronRight} className="text-slate-600 text-[10px]" />
          {selection.schema !== "public" && (
            <>
              <span>{selection.schema}</span>
              <FontAwesomeIcon icon={faChevronRight} className="text-slate-600 text-[10px]" />
            </>
          )}
          <span className="text-white font-medium">{selection.table}</span>
          {structure && (
            <span className="text-slate-500 ml-1">
              ({structure.columns.length} columns)
            </span>
          )}
        </div>
        {/* Tabs */}
        <div className="flex gap-0 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-brand-500 text-brand-400"
                  : "border-transparent text-slate-400 hover:text-white"
              )}
            >
              <FontAwesomeIcon icon={tab.icon} className="text-[10px]" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {structureLoading ? (
          <div className="flex items-center justify-center h-40">
            <FontAwesomeIcon icon={faSpinner} className="text-brand-400 text-2xl animate-spin" />
          </div>
        ) : !structure ? null : (
          <>
            {activeTab === "data" && (
              <DataTab clusterId={clusterId} selection={selection} structure={structure} />
            )}
            {activeTab === "structure" && <div className="overflow-auto h-full"><StructureTab structure={structure} /></div>}
            {activeTab === "indexes" && <div className="overflow-auto h-full"><IndexesTab structure={structure} /></div>}
            {activeTab === "foreign_keys" && <div className="overflow-auto h-full"><ForeignKeysTab structure={structure} /></div>}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DatabaseBrowserPage() {
  const params = useParams<{ id: string }>();
  const { data: cluster, isLoading } = useCluster(params.id);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(260);

  if (isLoading) {
    return (
      <div className="min-h-full">
        <Topbar title="Database Browser" />
        <div className="flex items-center justify-center h-64">
          <FontAwesomeIcon icon={faSpinner} className="text-3xl text-brand-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (!cluster) {
    return (
      <div className="min-h-full">
        <Topbar title="Not Found" />
        <div className="p-6 text-slate-400 text-sm">Cluster not found.</div>
      </div>
    );
  }

  const dbType = (cluster.db_type ?? "postgres") as DbType;
  const meta = DB_META[dbType] ?? DB_META.postgres;
  const isRedis = dbType === "redis";

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Topbar
        title="Database Browser"
        subtitle={cluster.name}
      />

      {isRedis ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-8 text-center">
          <div className="max-w-sm">
            <FontAwesomeIcon icon={faBolt} className="text-4xl text-red-400 mb-4" />
            <p className="font-medium text-white mb-2">Redis Browser Not Available</p>
            <p className="text-slate-500">Use the Query Editor to explore your Redis data with commands like KEYS, GET, HGETALL, etc.</p>
            <Link href={`/dashboard/query-editor`} className="btn-primary mt-4 inline-block text-sm">Open Query Editor</Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar */}
          <div
            className="flex flex-col border-r border-surface-border flex-shrink-0 bg-surface-50 overflow-hidden"
            style={{ width: sidebarWidth }}
          >
            {/* Sidebar header */}
            <div className="flex items-center gap-2 px-3 py-3 border-b border-surface-border flex-shrink-0">
              <FontAwesomeIcon icon={meta.icon} className={clsx("text-sm", meta.color)} />
              <span className="text-sm font-semibold text-white truncate">{cluster.name}</span>
              <Link
                href={`/dashboard/clusters/${params.id}`}
                className="ml-auto text-slate-500 hover:text-white transition-colors flex-shrink-0"
                title="Back to cluster"
              >
                <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
              </Link>
            </div>
            {/* Tree */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <SchemaTree
                clusterId={params.id}
                dbType={dbType}
                selection={selection}
                onSelect={setSelection}
              />
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-surface-bg">
            {selection ? (
              <MainPanel clusterId={params.id} selection={selection} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3">
                <div className="w-16 h-16 rounded-2xl bg-surface-100 border border-surface-border flex items-center justify-center">
                  <FontAwesomeIcon icon={faTable} className="text-2xl text-slate-600" />
                </div>
                <p className="text-sm font-medium text-slate-400">Select a table to browse</p>
                <p className="text-xs text-slate-600">Expand a database in the sidebar and click a table</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
