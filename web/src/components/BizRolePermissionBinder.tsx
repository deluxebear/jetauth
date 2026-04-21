import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Key, Plus, Search, ShieldCheck, ShieldX, X } from "lucide-react";

import { bizKeys } from "../backend/bizQueryKeys";
import * as BizBackend from "../backend/BizBackend";
import type { BizPermission, BizRole } from "../backend/BizBackend";
import { inputClass } from "./FormSection";
import { useModal } from "./Modal";
import { useTranslation } from "../i18n";
import { friendlyError } from "../utils/errorHelper";

interface Props {
  role: BizRole;
}

export default function BizRolePermissionBinder({ role }: Props) {
  const { t } = useTranslation();
  const modal = useModal();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const grantedQuery = useQuery({
    enabled: !!role.id && !!role.organization && !!role.name,
    queryKey: bizKeys.rolePermissions(role.organization, role.name),
    queryFn: async () => {
      const res = await BizBackend.listPermissionsByRole(role.organization, role.name);
      if (res.status !== "ok" || !res.data) throw new Error(friendlyError(res.msg, t) || res.msg);
      return res.data;
    },
  });

  // All app permissions — loaded only when the picker opens so the role page
  // doesn't pay the full-list query on every mount.
  const allPermsQuery = useQuery({
    enabled: showAdd && !!role.organization && !!role.appName,
    queryKey: bizKeys.permissions(role.organization, role.appName),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await BizBackend.getBizPermissions(role.organization, role.appName);
      if (res.status !== "ok" || !res.data) throw new Error(friendlyError(res.msg, t) || res.msg);
      return res.data;
    },
  });

  useEffect(() => {
    if (grantedQuery.error) modal.toast((grantedQuery.error as Error).message, "error");
  }, [grantedQuery.error, modal]);

  const granted = grantedQuery.data ?? [];
  const grantedIds = useMemo(
    () => new Set(granted.map((p) => p.id).filter((id): id is number => typeof id === "number")),
    [granted],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: bizKeys.rolePermissions(role.organization, role.name) });
    queryClient.invalidateQueries({ queryKey: bizKeys.permissions(role.organization, role.appName) });
    if (role.id) queryClient.invalidateQueries({ queryKey: bizKeys.roleStats(role.id) });
  };

  const bindMutation = useMutation({
    mutationFn: (permissionId: number) =>
      BizBackend.addBizPermissionGrantee({
        permissionId,
        subjectType: "role",
        subjectId: role.name,
      }),
  });

  const removeMutation = useMutation({
    mutationFn: (permissionId: number) =>
      BizBackend.removeBizPermissionGrantee({
        permissionId,
        subjectType: "role",
        subjectId: role.name,
      }),
    onSuccess: (res) => {
      if (res.status === "ok") {
        modal.toast(t("common.deleteSuccess") || "Removed", "success");
        invalidate();
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    },
    onError: (err: Error) => modal.toast(err.message || t("common.error"), "error"),
  });

  const removePerm = (p: BizPermission) => {
    if (!p.id) return;
    const msg = (t("bizRole.perms.confirmRemove") || "Remove permission {name}?")
      .replace("{name}", p.displayName || p.name);
    modal.showConfirm(msg, () => { removeMutation.mutate(p.id!); });
  };

  const bindMany = async (ids: number[]) => {
    const settled = await Promise.allSettled(ids.map((id) => bindMutation.mutateAsync(id)));
    let ok = 0;
    let err = 0;
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value.status === "ok") ok++;
      else err++;
    }
    invalidate();
    if (ok > 0 && err === 0) {
      modal.toast((t("bizRole.perms.addedN") || "Granted {n} permissions").replace("{n}", String(ok)));
    } else if (ok > 0 && err > 0) {
      modal.toast(
        (t("bizRole.perms.addedPartial") || "Granted {ok} / {n}, {err} failed")
          .replace("{ok}", String(ok)).replace("{n}", String(ok + err)).replace("{err}", String(err)),
        "error",
      );
    } else if (err > 0) {
      modal.toast(t("common.saveFailed") || "Save failed", "error");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-visible">
      <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-text-primary">
          {t("bizRole.grantedPerms.title") || "Permissions granted to this role"}
          <span className="ml-2 text-text-muted font-normal">({granted.length})</span>
        </h3>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
        >
          <Plus size={14} /> {t("bizRole.perms.bind") || "Bind permission"}
        </button>
      </div>

      <div className="p-4">
        {grantedQuery.isLoading ? (
          <div className="py-6 text-center text-[12px] text-text-muted">{t("common.loading") || "Loading…"}</div>
        ) : granted.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-text-muted">
            <ShieldX size={28} className="mx-auto mb-2 text-text-muted/50" />
            <p>{t("bizRole.grantedPerms.empty") || "This role is not referenced by any permission"}</p>
            <p className="mt-2 text-[11px]">
              {t("bizRole.perms.emptyBindHint") || "Click 「Bind permission」 to grant permissions to this role"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {granted.map((p) => (
              <div key={p.id ?? p.name} className="py-2.5 flex items-start gap-2.5">
                <EffectBadge effect={p.effect} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium font-mono truncate">{p.displayName || p.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {(p.resources ?? []).map((r, i) => (
                      <span key={`r-${i}`} className="inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-text-secondary">{r}</span>
                    ))}
                    {(p.actions ?? []).map((a, i) => (
                      <span key={`a-${i}`} className="inline-block rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent">{a}</span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => removePerm(p)}
                  className="shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors"
                  title={t("common.delete") || "Remove"}
                  aria-label={t("common.delete") || "Remove"}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showAdd && (
          <PickerModal
            candidates={(allPermsQuery.data ?? []).filter((p) => p.id && !grantedIds.has(p.id))}
            loading={allPermsQuery.isLoading}
            onClose={() => setShowAdd(false)}
            onPick={async (ids) => {
              if (ids.length > 0) await bindMany(ids);
              setShowAdd(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function EffectBadge({ effect }: { effect: "Allow" | "Deny" }) {
  return (
    <span className={`mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
      effect === "Allow" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"
    }`}>
      {effect === "Allow" ? <ShieldCheck size={10} /> : <ShieldX size={10} />}
      {effect}
    </span>
  );
}

function PickerModal({
  candidates, loading, onClose, onPick,
}: {
  candidates: BizPermission[];
  loading: boolean;
  onClose: () => void;
  onPick: (ids: number[]) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((p) =>
      p.name.toLowerCase().includes(q)
      || (p.displayName || "").toLowerCase().includes(q)
      || (p.resources || []).some((r) => r.toLowerCase().includes(q))
      || (p.actions || []).some((a) => a.toLowerCase().includes(q)),
    );
  }, [candidates, search]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) { onClose(); return; }
    setSubmitting(true);
    try { await onPick(Array.from(selected)); } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-[15px] font-semibold">{t("bizRole.perms.pickerTitle") || "Bind permissions"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><X size={16} /></button>
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
        <div className="max-h-[360px] overflow-y-auto divide-y divide-border-subtle">
          {loading ? (
            <div className="py-10 text-center text-[13px] text-text-muted">{t("common.loading") || "Loading…"}</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-text-muted">
              {candidates.length === 0
                ? (t("bizRole.perms.noCandidates") || "No available permissions to bind")
                : (t("common.noData") || "No matches")}
            </div>
          ) : (
            filtered.map((p) => {
              const id = p.id!;
              const checked = selected.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors ${checked ? "bg-accent/5" : "hover:bg-surface-2"}`}
                >
                  <span className={`shrink-0 flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-accent bg-accent text-white" : "border-border"}`}>
                    {checked && <Check size={12} />}
                  </span>
                  <Key size={14} className="text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium font-mono truncate">{p.displayName || p.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {(p.resources ?? []).slice(0, 3).map((r, i) => (
                        <span key={`r-${i}`} className="inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-text-secondary">{r}</span>
                      ))}
                      {(p.actions ?? []).slice(0, 3).map((a, i) => (
                        <span key={`a-${i}`} className="inline-block rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent">{a}</span>
                      ))}
                    </div>
                  </div>
                  <EffectBadge effect={p.effect} />
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-[12px] text-text-muted">
            {(t("bizRole.perms.selectedN") || "{n} selected").replace("{n}", String(selected.size))}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
            >
              {t("common.cancel") || "Cancel"}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={selected.size === 0 || submitting}
              className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {submitting
                ? (t("common.saving") || "Saving…")
                : (t("bizRole.perms.bindN") || "Bind").concat(selected.size > 0 ? ` (${selected.size})` : "")}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
