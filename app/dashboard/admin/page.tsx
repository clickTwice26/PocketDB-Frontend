"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUserShield, faSpinner, faSearch, faCheck, faTriangleExclamation,
  faUser, faCrown, faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import { adminApi, type AuthUser } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import Topbar from "@/components/layout/Topbar";
import toast from "react-hot-toast";

const ROLES: { value: "normal" | "subscriber" | "admin"; label: string; icon: typeof faUser; color: string; bg: string }[] = [
  { value: "normal",     label: "Normal",     icon: faUser,         color: "text-fg-muted",    bg: "bg-surface-100" },
  { value: "subscriber", label: "Subscriber", icon: faCrown,        color: "text-yellow-400",  bg: "bg-yellow-500/10" },
  { value: "admin",      label: "Admin",      icon: faShieldHalved, color: "text-brand-400",   bg: "bg-brand-500/10" },
];

function RoleBadge({ role }: { role: string }) {
  const r = ROLES.find((x) => x.value === role) ?? ROLES[0];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border", r.bg, r.color, "border-current/20")}>
      <FontAwesomeIcon icon={r.icon} className="text-xs" />
      {r.label}
    </span>
  );
}

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");
  const [changingId, setChangingId] = useState<string | null>(null);

  const { data: users = [], isLoading, error } = useQuery<AuthUser[]>({
    queryKey: ["admin", "users"],
    queryFn: adminApi.listUsers,
    staleTime: 30_000,
  });

  const { mutate: changeRole } = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "normal" | "subscriber" | "admin" }) =>
      adminApi.updateRole(userId, role),
    onMutate: ({ userId }) => setChangingId(userId),
    onSuccess: (updated) => {
      qc.setQueryData<AuthUser[]>(["admin", "users"], (prev) =>
        prev?.map((u) => (u.id === updated.id ? updated : u)) ?? []
      );
      toast.success(`${updated.name}'s role updated to ${updated.role}`);
    },
    onError: () => toast.error("Failed to update role"),
    onSettled: () => setChangingId(null),
  });

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Topbar title="User Management" subtitle="Manage roles for all registered users" />

      <div className="flex-1 overflow-auto p-6">

        {/* Header stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {ROLES.map((r) => {
            const count = users.filter((u) => u.role === r.value).length;
            return (
              <div key={r.value} className={cn("rounded-xl border border-surface-border p-4 flex items-center gap-3", r.bg)}>
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center bg-surface-100")}>
                  <FontAwesomeIcon icon={r.icon} className={cn("text-base", r.color)} />
                </div>
                <div>
                  <p className="text-xl font-bold text-fg-strong tabular-nums">{count}</p>
                  <p className="text-xs text-fg-subtle">{r.label} user{count !== 1 ? "s" : ""}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle text-xs" />
          <input
            className="w-full bg-surface-50 border border-surface-border rounded-lg pl-8 pr-3 py-2 text-sm text-fg-base placeholder:text-fg-subtle focus:outline-none focus:border-brand-500/60"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="rounded-xl border border-surface-border overflow-hidden bg-surface-50">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-fg-subtle">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
              <span className="text-sm">Loading users…</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center gap-2 py-16 text-red-400">
              <FontAwesomeIcon icon={faTriangleExclamation} />
              <span className="text-sm">Failed to load users</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-fg-subtle">
              <FontAwesomeIcon icon={faUserShield} className="text-2xl opacity-30" />
              <span className="text-sm">No users found</span>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-surface-100 border-b border-surface-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-subtle uppercase tracking-wide">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-subtle uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-subtle uppercase tracking-wide">Current Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-subtle uppercase tracking-wide">Joined</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-fg-subtle uppercase tracking-wide">Change Role</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const isChanging = changingId === u.id;
                  return (
                    <tr key={u.id} className="border-b border-surface-border/50 hover:bg-surface-100/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt={u.name} referrerPolicy="no-referrer" className="w-7 h-7 rounded-full object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-brand-500/15 border border-brand-500/20 flex items-center justify-center">
                              <span className="text-xs font-semibold text-brand-400">{u.name.charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-semibold text-fg-base leading-tight">{u.name}</p>
                            {isSelf && <span className="text-2xs text-fg-subtle">You</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-fg-muted font-mono">{u.email}</td>
                      <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                      <td className="px-4 py-3 text-xs text-fg-subtle">
                        {new Date(u.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {isChanging ? (
                            <FontAwesomeIcon icon={faSpinner} className="text-brand-400 animate-spin" />
                          ) : isSelf ? (
                            <span className="text-xs text-fg-subtle italic">Cannot change own role</span>
                          ) : (
                            ROLES.map((r) => (
                              <button
                                key={r.value}
                                disabled={u.role === r.value}
                                onClick={() => changeRole({ userId: u.id, role: r.value })}
                                className={cn(
                                  "inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-all",
                                  u.role === r.value
                                    ? cn(r.bg, r.color, "border-current/20 opacity-60 cursor-default")
                                    : "border-surface-border text-fg-subtle hover:border-brand-500/40 hover:text-fg-base bg-surface-100 hover:bg-surface-200"
                                )}
                                title={`Set role to ${r.label}`}
                              >
                                {u.role === r.value && <FontAwesomeIcon icon={faCheck} className="text-xs" />}
                                <FontAwesomeIcon icon={r.icon} className="text-xs" />
                                {r.label}
                              </button>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
