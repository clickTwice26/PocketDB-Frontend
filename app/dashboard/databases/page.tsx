"use client";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus, faSearch, faDatabase, faSpinner,
  faTrash, faServer, faUser, faCalendar,
  faCircleExclamation, faPlugCircleCheck,
} from "@fortawesome/free-solid-svg-icons";
import { useUserDatabases, useDeleteDatabase } from "@/hooks/useClusters";
import Topbar from "@/components/layout/Topbar";
import CreateDatabaseModal from "@/components/modals/CreateDatabaseModal";
import type { UserDatabase } from "@/types";
import clsx from "clsx";

const DB_COLORS: Record<string, string> = {
  postgres: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  mysql: "text-orange-400 bg-orange-500/10 border-orange-500/20",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function DatabaseCard({ db }: { db: UserDatabase }) {
  const { mutate: deleteDb, isPending } = useDeleteDatabase();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    deleteDb(db.id, { onSuccess: () => setConfirmDelete(false) });
  };

  return (
    <div className="bg-surface-50 border border-surface-border rounded-2xl p-5 hover:border-slate-600 transition-colors flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={clsx(
            "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0",
            DB_COLORS[db.db_type] ?? "text-slate-400 bg-surface-100 border-surface-border"
          )}>
            <FontAwesomeIcon icon={faDatabase} className="text-sm" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-fg-base truncate">{db.database_name}</p>
            <p className="text-xs text-slate-500 capitalize">{db.db_type}</p>
          </div>
        </div>

        {/* Status dot */}
        <span className="flex items-center gap-1.5 text-xs text-emerald-400 shrink-0 mt-0.5">
          <FontAwesomeIcon icon={faPlugCircleCheck} />
          Active
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400">
          <FontAwesomeIcon icon={faServer} className="text-slate-500" />
          <span className="font-mono">{db.host}:{db.port}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <FontAwesomeIcon icon={faUser} className="text-slate-500" />
          <span className="font-mono truncate">{db.db_username}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 col-span-2">
          <FontAwesomeIcon icon={faCalendar} className="text-slate-500" />
          <span>Created {timeAgo(db.created_at)}</span>
        </div>
      </div>

      {/* Delete */}
      <div className="pt-1 border-t border-surface-border">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400 flex-1 flex items-center gap-1.5">
              <FontAwesomeIcon icon={faCircleExclamation} />
              This will drop the database and its data permanently.
            </span>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-slate-500 hover:text-white px-2 py-1 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-500/30 hover:border-red-400/50 transition-colors flex items-center gap-1"
            >
              {isPending ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" /> : <FontAwesomeIcon icon={faTrash} />}
              Confirm
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1.5"
          >
            <FontAwesomeIcon icon={faTrash} />
            Delete database
          </button>
        )}
      </div>
    </div>
  );
}

export default function DatabasesPage() {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const { data: databases = [], isLoading, error } = useUserDatabases();

  const filtered = (databases as UserDatabase[]).filter((d) =>
    d.database_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-full">
      <Topbar
        title="My Databases"
        subtitle={`${(databases as UserDatabase[]).length} database${(databases as UserDatabase[]).length !== 1 ? "s" : ""}`}
      />

      <div className="p-4 md:p-6 space-y-5">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm"
            />
            <input
              className="input pl-9"
              placeholder="Search databases..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="btn-primary shrink-0"
          >
            <FontAwesomeIcon icon={faPlus} />
            New Database
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-red-400 gap-2">
            <FontAwesomeIcon icon={faCircleExclamation} />
            Failed to load databases
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="w-14 h-14 bg-surface-100 rounded-2xl flex items-center justify-center text-slate-500 text-2xl">
              <FontAwesomeIcon icon={faDatabase} />
            </div>
            <div>
              <p className="font-semibold text-fg-base mb-1">
                {search ? "No databases match your search" : "No databases yet"}
              </p>
              <p className="text-sm text-slate-500">
                Create your first database to get started.
              </p>
            </div>
            {!search && (
              <button onClick={() => setModalOpen(true)} className="btn-primary">
                <FontAwesomeIcon icon={faPlus} />
                Create Database
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((db) => (
              <DatabaseCard key={db.id} db={db} />
            ))}
          </div>
        )}
      </div>

      <CreateDatabaseModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
