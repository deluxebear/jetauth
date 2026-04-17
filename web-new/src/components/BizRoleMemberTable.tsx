import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { bizKeys } from "../backend/bizQueryKeys";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Plus, Search, User as UserIcon, Users as UsersIcon, X } from "lucide-react";
import { inputClass } from "./FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as BizBackend from "../backend/BizBackend";
import type { BizRoleMember, BizRoleMemberSubjectType } from "../backend/BizBackend";
import * as UserBackend from "../backend/UserBackend";
import * as GroupBackend from "../backend/GroupBackend";
import { friendlyError } from "../utils/errorHelper";

interface Props {
  roleId: number;
  organization: string;
  /** Fired after a member was added or removed, so parent pages can refresh dependent data. */
  onChanged?: () => void;
}

const PAGE_SIZE = 50;

// Small badge to visually distinguish subject types in the table.
function SubjectTypeBadge({ type }: { type: BizRoleMemberSubjectType }) {
  const { t } = useTranslation();
  const style =
    type === "user"
      ? "bg-info/10 text-info"
      : type === "group"
        ? "bg-emerald-500/10 text-emerald-500"
        : "bg-surface-2 text-text-muted";
  const label =
    type === "user"
      ? t("bizRole.member.subjectType.user") || "User"
      : type === "group"
        ? t("bizRole.member.subjectType.group") || "Group"
        : t("bizRole.member.subjectType.userset") || "Userset";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}>
      {label}
    </span>
  );
}

export default function BizRoleMemberTable({ roleId, organization, onChanged }: Props) {
  const { t } = useTranslation();
  const modal = useModal();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  const listQuery = useQuery({
    enabled: !!roleId,
    queryKey: bizKeys.roleMembersPage(roleId, offset),
    // Keep the previous page visible during pagination refetch — prevents
    // the table from flashing to a loading state when the offset changes.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await BizBackend.listBizRoleMembers(roleId, offset, PAGE_SIZE);
      if (res.status !== "ok" || !res.data) {
        throw new Error(friendlyError(res.msg, t) || t("common.loadFailed") || res.msg);
      }
      return { members: res.data.members ?? [], total: res.data.total ?? 0 };
    },
  });

  useEffect(() => {
    if (listQuery.error) {
      modal.toast((listQuery.error as Error).message, "error");
    }
  }, [listQuery.error, modal]);

  const members = listQuery.data?.members ?? [];
  const total = listQuery.data?.total ?? 0;
  const loading = listQuery.isLoading;

  // Invalidate every page for this role — simplest correct behavior, since a
  // remove from any page shifts the set. If this becomes a perf issue, switch
  // to setQueryData + optimistic slice update.
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: bizKeys.roleMembers(roleId) });

  const removeMutation = useMutation({
    mutationFn: (m: BizRoleMember) => BizBackend.removeBizRoleMember(m),
    onSuccess: (res) => {
      if (res.status === "ok") {
        modal.toast(t("common.deleteSuccess") || "Removed", "success");
        // If we deleted the last visible row on a non-first page, step back one page
        if (members.length === 1 && offset > 0) setOffset(Math.max(0, offset - PAGE_SIZE));
        else invalidate();
        onChanged?.();
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    },
    onError: (err: Error) => modal.toast(err.message || t("common.error"), "error"),
  });

  const handleRemove = (m: BizRoleMember) => {
    const msg =
      (t("bizRole.member.confirmRemove") || "Remove member {id} from this role?").replace("{id}", m.subjectId);
    modal.showConfirm(msg, () => { removeMutation.mutate(m); });
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-visible">
      <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-text-primary">
          {t("bizRole.member.sectionTitle") || "Members"}
          <span className="ml-2 text-text-muted font-normal">({total})</span>
        </h3>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
        >
          <Plus size={14} /> {t("bizRole.member.add") || "Add member"}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              <th className="px-5 py-2 w-[80px]">{t("bizRole.member.col.type") || "Type"}</th>
              <th className="px-5 py-2">{t("bizRole.member.col.subjectId") || "Subject"}</th>
              <th className="px-5 py-2 w-[180px]">{t("bizRole.member.col.addedTime") || "Added"}</th>
              <th className="px-5 py-2 w-[140px]">{t("bizRole.member.col.addedBy") || "Added by"}</th>
              <th className="px-5 py-2 w-[60px] text-right">{t("common.action") || ""}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {loading && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-[12px] text-text-muted">
                  <div className="inline-flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                    {t("common.loading") || "Loading…"}
                  </div>
                </td>
              </tr>
            )}
            {!loading && members.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-text-muted">
                  <UsersIcon size={22} className="mx-auto mb-2 text-text-muted/50" />
                  {t("bizRole.member.empty") || "No members yet."}
                </td>
              </tr>
            )}
            {!loading && members.map((m) => (
              <tr key={`${m.subjectType}:${m.subjectId}`} className="hover:bg-surface-2/40 transition-colors">
                <td className="px-5 py-2.5"><SubjectTypeBadge type={m.subjectType} /></td>
                <td className="px-5 py-2.5 font-mono text-[12px] text-text-primary truncate max-w-[280px]" title={m.subjectId}>{m.subjectId}</td>
                <td className="px-5 py-2.5 text-[12px] text-text-muted">{m.addedTime || "\u2014"}</td>
                <td className="px-5 py-2.5 text-[12px] text-text-muted truncate">{m.addedBy || "\u2014"}</td>
                <td className="px-5 py-2.5 text-right">
                  <button
                    onClick={() => handleRemove(m)}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors"
                    title={t("common.delete") || "Remove"}
                  >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-border-subtle text-[12px] text-text-muted">
          <span>
            {(t("common.paging.rangeTotal") || "Page {page} of {total}")
              .replace("{page}", String(page))
              .replace("{total}", String(pageCount))}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={!canPrev}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded-lg p-1.5 hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              disabled={!canNext}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded-lg p-1.5 hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Add-member picker modal */}
      <AnimatePresence>
        {showAdd && (
          <AddMemberModal
            roleId={roleId}
            organization={organization}
            existing={new Set(members.map((m) => `${m.subjectType}:${m.subjectId}`))}
            onClose={() => setShowAdd(false)}
            onAdded={() => {
              setShowAdd(false);
              // After adding, reset to first page so the user sees their additions.
              setOffset(0);
              invalidate();
              onChanged?.();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Add-member modal ───
// Tabs: User | Group. "Role" as a member is not meaningful (use inheritance instead);
// "Userset" is reserved for Phase 2 (ReBAC).

type PickerTab = "user" | "group";

function AddMemberModal({
  roleId,
  organization,
  existing,
  onClose,
  onAdded,
}: {
  roleId: number;
  organization: string;
  existing: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const modal = useModal();
  const [tab, setTab] = useState<PickerTab>("user");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<{ id: string; displayName: string; email: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; displayName: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    UserBackend.getUsers({ owner: organization }).then((res) => {
      if (res.status === "ok" && res.data) {
        setUsers(res.data.map((u: any) => ({
          id: `${u.owner}/${u.name}`,
          displayName: u.displayName || u.name,
          email: u.email || "",
        })));
      }
    });
    GroupBackend.getGroups({ owner: organization }).then((res) => {
      if (res.status === "ok" && res.data) {
        setGroups(res.data.map((g: any) => ({
          id: `${g.owner}/${g.name}`,
          displayName: g.displayName || g.name,
        })));
      }
    });
  }, [organization]);

  // Tab-switch clears the selection so the commit button's count always reflects the visible tab.
  useEffect(() => { setSelected(new Set()); setSearch(""); }, [tab]);

  const items = useMemo(() => {
    const pool = tab === "user"
      ? users.map((u) => ({ id: u.id, label: u.displayName, sub: u.email || u.id }))
      : groups.map((g) => ({ id: g.id, label: g.displayName, sub: g.id }));
    const q = search.trim().toLowerCase();
    return pool.filter((it) => {
      const key = `${tab}:${it.id}`;
      if (existing.has(key)) return false;
      if (!q) return true;
      return it.id.toLowerCase().includes(q) || it.label.toLowerCase().includes(q);
    });
  }, [tab, users, groups, search, existing]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const commit = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const results = await Promise.all(
      [...selected].map((subjectId) =>
        BizBackend.addBizRoleMember({ roleId, subjectType: tab, subjectId }),
      ),
    );
    setSaving(false);
    const errs = results.filter((r) => r.status !== "ok");
    if (errs.length) {
      modal.toast(
        (t("bizRole.member.addPartial") || "Added {ok} / {n}, {err} failed")
          .replace("{ok}", String(results.length - errs.length))
          .replace("{n}", String(results.length))
          .replace("{err}", String(errs.length)),
        "error",
      );
    } else {
      modal.toast(t("common.saveSuccess") || "Added", "success");
    }
    onAdded();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-[15px] font-semibold">{t("bizRole.member.pickerTitle") || "Add members"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-subtle">
          {(["user", "group"] as PickerTab[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium transition-colors ${
                tab === k ? "text-accent border-b-2 border-accent -mb-px" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {k === "user" ? <UserIcon size={13} /> : <UsersIcon size={13} />}
              {k === "user" ? (t("bizRole.member.tab.user") || "User") : (t("bizRole.member.tab.group") || "Group")}
            </button>
          ))}
        </div>

        <div className="px-5 py-3 border-b border-border-subtle">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              className={`${inputClass} pl-9`}
              placeholder={t("common.search") || "Search"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto divide-y divide-border-subtle">
          {items.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-text-muted">{t("common.noData") || "No results"}</div>
          ) : (
            items.map((it) => {
              const isSel = selected.has(it.id);
              return (
                <button
                  key={it.id}
                  onClick={() => toggle(it.id)}
                  className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors ${isSel ? "bg-accent/5" : "hover:bg-surface-2"}`}
                >
                  <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isSel ? "bg-accent border-accent" : "border-border"}`}>
                    {isSel && <Check size={12} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{it.label}</div>
                    <div className="text-[11px] text-text-muted font-mono truncate">{it.sub}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
            {t("common.cancel") || "Cancel"}
          </button>
          <button
            onClick={commit}
            disabled={selected.size === 0 || saving}
            className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <span className="inline-flex items-center gap-1.5"><div className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" /> {t("common.saving") || "Saving…"}</span>
            ) : (
              `${t("common.confirm") || "Add"} (${selected.size})`
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
