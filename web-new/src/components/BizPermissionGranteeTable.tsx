import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { bizKeys } from "../backend/bizQueryKeys";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Plus, Search, Shield, User as UserIcon, Users as UsersIcon, X } from "lucide-react";
import { inputClass } from "./FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as BizBackend from "../backend/BizBackend";
import * as UserBackend from "../backend/UserBackend";
import * as GroupBackend from "../backend/GroupBackend";
import type { BizPermissionGrantee, BizPermissionGranteeSubjectType, BizRole } from "../backend/BizBackend";
import { friendlyError } from "../utils/errorHelper";

interface Props {
  permissionId: number;
  /** Org of the owning permission — used to scope candidate users/groups/roles. */
  organization: string;
  /** AppName of the owning permission — the "Role" tab shows roles visible to this app
   *  (app-scope for this app + org-scope across the org). */
  appName: string;
  onChanged?: () => void;
}

const PAGE_SIZE = 50;

type FilterKind = "all" | BizPermissionGranteeSubjectType;

export default function BizPermissionGranteeTable({ permissionId, organization, appName, onChanged }: Props) {
  const { t } = useTranslation();
  const modal = useModal();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [showAdd, setShowAdd] = useState(false);

  // Note: server-side filtering by subjectType is not an endpoint concern — we filter
  // on the client over the current page. If this ever becomes a perf issue, add a
  // subjectType query param to biz-list-permission-grantees.
  const listQuery = useQuery({
    enabled: !!permissionId,
    queryKey: bizKeys.permissionGranteesPage(permissionId, offset),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await BizBackend.listBizPermissionGrantees(permissionId, offset, PAGE_SIZE);
      if (res.status !== "ok" || !res.data) {
        throw new Error(friendlyError(res.msg, t) || res.msg);
      }
      return { grantees: res.data.grantees ?? [], total: res.data.total ?? 0 };
    },
  });

  useEffect(() => {
    if (listQuery.error) {
      modal.toast((listQuery.error as Error).message, "error");
    }
  }, [listQuery.error, modal]);

  const grantees = listQuery.data?.grantees ?? [];
  const total = listQuery.data?.total ?? 0;
  const loading = listQuery.isLoading;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: bizKeys.permissionGrantees(permissionId) });

  const filtered = useMemo(() => {
    if (filter === "all") return grantees;
    return grantees.filter((g) => g.subjectType === filter);
  }, [grantees, filter]);

  const removeMutation = useMutation({
    mutationFn: (g: BizPermissionGrantee) => BizBackend.removeBizPermissionGrantee(g),
    onSuccess: (res) => {
      if (res.status === "ok") {
        modal.toast(t("common.deleteSuccess") || "Revoked", "success");
        if (grantees.length === 1 && offset > 0) setOffset(Math.max(0, offset - PAGE_SIZE));
        else invalidate();
        onChanged?.();
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    },
    onError: (err: Error) => modal.toast(err.message || t("common.error"), "error"),
  });

  const handleRemove = (g: BizPermissionGrantee) => {
    const msg = (t("bizPerm.grantee.confirmRemove") || "Revoke grant to {id}?")
      .replace("{id}", g.subjectId);
    modal.showConfirm(msg, () => { removeMutation.mutate(g); });
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  const chips: { key: FilterKind; label: string }[] = [
    { key: "all", label: t("bizPerm.grantee.filter.all") || "All" },
    { key: "user", label: t("bizPerm.grantee.filter.user") || "Users" },
    { key: "group", label: t("bizPerm.grantee.filter.group") || "Groups" },
    { key: "role", label: t("bizPerm.grantee.filter.role") || "Roles" },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-visible">
      <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-text-primary">
          {t("bizPerm.grantee.sectionTitle") || "Granted to"}
          <span className="ml-2 text-text-muted font-normal">({total})</span>
        </h3>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
        >
          <Plus size={14} /> {t("bizPerm.grantee.add") || "Add grantee"}
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 px-5 py-2 border-b border-border-subtle">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              filter === c.key
                ? "bg-accent/15 text-accent"
                : "bg-surface-2 text-text-muted hover:text-text-secondary"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              <th className="px-5 py-2 w-[80px]">{t("bizPerm.grantee.col.type") || "Type"}</th>
              <th className="px-5 py-2">{t("bizPerm.grantee.col.subjectId") || "Subject"}</th>
              <th className="px-5 py-2 w-[180px]">{t("bizPerm.grantee.col.addedTime") || "Added"}</th>
              <th className="px-5 py-2 w-[140px]">{t("bizPerm.grantee.col.addedBy") || "Added by"}</th>
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
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-text-muted">
                  <Shield size={22} className="mx-auto mb-2 text-text-muted/50" />
                  {t("bizPerm.grantee.empty") || "No grantees."}
                </td>
              </tr>
            )}
            {!loading && filtered.map((g) => (
              <tr key={`${g.subjectType}:${g.subjectId}`} className="hover:bg-surface-2/40 transition-colors">
                <td className="px-5 py-2.5"><GranteeTypeBadge type={g.subjectType} /></td>
                <td className="px-5 py-2.5 font-mono text-[12px] text-text-primary truncate max-w-[280px]" title={g.subjectId}>{g.subjectId}</td>
                <td className="px-5 py-2.5 text-[12px] text-text-muted">{g.addedTime || "\u2014"}</td>
                <td className="px-5 py-2.5 text-[12px] text-text-muted truncate">{g.addedBy || "\u2014"}</td>
                <td className="px-5 py-2.5 text-right">
                  <button
                    onClick={() => handleRemove(g)}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors"
                    title={t("common.delete") || "Revoke"}
                  >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-border-subtle text-[12px] text-text-muted">
          <span>
            {(t("common.paging.rangeTotal") || "Page {page} of {total}")
              .replace("{page}", String(page))
              .replace("{total}", String(pageCount))}
          </span>
          <div className="flex items-center gap-1">
            <button disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="rounded-lg p-1.5 hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={14} />
            </button>
            <button disabled={!canNext} onClick={() => setOffset(offset + PAGE_SIZE)} className="rounded-lg p-1.5 hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <AddGranteeModal
            permissionId={permissionId}
            organization={organization}
            appName={appName}
            existing={new Set(grantees.map((g) => `${g.subjectType}:${g.subjectId}`))}
            onClose={() => setShowAdd(false)}
            onAdded={() => {
              setShowAdd(false);
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

function GranteeTypeBadge({ type }: { type: BizPermissionGranteeSubjectType }) {
  const { t } = useTranslation();
  const map: Record<BizPermissionGranteeSubjectType, { cls: string; label: string }> = {
    user: { cls: "bg-info/10 text-info", label: t("bizPerm.grantee.subjectType.user") || "User" },
    group: { cls: "bg-emerald-500/10 text-emerald-500", label: t("bizPerm.grantee.subjectType.group") || "Group" },
    role: { cls: "bg-accent/10 text-accent", label: t("bizPerm.grantee.subjectType.role") || "Role" },
    userset: { cls: "bg-surface-2 text-text-muted", label: t("bizPerm.grantee.subjectType.userset") || "Userset" },
  };
  const conf = map[type] ?? map.userset;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${conf.cls}`}>
      {conf.label}
    </span>
  );
}

// ─── Add-grantee modal ───
type PickerTab = "user" | "group" | "role";

function AddGranteeModal({
  permissionId,
  organization,
  appName,
  existing,
  onClose,
  onAdded,
}: {
  permissionId: number;
  organization: string;
  appName: string;
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
  const [roles, setRoles] = useState<BizRole[]>([]);
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
    // Roles: app-scoped (this app) + org-scoped (appName=""). getBizRoles already returns both
    // when called with the current appName, per backend contract in object/biz_role.go.
    BizBackend.getBizRoles(organization, appName).then((res) => {
      if (res.status === "ok" && res.data) setRoles(res.data);
    });
  }, [organization, appName]);

  useEffect(() => { setSelected(new Set()); setSearch(""); }, [tab]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (id: string, label: string) => !q || id.toLowerCase().includes(q) || label.toLowerCase().includes(q);
    if (tab === "user") {
      return users
        .map((u) => ({ id: u.id, label: u.displayName, sub: u.email || u.id, scope: null as null | string }))
        .filter((it) => !existing.has(`user:${it.id}`))
        .filter((it) => match(it.id, it.label));
    }
    if (tab === "group") {
      return groups
        .map((g) => ({ id: g.id, label: g.displayName, sub: g.id, scope: null as null | string }))
        .filter((it) => !existing.has(`group:${it.id}`))
        .filter((it) => match(it.id, it.label));
    }
    // role: we pass the role.name as subjectId (roles are org-qualified by name within org+app pool)
    return roles
      .map((r) => ({ id: r.name, label: r.displayName || r.name, sub: r.name, scope: r.scopeKind as string }))
      .filter((it) => !existing.has(`role:${it.id}`))
      .filter((it) => match(it.id, it.label));
  }, [tab, users, groups, roles, search, existing]);

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
        BizBackend.addBizPermissionGrantee({ permissionId, subjectType: tab, subjectId }),
      ),
    );
    setSaving(false);
    const errs = results.filter((r) => r.status !== "ok");
    if (errs.length) {
      modal.toast(
        (t("bizPerm.grantee.addPartial") || "Added {ok} / {n}, {err} failed")
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
          <h3 className="text-[15px] font-semibold">{t("bizPerm.grantee.pickerTitle") || "Add grantees"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><X size={16} /></button>
        </div>

        <div className="flex border-b border-border-subtle">
          {(["user", "group", "role"] as PickerTab[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium transition-colors ${
                tab === k ? "text-accent border-b-2 border-accent -mb-px" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {k === "user" ? <UserIcon size={13} /> : k === "group" ? <UsersIcon size={13} /> : <Shield size={13} />}
              {k === "user" ? (t("bizPerm.grantee.tab.user") || "User")
                : k === "group" ? (t("bizPerm.grantee.tab.group") || "Group")
                : (t("bizPerm.grantee.tab.role") || "Role")}
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
                  {it.scope && (
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      it.scope === "org" ? "bg-purple-500/10 text-purple-500" : "bg-blue-500/10 text-blue-500"
                    }`}>
                      {it.scope === "org" ? (t("bizRole.scope.org") || "Org") : (t("bizRole.scope.app") || "App")}
                    </span>
                  )}
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
