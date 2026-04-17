import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, ChevronDown, ChevronRight, Download, Pencil, Plus, RefreshCw,
  Search, Target, Trash2, Upload, X,
} from "lucide-react";
import BizAppResourceImportWizard from "./BizAppResourceImportWizard";

import { bizKeys } from "../backend/bizQueryKeys";
import * as BizBackend from "../backend/BizBackend";
import type { BizAppResource, BizResourceMatchMode } from "../backend/BizBackend";
import { FormField, inputClass, monoInputClass } from "./FormSection";
import { useModal } from "./Modal";
import { useTranslation } from "../i18n";
import { friendlyError } from "../utils/errorHelper";

interface Props {
  owner: string;
  appName: string;
}

const MATCH_MODES: BizResourceMatchMode[] = ["keyMatch", "keyMatch2", "regex"];

export default function BizAppResourceTab({ owner, appName }: Props) {
  const { t } = useTranslation();
  const modal = useModal();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<BizAppResource | null>(null);
  const [creating, setCreating] = useState(false);
  const [showDeprecated, setShowDeprecated] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [tplMenuOpen, setTplMenuOpen] = useState(false);

  const listQuery = useQuery({
    enabled: !!owner && !!appName,
    queryKey: bizKeys.appResources(owner, appName),
    queryFn: async () => {
      const res = await BizBackend.listBizAppResources(owner, appName);
      if (res.status !== "ok" || !res.data) throw new Error(friendlyError(res.msg, t) || res.msg);
      return res.data;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: bizKeys.appResources(owner, appName) });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => BizBackend.deleteBizAppResource(id),
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

  const all = listQuery.data ?? [];
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (!showDeprecated && r.deprecated) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q)
        || (r.displayName || "").toLowerCase().includes(q)
        || (r.group || "").toLowerCase().includes(q)
        || r.pattern.toLowerCase().includes(q)
        || (r.methods || "").toLowerCase().includes(q)
      );
    });
  }, [all, search, showDeprecated]);

  const grouped = useMemo(() => {
    const map = new Map<string, BizAppResource[]>();
    for (const r of visible) {
      const g = r.group || t("bizResource.groupUngrouped") || "未分组";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible, t]);

  const toggleGroup = (g: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  };

  const isExpanded = (g: string) => !collapsedGroups.has(g);

  const onDelete = (r: BizAppResource) => {
    if (!r.id) return;
    const msg = (t("bizResource.confirmDelete") || "确定删除目录项「{name}」？此操作不影响已有权限。")
      .replace("{name}", r.displayName || r.name);
    modal.showConfirm(msg, () => deleteMutation.mutate(r.id!));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">{t("bizResource.title") || "资源目录"}</h2>
          <span className="text-[12px] text-text-muted">
            {(t("bizResource.countLabel") || "{count} 个端点").replace("{count}", String(all.length))}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-text-muted">
            <input type="checkbox" checked={showDeprecated} onChange={(e) => setShowDeprecated(e.target.checked)} className="rounded border-border" />
            {t("bizResource.showDeprecated") || "显示已废弃"}
          </label>
          <button
            onClick={() => listQuery.refetch()}
            className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors"
            title={t("common.refresh") || "Refresh"}
          >
            <RefreshCw size={14} />
          </button>
          <div className="relative">
            <button
              onClick={() => setTplMenuOpen((v) => !v)}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
            >
              <Download size={12} /> {t("bizResource.downloadTemplate") || "下载模板"} <ChevronDown size={11} />
            </button>
            {tplMenuOpen && (
              <div className="absolute right-0 mt-1 z-30 min-w-[140px] rounded-lg border border-border bg-surface-1 p-1 shadow-[var(--shadow-elevated)]">
                <TemplateDownloadLink href="/templates/app-resources.yaml" label="YAML (推荐)" onClick={() => setTplMenuOpen(false)} />
                <TemplateDownloadLink href="/templates/app-resources.csv" label="CSV" onClick={() => setTplMenuOpen(false)} />
                <TemplateDownloadLink href="/templates/app-resources.json" label="JSON" onClick={() => setTplMenuOpen(false)} />
              </div>
            )}
          </div>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
          >
            <Upload size={12} /> {t("bizResource.import") || "导入"}
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover transition-colors"
          >
            <Plus size={14} /> {t("bizResource.add") || "添加资源"}
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          className={`${inputClass} pl-9`}
          placeholder={t("bizResource.searchPlaceholder") || "搜索名称 / 路径 / 方法 / 分组"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {listQuery.isLoading ? (
        <div className="py-12 text-center text-[13px] text-text-muted">{t("common.loading") || "Loading…"}</div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Target size={32} className="mx-auto mb-2 text-text-muted/60" />
          <p className="text-[13px] text-text-primary font-medium">
            {all.length === 0
              ? (t("bizResource.emptyTitle") || "此应用还没有资源目录")
              : (t("common.noMatches") || "没有匹配的结果")}
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            {all.length === 0
              ? (t("bizResource.emptyHint") || "添加资源后,在权限编辑页可以从目录快速选择")
              : (t("bizResource.tryClearFilters") || "尝试清空搜索或切换废弃开关")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([group, items]) => {
            const expanded = isExpanded(group);
            return (
              <div key={group} className="rounded-xl border border-border bg-surface-1 overflow-hidden">
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center justify-between px-5 py-3 bg-surface-2/30 border-b border-border-subtle hover:bg-surface-2/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="text-[13px] font-semibold text-text-primary">{group}</span>
                    <span className="text-[11px] text-text-muted">({items.length})</span>
                  </div>
                </button>
                {expanded && (
                  <div className="divide-y divide-border-subtle">
                    {items.map((r) => (
                      <div key={r.id} className={`flex items-center gap-3 px-5 py-2.5 ${r.deprecated ? "bg-amber-500/5" : ""}`}>
                        <MethodBadges methods={r.methods} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-text-primary truncate">
                              {r.displayName || r.name}
                            </span>
                            {r.deprecated && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                                <AlertTriangle size={10} /> {t("bizResource.deprecated") || "已废弃"}
                              </span>
                            )}
                            <SourceBadge source={r.source} />
                          </div>
                          <div className="text-[11px] font-mono text-text-muted truncate">{r.pattern}</div>
                        </div>
                        <button
                          onClick={() => setEditing(r)}
                          className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"
                          title={t("common.edit") || "Edit"}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => onDelete(r)}
                          className="rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors"
                          title={t("common.delete") || "Delete"}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {(creating || editing) && (
          <ResourceEditorModal
            owner={owner}
            appName={appName}
            initial={editing}
            onClose={() => { setCreating(false); setEditing(null); }}
            onSaved={() => { setCreating(false); setEditing(null); invalidate(); }}
          />
        )}
        {importOpen && (
          <BizAppResourceImportWizard
            owner={owner}
            appName={appName}
            onClose={() => setImportOpen(false)}
            onDone={() => setImportOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function TemplateDownloadLink({
  href, label, variant = "menu", onClick,
}: {
  href: string;
  label: string;
  variant?: "menu" | "chip" | "chipPrimary";
  onClick?: () => void;
}) {
  const cls = variant === "menu"
    ? "flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-text-primary hover:bg-surface-2 transition-colors"
    : variant === "chipPrimary"
      ? "inline-flex items-center gap-1 rounded-lg bg-accent/10 text-accent hover:bg-accent/15 px-2.5 py-1 text-[12px] font-medium transition-colors"
      : "inline-flex items-center gap-1 rounded-lg border border-border text-text-secondary hover:bg-surface-2 px-2.5 py-1 text-[12px] font-medium transition-colors";
  return (
    <a href={href} download onClick={onClick} className={cls}>
      <Download size={12} className={variant === "menu" ? "text-text-muted" : undefined} /> {label}
    </a>
  );
}

function MethodBadges({ methods }: { methods: string }) {
  const list = (methods || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) {
    return <span className="inline-flex items-center rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-text-muted">ANY</span>;
  }
  return (
    <div className="shrink-0 flex gap-1">
      {list.slice(0, 3).map((m) => (
        <span key={m} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${methodColor(m)}`}>
          {m}
        </span>
      ))}
      {list.length > 3 && <span className="text-[10px] text-text-muted">+{list.length - 3}</span>}
    </div>
  );
}

function methodColor(m: string): string {
  switch (m) {
    case "GET": return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "POST": return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "PUT":
    case "PATCH": return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "DELETE": return "bg-red-500/10 text-red-600 dark:text-red-400";
    default: return "bg-surface-2 text-text-secondary";
  }
}

function SourceBadge({ source }: { source: string }) {
  if (!source || source === "manual") return null;
  const label = source === "openapi" ? "OpenAPI" : source === "template" ? "模板" : source === "paste" ? "粘贴" : source;
  return (
    <span className="inline-flex items-center rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
      {label}
    </span>
  );
}

function ResourceEditorModal({
  owner, appName, initial, onClose, onSaved,
}: {
  owner: string;
  appName: string;
  initial: BizAppResource | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const modal = useModal();
  const [r, setR] = useState<BizAppResource>(() =>
    initial ? { ...initial } : BizBackend.newBizAppResource(owner, appName),
  );
  const isEdit = !!initial?.id;

  const set = (k: keyof BizAppResource, v: unknown) => setR((prev) => ({ ...prev, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: () =>
      isEdit
        ? BizBackend.updateBizAppResource(initial!.id!, r)
        : BizBackend.addBizAppResource(r),
    onSuccess: (res) => {
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess") || "Saved");
        onSaved();
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    },
    onError: (err: Error) => modal.toast(err.message || t("common.error"), "error"),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 w-full max-w-2xl rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-[15px] font-semibold">
            {isEdit ? (t("bizResource.editTitle") || "编辑资源") : (t("bizResource.addTitle") || "添加资源")}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><X size={16} /></button>
        </div>

        <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4">
          <FormField label={t("field.displayName") || "显示名称"}>
            <input className={inputClass} value={r.displayName} onChange={(e) => set("displayName", e.target.value)} />
          </FormField>
          <FormField
            label={t("field.name") || "名称"}
            help={t("bizResource.name.hint") || "唯一标识,API 命名风格"}
          >
            <input className={monoInputClass} value={r.name} onChange={(e) => set("name", e.target.value)} disabled={isEdit} />
          </FormField>
          <FormField label={t("bizResource.group") || "分组"}>
            <input className={inputClass} value={r.group} onChange={(e) => set("group", e.target.value)} placeholder="订单 / 客户 / 库存" />
          </FormField>
          <FormField label={t("bizResource.methods") || "HTTP 方法"} help={t("bizResource.methodsHint") || "逗号分隔,空表示不限"}>
            <input className={monoInputClass} value={r.methods} onChange={(e) => set("methods", e.target.value)} placeholder="GET,POST" />
          </FormField>
          <FormField label={t("bizResource.pattern") || "匹配模式"} span="full" help={t("bizResource.patternHint") || "Casbin matcher 会用此字符串进行匹配"}>
            <input className={monoInputClass} value={r.pattern} onChange={(e) => set("pattern", e.target.value)} placeholder="/api/orders/:id" />
          </FormField>
          <FormField label={t("bizResource.matchMode") || "匹配算法"}>
            <select className={inputClass} value={r.matchMode} onChange={(e) => set("matchMode", e.target.value as BizResourceMatchMode)}>
              {MATCH_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </FormField>
          <FormField label={t("bizResource.deprecated") || "已废弃"}>
            <label className="inline-flex items-center gap-2 text-[13px] text-text-secondary">
              <input type="checkbox" checked={r.deprecated} onChange={(e) => set("deprecated", e.target.checked)} className="rounded border-border" />
              {t("bizResource.deprecatedHint") || "标记后仍可被引用,但会在 UI 提示"}
            </label>
          </FormField>
          <FormField label={t("field.description") || "描述"} span="full">
            <textarea className={`${inputClass} min-h-[60px] resize-y`} value={r.description} onChange={(e) => set("description", e.target.value)} />
          </FormField>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
            {t("common.cancel") || "取消"}
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saveMutation.isPending ? (t("common.saving") || "Saving…") : (t("common.save") || "保存")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
