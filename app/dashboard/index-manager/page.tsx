"use client";
import { useState, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus, faTrash, faSpinner, faDatabase, faLayerGroup, faBolt,
  faListUl, faTriangleExclamation, faCheck, faKey,
} from "@fortawesome/free-solid-svg-icons";
import { useClusters, useDatabases } from "@/hooks/useClusters";
import { indexApi, browserApi } from "@/lib/api";
import Topbar from "@/components/layout/Topbar";
import { cn } from "@/lib/utils";
import type { ClusterListItem, IndexInfo } from "@/types";
import toast from "react-hot-toast";

const DB_META = {
  postgres: { icon: faDatabase, color: "text-blue-400", bg: "bg-blue-500/10", label: "PostgreSQL" },
  mysql:    { icon: faLayerGroup, color: "text-orange-400", bg: "bg-orange-500/10", label: "MySQL" },
  redis:    { icon: faBolt, color: "text-red-400", bg: "bg-red-500/10", label: "Redis" },
} as const;
type DbType = keyof typeof DB_META;

export default function IndexManagerPage() {
  const { data: clusters = [] } = useClusters();
  const runningClusters = useMemo(
    () => (clusters as ClusterListItem[]).filter((c) => c.status === "running" && c.db_type !== "redis"),
    [clusters]
  );
  const [clusterId, setClusterId] = useState("");
  const selectedCluster = runningClusters.find((c) => c.id === clusterId);
  const dbType = (selectedCluster?.db_type || "postgres") as DbType;
  const { data: databases = [] } = useDatabases(clusterId);
  const [database, setDatabase] = useState("");

  // Tables
  const [tables, setTables] = useState<{ name: string }[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableColumns, setTableColumns] = useState<string[]>([]);

  // Indexes
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCols, setNewCols] = useState<string[]>([]);
  const [newType, setNewType] = useState("btree");
  const [newUnique, setNewUnique] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchTables = async (cid: string, db: string) => {
    try {
      const res = await browserApi.listTables(cid, db);
      setTables(res.tables || []);
    } catch { setTables([]); }
  };

  const fetchIndexes = async (table?: string) => {
    if (!clusterId || !database) return;
    setLoading(true);
    try {
      const res = await indexApi.list(clusterId, database, table || undefined);
      setIndexes(res.indexes || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to list indexes");
    } finally {
      setLoading(false);
    }
  };

  const fetchColumns = async (table: string) => {
    if (!clusterId || !database) return;
    try {
      const res = await browserApi.getStructure(clusterId, database, table);
      setTableColumns((res.columns || []).map((c: { name: string }) => c.name));
    } catch { setTableColumns([]); }
  };

  const handleDbChange = (db: string) => {
    setDatabase(db);
    setSelectedTable("");
    setIndexes([]);
    setTableColumns([]);
    if (clusterId && db) fetchTables(clusterId, db);
  };

  const handleTableChange = (table: string) => {
    setSelectedTable(table);
    if (table) {
      fetchIndexes(table);
      fetchColumns(table);
    } else {
      fetchIndexes();
      setTableColumns([]);
    }
  };

  const handleCreate = async () => {
    if (!clusterId || !database || !selectedTable || !newName || !newCols.length) return;
    setCreating(true);
    try {
      await indexApi.create(clusterId, {
        database, table: selectedTable, index_name: newName,
        columns: newCols, index_type: newType, unique: newUnique,
      });
      toast.success(`Index '${newName}' created!`);
      setShowCreate(false);
      setNewName(""); setNewCols([]); setNewUnique(false);
      fetchIndexes(selectedTable);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create index");
    } finally {
      setCreating(false);
    }
  };

  const handleDrop = async (idx: IndexInfo) => {
    if (!confirm(`Drop index "${idx.index_name}"? This cannot be undone.`)) return;
    try {
      await indexApi.drop(clusterId, {
        database, index_name: idx.index_name, table: idx.table_name,
      });
      toast.success(`Index '${idx.index_name}' dropped`);
      fetchIndexes(selectedTable || undefined);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to drop index");
    }
  };

  const toggleCol = (col: string) => {
    setNewCols((prev) => prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]);
  };

  return (
    <>
      <Topbar title="Index Manager" subtitle="Create, view, and manage database indexes" />
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

        {/* Controls */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <FontAwesomeIcon icon={faListUl} className="text-brand-500 text-sm" />
            <h2 className="text-sm font-semibold text-fg-strong">Index Management</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-fg-subtle block mb-1">Cluster</label>
              <select
                value={clusterId}
                onChange={(e) => { setClusterId(e.target.value); setDatabase(""); setIndexes([]); setTables([]); }}
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
                onChange={(e) => handleDbChange(e.target.value)}
                disabled={!clusterId}
                className="w-full bg-surface-100 border border-surface-border rounded-lg px-3 py-2 text-sm text-fg-base focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
              >
                <option value="">Select database...</option>
                {databases.map((d: { name: string }) => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-fg-subtle block mb-1">Table (optional filter)</label>
              <select
                value={selectedTable}
                onChange={(e) => handleTableChange(e.target.value)}
                disabled={!database}
                className="w-full bg-surface-100 border border-surface-border rounded-lg px-3 py-2 text-sm text-fg-base focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
              >
                <option value="">All tables</option>
                {tables.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchIndexes(selectedTable || undefined)}
              disabled={loading || !clusterId || !database}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-500 transition-colors disabled:opacity-50"
            >
              <FontAwesomeIcon icon={loading ? faSpinner : faListUl} spin={loading} />
              {loading ? "Loading..." : "Refresh Indexes"}
            </button>
            {selectedTable && (
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-500/30 bg-brand-500/10 text-brand-400 text-sm font-medium hover:bg-brand-500/20 transition-colors"
              >
                <FontAwesomeIcon icon={faPlus} />
                Create Index
              </button>
            )}
          </div>
        </div>

        {/* Create Index Form */}
        {showCreate && selectedTable && (
          <div className="rounded-xl border border-brand-500/30 bg-surface-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-fg-strong">Create New Index on &ldquo;{selectedTable}&rdquo;</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-fg-subtle block mb-1">Index Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="idx_table_column"
                  className="w-full bg-surface-100 border border-surface-border rounded-lg px-3 py-2 text-sm text-fg-base font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs text-fg-subtle block mb-1">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full bg-surface-100 border border-surface-border rounded-lg px-3 py-2 text-sm text-fg-base focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="btree">B-Tree (default)</option>
                  <option value="hash">Hash</option>
                  {dbType === "postgres" && <option value="gin">GIN</option>}
                  {dbType === "postgres" && <option value="gist">GiST</option>}
                  {dbType === "postgres" && <option value="brin">BRIN</option>}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => setNewUnique(!newUnique)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                    newUnique
                      ? "border-green-500/30 bg-green-500/10 text-green-400"
                      : "border-surface-border bg-surface-100 text-fg-muted"
                  )}
                >
                  <FontAwesomeIcon icon={newUnique ? faCheck : faKey} />
                  UNIQUE
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-fg-subtle block mb-1">Columns (click to select, order matters)</label>
              <div className="flex flex-wrap gap-2">
                {tableColumns.map((col) => (
                  <button
                    key={col}
                    onClick={() => toggleCol(col)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-mono border transition-all",
                      newCols.includes(col)
                        ? "border-brand-500/40 bg-brand-500/15 text-brand-400"
                        : "border-surface-border bg-surface-100 text-fg-muted hover:text-fg-base"
                    )}
                  >
                    {newCols.includes(col) && <span className="mr-1">{newCols.indexOf(col) + 1}.</span>}
                    {col}
                  </button>
                ))}
              </div>
              {newCols.length > 0 && (
                <p className="text-2xs text-fg-subtle mt-1">
                  Index columns: {newCols.join(", ")}
                </p>
              )}
            </div>

            <button
              onClick={handleCreate}
              disabled={creating || !newName || !newCols.length}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-500 transition-colors disabled:opacity-50"
            >
              <FontAwesomeIcon icon={creating ? faSpinner : faPlus} spin={creating} />
              {creating ? "Creating..." : "Create Index"}
            </button>
          </div>
        )}

        {/* Indexes Table */}
        {indexes.length > 0 && (
          <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-border bg-surface-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fg-strong">
                Indexes ({indexes.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-surface-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-fg-muted font-semibold border-b border-surface-border text-xs">Name</th>
                    <th className="text-left px-4 py-2.5 text-fg-muted font-semibold border-b border-surface-border text-xs">Table</th>
                    <th className="text-left px-4 py-2.5 text-fg-muted font-semibold border-b border-surface-border text-xs">Columns</th>
                    <th className="text-left px-4 py-2.5 text-fg-muted font-semibold border-b border-surface-border text-xs">Type</th>
                    <th className="text-left px-4 py-2.5 text-fg-muted font-semibold border-b border-surface-border text-xs">Properties</th>
                    <th className="text-left px-4 py-2.5 text-fg-muted font-semibold border-b border-surface-border text-xs">Size</th>
                    <th className="text-right px-4 py-2.5 text-fg-muted font-semibold border-b border-surface-border text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {indexes.map((idx) => (
                    <tr key={idx.index_name} className="border-b border-surface-border/40 hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-2.5 text-fg-base font-mono text-xs">{idx.index_name}</td>
                      <td className="px-4 py-2.5 text-fg-muted text-xs">{idx.table_name}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {idx.columns.map((c) => (
                            <span key={c} className="bg-surface-100 px-1.5 py-0.5 rounded text-fg-muted font-mono text-2xs">{c}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-fg-muted text-xs font-mono">{idx.index_type}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <div className="flex gap-1">
                          {idx.is_primary && (
                            <span className="bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded text-2xs font-medium">PK</span>
                          )}
                          {idx.is_unique && !idx.is_primary && (
                            <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded text-2xs font-medium">UNIQUE</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-fg-subtle text-xs font-mono">{idx.size || "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        {!idx.is_primary && (
                          <button
                            onClick={() => handleDrop(idx)}
                            className="text-red-400/60 hover:text-red-400 transition-colors p-1"
                            title="Drop index"
                          >
                            <FontAwesomeIcon icon={faTrash} className="text-xs" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && indexes.length === 0 && clusterId && database && (
          <div className="rounded-xl border border-surface-border bg-surface-card p-8 text-center">
            <p className="text-fg-subtle text-sm">No indexes found. Select a database and click &ldquo;Refresh Indexes&rdquo;.</p>
          </div>
        )}

        {/* Educational info */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-5">
          <h3 className="text-sm font-semibold text-fg-strong mb-3">Index Types Explained</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <p className="font-semibold text-blue-400 mb-1">B-Tree</p>
              <p className="text-fg-muted">Default index type. Supports equality and range queries (=, &lt;, &gt;, BETWEEN). Optimal for most use cases.</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
              <p className="font-semibold text-purple-400 mb-1">Hash</p>
              <p className="text-fg-muted">Only supports equality comparisons (=). Smaller than B-tree for equality-only columns. Not crash-safe in older PG versions.</p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
              <p className="font-semibold text-green-400 mb-1">GIN (Generalized Inverted)</p>
              <p className="text-fg-muted">PostgreSQL only. Ideal for full-text search, arrays, JSONB containment queries. Multiple values per row.</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="font-semibold text-amber-400 mb-1">GiST (Generalized Search Tree)</p>
              <p className="text-fg-muted">PostgreSQL only. Supports geometric data, range types, and full-text search with different trade-offs than GIN.</p>
            </div>
            <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <p className="font-semibold text-red-400 mb-1">BRIN (Block Range)</p>
              <p className="text-fg-muted">PostgreSQL only. Extremely compact index for naturally ordered data (timestamps, sequences). Very small size.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
