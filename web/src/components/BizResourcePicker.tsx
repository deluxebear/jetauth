import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, Check, Search, X } from "lucide-react";

import { bizKeys } from "../backend/bizQueryKeys";
import * as BizBackend from "../backend/BizBackend";
import type { BizAppResource } from "../backend/BizBackend";
import { inputClass } from "./FormSection";
import { useTranslation } from "../i18n";
import { friendlyError } from "../utils/errorHelper";

export type PickedResource = {
  resource: BizAppResource;
  methods: string[];
};

type Props = {
  owner: string;
  appName: string;
  excludePatterns: string[];
  onClose: () => void;
  onConfirm: (picks: PickedResource[], autoAddMethods: boolean) => void;
};

export default function BizResourcePicker({ owner, appName, excludePatterns, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<number, Set<string>>>(new Map());
  const [autoAddMethods, setAutoAddMethods] = useState(true);

  const listQuery = useQuery({
    queryKey: bizKeys.appResources(owner, appName),
    queryFn: async () => {
      const res = await BizBackend.listBizAppResources(owner, appName);
      if (res.status !== "ok" || !res.data) throw new Error(friendlyError(res.msg, t) || res.msg);
      return res.data;
    },
  });

  const all = listQuery.data ?? [];
  const excluded = useMemo(() => new Set(excludePatterns), [excludePatterns]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (excluded.has(r.pattern)) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q)
        || (r.displayName || "").toLowerCase().includes(q)
        || (r.group || "").toLowerCase().includes(q)
        || r.pattern.toLowerCase().includes(q)
        || (r.methods || "").toLowerCase().includes(q)
      );
    });
  }, [all, search, excluded]);

  const grouped = useMemo(() => {
    const map = new Map<string, BizAppResource[]>();
    for (const r of visible) {
      const g = r.group || t("bizResource.groupUngrouped") || "未分组";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible, t]);

  const toggle = (r: BizAppResource) => {
    if (!r.id) return;
    const id = r.id;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        const methods = (r.methods || "").split(",").map((s) => s.trim()).filter(Boolean);
        next.set(id, new Set(methods));
      }
      return next;
    });
  };

  const submit = () => {
    const picks: PickedResource[] = [];
    for (const r of all) {
      if (!r.id) continue;
      const methods = selected.get(r.id);
      if (methods) picks.push({ resource: r, methods: Array.from(methods) });
    }
    onConfirm(picks, autoAddMethods);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 w-full max-w-2xl rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)] max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-[15px] font-semibold">{t("bizPerm.resource.pickerTitle") || "从目录选择资源"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><X size={16} /></button>
        </div>

        <div className="px-5 py-3 border-b border-border-subtle">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              className={`${inputClass} pl-9`}
              placeholder={t("bizResource.searchPlaceholder") || "搜索..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listQuery.isLoading ? (
            <div className="py-12 text-center text-[13px] text-text-muted">{t("common.loading") || "Loading…"}</div>
          ) : all.length === 0 ? (
            <div className="py-12 text-center">
              <AlertTriangle size={22} className="mx-auto mb-2 text-text-muted/60" />
              <p className="text-[13px] text-text-primary">{t("bizPerm.resource.noCatalog") || "此应用尚未建立资源目录"}</p>
              <p className="mt-1 text-[12px] text-text-muted">{t("bizPerm.resource.noCatalogHint") || "前往「资源目录」Tab 添加端点,或手动输入模式"}</p>
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-text-muted">{t("common.noMatches") || "没有匹配的结果"}</div>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group}>
                <div className="sticky top-0 z-10 px-5 py-1.5 bg-surface-2/80 backdrop-blur-sm text-[11px] font-semibold text-text-muted uppercase tracking-wider border-b border-border-subtle">
                  {group}
                </div>
                {items.map((r) => {
                  const checked = selected.has(r.id!);
                  const methods = (r.methods || "").split(",").map((s) => s.trim()).filter(Boolean);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggle(r)}
                      className={`w-full flex items-center gap-3 px-5 py-2.5 text-left border-b border-border-subtle transition-colors ${checked ? "bg-accent/5" : "hover:bg-surface-2"} ${r.deprecated ? "bg-amber-500/5" : ""}`}
                    >
                      <span className={`shrink-0 flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-accent bg-accent text-white" : "border-border"}`}>
                        {checked && <Check size={12} />}
                      </span>
                      <div className="shrink-0 flex gap-1 w-[76px]">
                        {methods.slice(0, 2).map((m) => (
                          <span key={m} className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-surface-2">
                            {m}
                          </span>
                        ))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-text-primary truncate">{r.displayName || r.name}</span>
                          {r.deprecated && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                              <AlertTriangle size={10} /> {t("bizResource.deprecated") || "已废弃"}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-text-muted truncate">{r.pattern}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
          <label className="flex items-center gap-1.5 text-[12px] text-text-secondary">
            <input type="checkbox" checked={autoAddMethods} onChange={(e) => setAutoAddMethods(e.target.checked)} className="rounded border-border" />
            {t("bizPerm.resource.autoAddMethods") || "自动把方法加入动作列表"}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-text-muted">
              {(t("bizPerm.perms.selectedN") || "已选 {n} 项").replace("{n}", String(selected.size))}
            </span>
            <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              {t("common.cancel") || "取消"}
            </button>
            <button
              onClick={submit}
              disabled={selected.size === 0}
              className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {(t("bizPerm.resource.addN") || "添加 ({n})").replace("{n}", String(selected.size))}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
