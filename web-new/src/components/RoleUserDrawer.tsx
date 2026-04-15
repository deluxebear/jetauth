import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as RoleBackend from "../backend/RoleBackend";
import * as UserBackend from "../backend/UserBackend";
import type { Role } from "../backend/RoleBackend";

interface Props {
  role: Role | null;
  onClose: () => void;
  onUpdate: () => void;
}

const PAGE_SIZE = 20;

export default function RoleUserDrawer({ role, onClose, onUpdate }: Props) {
  const { t } = useTranslation();
  const modal = useModal();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [orgUsers, setOrgUsers] = useState<{ owner: string; name: string; displayName: string; email?: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const isOpen = !!role;

  // Reset state when role changes
  useEffect(() => {
    setSearch("");
    setPage(0);
    setShowAddModal(false);
    setAddSearch("");
  }, [role?.name]);

  // Load org users when add modal opens
  useEffect(() => {
    if (!showAddModal || !role) return;
    setLoadingUsers(true);
    UserBackend.getUsers({ owner: role.owner }).then((res) => {
      if (res.status === "ok" && res.data) {
        setOrgUsers(res.data.map((u: any) => ({
          owner: u.owner,
          name: u.name,
          displayName: u.displayName || u.name,
          email: u.email,
        })));
      }
    }).finally(() => setLoadingUsers(false));
  }, [showAddModal, role?.owner]);

  const users = useMemo(() => {
    if (!role?.users) return [];
    const list = role.users.map((u) => {
      const parts = u.split("/");
      return { id: u, owner: parts[0] || "", name: parts[1] || parts[0] || "" };
    });
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((u) => u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q));
  }, [role?.users, search]);

  const totalPages = Math.ceil(users.length / PAGE_SIZE);
  const pageUsers = users.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleRemoveUser = async (userId: string) => {
    if (!role) return;
    modal.showConfirm(t("authz.drawer.removeConfirm" as any), async () => {
      const updated = { ...role, users: role.users.filter((u) => u !== userId) };
      const res = await RoleBackend.updateRole(role.owner, role.name, updated as Role);
      if (res.status === "ok") {
        onUpdate();
      } else {
        modal.toast(res.msg || t("common.saveFailed" as any), "error");
      }
    });
  };

  const handleAddUsers = async (userIds: string[]) => {
    if (!role || userIds.length === 0) return;
    const existing = new Set(role.users || []);
    const newUsers = userIds.filter((u) => !existing.has(u));
    if (newUsers.length === 0) { setShowAddModal(false); return; }
    const updated = { ...role, users: [...(role.users || []), ...newUsers] };
    const res = await RoleBackend.updateRole(role.owner, role.name, updated as Role);
    if (res.status === "ok") {
      onUpdate();
      setShowAddModal(false);
    } else {
      modal.toast(res.msg || t("common.saveFailed" as any), "error");
    }
  };

  // Users available to add (not already in role)
  const availableUsers = useMemo(() => {
    if (!role) return [];
    const existing = new Set(role.users || []);
    let list = orgUsers.filter((u) => !existing.has(`${u.owner}/${u.name}`));
    if (addSearch) {
      const q = addSearch.toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
    }
    return list.slice(0, 50);
  }, [orgUsers, role?.users, addSearch]);

  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());

  return (
    <>
      {/* Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && role && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 w-[420px] max-w-[90vw] bg-surface-0 border-l border-border z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="text-[15px] font-semibold text-text-primary">
                {role.name} {t("authz.drawer.usersOf" as any)} ({role.users?.length ?? 0})
              </h3>
              <button onClick={onClose} className="rounded-md p-1 border border-border hover:border-border-hover text-text-muted hover:text-text-primary transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Search + Add */}
            <div className="flex gap-2 px-5 py-3 border-b border-border-subtle shrink-0">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  placeholder={t("authz.drawer.searchUsers" as any)}
                  className="w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 py-2 text-[12px] text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
                />
              </div>
              <button onClick={() => { setShowAddModal(true); setSelectedToAdd(new Set()); setAddSearch(""); }}
                className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover transition-colors shrink-0">
                <Plus size={12} /> {t("authz.drawer.addUser" as any)}
              </button>
            </div>

            {/* User List */}
            <div className="flex-1 overflow-y-auto">
              {pageUsers.map((u) => (
                <div key={u.id} className="group flex items-center gap-3 px-5 py-2.5 border-b border-border-subtle hover:bg-accent/[0.02] transition-colors">
                  <div className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center text-[12px] font-semibold text-text-muted shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-text-primary truncate">{u.name}</div>
                    <div className="text-[11px] text-text-muted truncate">{u.id}</div>
                  </div>
                  <button
                    onClick={() => handleRemoveUser(u.id)}
                    className="text-[11px] text-danger font-semibold opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded hover:bg-danger/10"
                  >
                    {t("authz.drawer.remove" as any)}
                  </button>
                </div>
              ))}
              {users.length === 0 && (
                <div className="px-5 py-8 text-center text-text-muted text-[13px]">{t("common.noData")}</div>
              )}
            </div>

            {/* Footer / Pagination */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0 text-[11px] text-text-muted">
              <span>
                {t("authz.drawer.showing" as any)} {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, users.length)} {t("authz.drawer.of" as any)} {users.length}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded border border-border px-2 py-1 text-[11px] hover:bg-surface-2 disabled:opacity-40 transition-colors"
                >
                  {t("authz.drawer.prev" as any)}
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded border border-border px-2 py-1 text-[11px] hover:bg-surface-2 disabled:opacity-40 transition-colors"
                >
                  {t("authz.drawer.next" as any)}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Users Modal */}
      <AnimatePresence>
        {showAddModal && role && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="fixed inset-0 bg-black/50 z-[60]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-w-[90vw] bg-surface-1 border border-border rounded-xl shadow-2xl z-[61] flex flex-col max-h-[70vh]"
            >
              <div className="px-5 py-4 border-b border-border shrink-0">
                <h3 className="text-[15px] font-semibold text-text-primary">{t("authz.drawer.addUsers" as any)}</h3>
                <p className="text-[12px] text-text-muted mt-0.5">{t("authz.drawer.selectUsers" as any)}</p>
              </div>
              <div className="px-5 py-3 border-b border-border-subtle shrink-0">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder={t("authz.drawer.searchUsers" as any)}
                    className="w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 py-2 text-[12px] text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loadingUsers ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                  </div>
                ) : (
                  availableUsers.map((u) => {
                    const uid = `${u.owner}/${u.name}`;
                    const selected = selectedToAdd.has(uid);
                    return (
                      <label key={uid} className="flex items-center gap-3 px-5 py-2.5 border-b border-border-subtle hover:bg-accent/[0.02] cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            setSelectedToAdd((s) => {
                              const next = new Set(s);
                              if (selected) next.delete(uid); else next.add(uid);
                              return next;
                            });
                          }}
                          className="rounded border-border text-accent focus:ring-accent"
                        />
                        <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center text-[11px] font-semibold text-text-muted shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-text-primary truncate">{u.displayName}</div>
                          <div className="text-[11px] text-text-muted truncate">{u.owner}/{u.name}{u.email ? ` · ${u.email}` : ""}</div>
                        </div>
                      </label>
                    );
                  })
                )}
                {!loadingUsers && availableUsers.length === 0 && (
                  <div className="px-5 py-8 text-center text-text-muted text-[13px]">{t("common.noData")}</div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
                <button onClick={() => setShowAddModal(false)} className="rounded-lg border border-border px-4 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                  {t("common.cancel")}
                </button>
                <button
                  onClick={() => handleAddUsers([...selectedToAdd])}
                  disabled={selectedToAdd.size === 0}
                  className="rounded-lg bg-accent px-4 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  {t("common.confirm")} ({selectedToAdd.size})
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
