import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Plus, Search, Shield, X } from "lucide-react";
import { inputClass } from "./FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as BizBackend from "../backend/BizBackend";
import type { BizRole } from "../backend/BizBackend";
import { friendlyError } from "../utils/errorHelper";

interface Props {
  /** The child role whose parents we are editing. */
  roleId: number;
  /** Used to query candidate parents within the same org. */
  organization: string;
  /** Full role catalog for the app (used to find candidates). */
  candidatePool: BizRole[];
  /** Fired after an inheritance edge was added or removed. */
  onChanged?: () => void;
}

export default function BizRoleInheritancePicker({ roleId, organization: _organization, candidatePool, onChanged }: Props) {
  const { t } = useTranslation();
  const modal = useModal();
  const [parents, setParents] = useState<BizRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    if (!roleId) return;
    setLoading(true);
    BizBackend.listRoleParents(roleId)
      .then((res) => {
        if (res.status === "ok" && res.data) setParents(res.data);
      })
      .finally(() => setLoading(false));
  }, [roleId]);

  useEffect(() => { load(); }, [load]);

  const parentIds = useMemo(() => new Set(parents.map((p) => p.id!)), [parents]);

  const addParent = async (parent: BizRole) => {
    if (!parent.id || !roleId || parent.id === roleId) return;
    const res = await BizBackend.addBizRoleInheritance(parent.id, roleId);
    if (res.status === "ok") {
      modal.toast(t("common.saveSuccess") || "Added", "success");
      load();
      onChanged?.();
    } else {
      // Cycle detection lives server-side; its error message surfaces here.
      modal.toast(friendlyError(res.msg, t) || res.msg, "error");
    }
  };

  const removeParent = (parent: BizRole) => {
    if (!parent.id || !roleId) return;
    const msg = (t("bizRole.inheritance.confirmRemove") || "Remove inheritance from {name}?")
      .replace("{name}", parent.displayName || parent.name);
    modal.showConfirm(msg, async () => {
      const res = await BizBackend.removeBizRoleInheritance(parent.id!, roleId);
      if (res.status === "ok") {
        modal.toast(t("common.deleteSuccess") || "Removed", "success");
        load();
        onChanged?.();
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    });
  };

  // Candidates: same org (already ensured by candidatePool being app-scoped), not self, not already a parent.
  // The server also rejects cycles; we leave that check to the backend to avoid duplicating graph logic here.
  const candidates = useMemo(() => {
    return candidatePool.filter((r) => r.id && r.id !== roleId && !parentIds.has(r.id));
  }, [candidatePool, roleId, parentIds]);

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-visible">
      <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-text-primary">
          {t("bizRole.inheritance.title") || "Inherits from"}
          <span className="ml-2 text-text-muted font-normal">({parents.length})</span>
        </h3>
        <button
          onClick={() => setShowAdd(true)}
          disabled={candidates.length === 0}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 disabled:opacity-50 transition-colors"
        >
          <Plus size={14} /> {t("bizRole.inheritance.add") || "Add parent"}
        </button>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="py-6 text-center text-[12px] text-text-muted">{t("common.loading") || "Loading…"}</div>
        ) : parents.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-text-muted">
            <Shield size={22} className="mx-auto mb-2 text-text-muted/50" />
            {t("bizRole.inheritance.empty") || "No parent roles."}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {parents.map((p) => (
              <span
                key={p.id}
                className="group inline-flex items-center gap-1.5 rounded-full bg-surface-2 border border-border px-3 py-1.5 text-[13px] font-medium"
              >
                <Shield size={14} className="text-text-muted" />
                <span className="font-mono">{p.name}</span>
                {p.displayName && <span className="text-text-muted text-[11px]">({p.displayName})</span>}
                <ScopeBadge scopeKind={p.scopeKind} />
                <button
                  onClick={() => removeParent(p)}
                  className="text-text-muted hover:text-danger transition-colors ml-1"
                  title={t("common.delete") || "Remove"}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showAdd && (
          <PickerModal
            candidates={candidates}
            onClose={() => setShowAdd(false)}
            onPick={async (r) => {
              await addParent(r);
              setShowAdd(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ScopeBadge({ scopeKind }: { scopeKind: string }) {
  const { t } = useTranslation();
  const label = scopeKind === "org"
    ? (t("bizRole.scope.org") || "Org")
    : (t("bizRole.scope.app") || "App");
  const cls = scopeKind === "org"
    ? "bg-purple-500/10 text-purple-500"
    : "bg-blue-500/10 text-blue-500";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function PickerModal({
  candidates,
  onClose,
  onPick,
}: {
  candidates: BizRole[];
  onClose: () => void;
  onPick: (r: BizRole) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((r) =>
      r.name.toLowerCase().includes(q)
      || (r.displayName || "").toLowerCase().includes(q),
    );
  }, [candidates, search]);

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
          <h3 className="text-[15px] font-semibold">{t("bizRole.inheritance.pickerTitle") || "Select parent role"}</h3>
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
        <div className="max-h-[320px] overflow-y-auto divide-y divide-border-subtle">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-text-muted">{t("common.noData") || "No candidates"}</div>
          ) : (
            filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => onPick(r)}
                className="w-full flex items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-2 transition-colors"
              >
                <Shield size={16} className="text-text-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium font-mono truncate">{r.name}</div>
                  <div className="text-[11px] text-text-muted truncate">{r.displayName || "\u2014"}</div>
                </div>
                <ScopeBadge scopeKind={r.scopeKind} />
                <Check size={14} className="text-text-muted opacity-0 group-hover:opacity-100" />
              </button>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}
