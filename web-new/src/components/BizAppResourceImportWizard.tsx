import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle, ArrowLeft, Check, FileCode2, FileSpreadsheet,
  FileText, Upload, X,
} from "lucide-react";

import { TemplateDownloadLink } from "./BizAppResourceTab";

import { bizKeys } from "../backend/bizQueryKeys";
import * as BizBackend from "../backend/BizBackend";
import type {
  BizResourceImportFormat, BizResourceImportOptions, BizResourceImportPathParamMode,
  BizResourceImportPreview, BizResourceImportRow,
} from "../backend/BizBackend";
import { inputClass, monoInputClass } from "./FormSection";
import { useModal } from "./Modal";
import { useTranslation } from "../i18n";
import { friendlyError } from "../utils/errorHelper";

type Step = "source" | "preview";

interface Props {
  owner: string;
  appName: string;
  onClose: () => void;
  onDone: () => void;
}

type SourceKind = "openapi" | "template" | "paste";

const DEFAULT_OPTIONS: BizResourceImportOptions = {
  pathParamMode: "colon",
  defaultMatchMode: "keyMatch2",
  defaultGroup: "",
  fullReplace: false,
};

export default function BizAppResourceImportWizard({ owner, appName, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const modal = useModal();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("source");
  const [sourceKind, setSourceKind] = useState<SourceKind>("template");
  const [format, setFormat] = useState<BizResourceImportFormat>("yaml");
  const [content, setContent] = useState("");
  const [options, setOptions] = useState<BizResourceImportOptions>(DEFAULT_OPTIONS);
  const [preview, setPreview] = useState<BizResourceImportPreview | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  const parseMutation = useMutation({
    mutationFn: () => BizBackend.parseBizResourceImport({
      owner, appName,
      format,
      content,
      options,
    }),
    onSuccess: (res) => {
      if (res.status === "ok" && res.data) {
        setPreview(res.data);
        setExcluded(new Set());
        setStep("preview");
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    },
    onError: (err: Error) => modal.toast(err.message || t("common.error"), "error"),
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      const rows = (preview?.rows ?? []).filter((r, i) => {
        if (r.kind === "error") return false;
        if (excluded.has(i)) return false;
        return true;
      });
      return BizBackend.importBizAppResources(owner, appName, rows);
    },
    onSuccess: (res) => {
      if (res.status === "ok" && res.data) {
        const d = res.data;
        const msg = (t("bizResource.import.doneToast")
          || "新增 {added} / 更新 {updated} / 废弃 {deprecated} / 失败 {failed}")
          .replace("{added}", String(d.added))
          .replace("{updated}", String(d.updated))
          .replace("{deprecated}", String(d.deprecated))
          .replace("{failed}", String(d.failed));
        modal.toast(msg, d.failed > 0 ? "error" : "success");
        queryClient.invalidateQueries({ queryKey: bizKeys.appResources(owner, appName) });
        onDone();
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    },
    onError: (err: Error) => modal.toast(err.message || t("common.error"), "error"),
  });

  const handleFilePicked = async (file: File) => {
    const text = await file.text();
    setContent(text);
    if (sourceKind === "openapi") {
      setFormat("openapi");
    } else {
      // Detect by extension for template.
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".yaml") || lower.endsWith(".yml")) setFormat("yaml");
      else if (lower.endsWith(".json")) setFormat("json");
      else if (lower.endsWith(".csv")) setFormat("csv");
    }
  };

  const canParse = content.trim().length > 0 && !parseMutation.isPending;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 w-full max-w-3xl rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)] max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            {step === "preview" && (
              <button onClick={() => setStep("source")} className="rounded-lg p-1 text-text-muted hover:bg-surface-2 transition-colors">
                <ArrowLeft size={16} />
              </button>
            )}
            <h3 className="text-[15px] font-semibold">
              {step === "source"
                ? (t("bizResource.import.title") || "导入资源目录")
                : (t("bizResource.import.previewTitle") || "预览 & 确认")}
            </h3>
            <StepIndicator step={step} />
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><X size={16} /></button>
        </div>

        {step === "source" ? (
          <SourceStep
            sourceKind={sourceKind}
            setSourceKind={setSourceKind}
            format={format}
            setFormat={setFormat}
            content={content}
            setContent={setContent}
            options={options}
            setOptions={setOptions}
            onFilePicked={handleFilePicked}
          />
        ) : (
          <PreviewStep
            preview={preview}
            excluded={excluded}
            setExcluded={setExcluded}
          />
        )}

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
          <div className="text-[12px] text-text-muted">
            {step === "source" && content.trim().length === 0 && (t("bizResource.import.needContent") || "粘贴内容或选择文件后继续")}
            {step === "preview" && preview && (
              <>
                <span className="text-accent font-medium">{t("bizResource.import.new") || "新增"} {preview.newCount}</span>
                {" · "}
                <span>{t("bizResource.import.update") || "更新"} {preview.updateCount}</span>
                {" · "}
                <span>{t("bizResource.import.deprecated") || "废弃"} {preview.deprecatedCount}</span>
                {preview.errorCount > 0 && (
                  <>
                    {" · "}
                    <span className="text-danger">{t("bizResource.import.errors") || "错误"} {preview.errorCount}</span>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              {t("common.cancel") || "取消"}
            </button>
            {step === "source" ? (
              <button
                onClick={() => parseMutation.mutate()}
                disabled={!canParse}
                className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {parseMutation.isPending ? (t("common.parsing") || "解析中…") : (t("bizResource.import.parse") || "解析 & 预览")}
              </button>
            ) : (
              <button
                onClick={() => applyMutation.mutate()}
                disabled={!preview || applyMutation.isPending || (preview.newCount + preview.updateCount + preview.deprecatedCount - excluded.size) <= 0}
                className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {applyMutation.isPending ? (t("common.saving") || "Saving…") : (t("bizResource.import.apply") || "应用导入")}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const idx = step === "source" ? 1 : 2;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted">
      {idx} / 2
    </span>
  );
}

// ── Step 1: source picker ─────────────────────────────────────────────

function SourceStep({
  sourceKind, setSourceKind, format, setFormat, content, setContent,
  options, setOptions, onFilePicked,
}: {
  sourceKind: SourceKind;
  setSourceKind: (v: SourceKind) => void;
  format: BizResourceImportFormat;
  setFormat: (v: BizResourceImportFormat) => void;
  content: string;
  setContent: (v: string) => void;
  options: BizResourceImportOptions;
  setOptions: (v: BizResourceImportOptions) => void;
  onFilePicked: (f: File) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <SourceCard
          active={sourceKind === "openapi"}
          icon={<FileCode2 size={18} />}
          title={t("bizResource.import.src.openapi") || "OpenAPI"}
          hint={t("bizResource.import.src.openapiHint") || "JSON 或 YAML 规范"}
          onSelect={() => { setSourceKind("openapi"); setFormat("openapi"); }}
        />
        <SourceCard
          active={sourceKind === "template"}
          icon={<FileSpreadsheet size={18} />}
          title={t("bizResource.import.src.template") || "标准模板"}
          hint={t("bizResource.import.src.templateHint") || "CSV / YAML / JSON"}
          onSelect={() => { setSourceKind("template"); setFormat("yaml"); }}
        />
        <SourceCard
          active={sourceKind === "paste"}
          icon={<FileText size={18} />}
          title={t("bizResource.import.src.paste") || "粘贴"}
          hint={t("bizResource.import.src.pasteHint") || "行列 / cURL"}
          onSelect={() => { setSourceKind("paste"); setFormat("paste"); }}
        />
      </div>

      {sourceKind === "template" && (
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-[12px] text-text-muted">{t("bizResource.import.downloadTpl") || "下载模板："}</span>
          <TemplateDownloadLink href="/templates/app-resources.yaml" label="YAML" variant="chipPrimary" />
          <TemplateDownloadLink href="/templates/app-resources.csv" label="CSV" variant="chip" />
          <TemplateDownloadLink href="/templates/app-resources.json" label="JSON" variant="chip" />
          <span className="text-[11px] text-text-muted">
            {t("bizResource.import.tplFormat") || "格式："}
          </span>
          <select
            className="rounded-lg border border-border bg-surface-1 px-2 py-1 text-[12px]"
            value={format}
            onChange={(e) => setFormat(e.target.value as BizResourceImportFormat)}
          >
            <option value="yaml">YAML</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </div>
      )}

      {/* File upload + paste area */}
      <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
        <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-secondary cursor-pointer hover:bg-surface-3 transition-colors w-fit">
          <Upload size={14} />
          {t("bizResource.import.chooseFile") || "选择文件"}
          <input
            type="file"
            className="hidden"
            accept={sourceKind === "openapi" ? ".json,.yaml,.yml" : sourceKind === "template" ? ".csv,.yaml,.yml,.json" : ".txt,.csv,.yaml,.yml,.json"}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFilePicked(f);
            }}
          />
        </label>
        <textarea
          className={`${monoInputClass} min-h-[180px] font-mono text-[12px]`}
          placeholder={sourceKind === "openapi"
            ? (t("bizResource.import.placeholderOpenapi") || "粘贴 OpenAPI JSON / YAML...")
            : sourceKind === "template"
              ? (t("bizResource.import.placeholderTpl") || "上传模板文件,或在此粘贴内容...")
              : (t("bizResource.import.placeholderPaste") || "每行一个端点:\nGET /api/orders  订单列表\nPOST /api/orders 创建订单\n\n或粘贴 cURL:\ncurl -X GET https://api.example.com/orders/123")}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>

      {/* Options */}
      <div className="rounded-xl border border-border bg-surface-1 p-4 space-y-3">
        <h4 className="text-[13px] font-semibold">{t("bizResource.import.options") || "选项"}</h4>
        <div>
          <label className="block text-[11px] font-medium text-text-muted mb-1">
            {t("bizResource.import.pathParamMode") || "路径参数转换"}
          </label>
          <div className="flex gap-2">
            {(["colon", "star", "keep"] as BizResourceImportPathParamMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setOptions({ ...options, pathParamMode: m })}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  options.pathParamMode === m ? "bg-accent text-white" : "bg-surface-2 text-text-secondary hover:bg-surface-3"
                }`}
              >
                {m === "colon" && "{id} → :id (keyMatch2)"}
                {m === "star" && "{id} → * (keyMatch)"}
                {m === "keep" && (t("bizResource.import.pathKeep") || "保持 {id} 原样")}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-text-muted mb-1">
            {t("bizResource.import.defaultGroup") || "默认分组(可选)"}
          </label>
          <input className={inputClass} value={options.defaultGroup} onChange={(e) => setOptions({ ...options, defaultGroup: e.target.value })} />
        </div>
        {format === "openapi" && (
          <label className="flex items-start gap-2 text-[12px] text-text-secondary">
            <input
              type="checkbox"
              checked={options.fullReplace}
              onChange={(e) => setOptions({ ...options, fullReplace: e.target.checked })}
              className="mt-0.5 rounded border-border"
            />
            <span>
              {t("bizResource.import.fullReplace") || "全量替换:本次未出现的旧条目标记为已废弃"}
              <span className="block text-[11px] text-text-muted">
                {t("bizResource.import.fullReplaceHint") || "仅建议在整份 OpenAPI 导入时勾选"}
              </span>
            </span>
          </label>
        )}
      </div>
    </div>
  );
}

function SourceCard({ active, icon, title, hint, onSelect }: { active: boolean; icon: React.ReactNode; title: string; hint: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors ${
        active ? "border-accent bg-accent/5" : "border-border hover:bg-surface-2"
      }`}
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-accent/20 text-accent" : "bg-surface-2 text-text-muted"}`}>
        {icon}
      </div>
      <div>
        <div className="text-[13px] font-semibold text-text-primary">{title}</div>
        <div className="text-[11px] text-text-muted mt-0.5">{hint}</div>
      </div>
    </button>
  );
}


// ── Step 2: preview ───────────────────────────────────────────────────

function PreviewStep({
  preview, excluded, setExcluded,
}: {
  preview: BizResourceImportPreview | null;
  excluded: Set<number>;
  setExcluded: (v: Set<number>) => void;
}) {
  const { t } = useTranslation();
  const [activeKind, setActiveKind] = useState<"new" | "update" | "deprecated" | "error">("new");

  const byKind = useMemo(() => {
    const groups: Record<string, { idx: number; row: BizResourceImportRow }[]> = { new: [], update: [], deprecated: [], error: [] };
    (preview?.rows ?? []).forEach((r, idx) => {
      groups[r.kind]?.push({ idx, row: r });
    });
    return groups;
  }, [preview]);

  if (!preview) {
    return <div className="flex-1 flex items-center justify-center py-16 text-[13px] text-text-muted">{t("common.loading") || "Loading…"}</div>;
  }

  const toggle = (idx: number) => {
    const next = new Set(excluded);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setExcluded(next);
  };

  const tabs: { key: "new" | "update" | "deprecated" | "error"; label: string; count: number; tone?: string }[] = [
    { key: "new", label: t("bizResource.import.new") || "新增", count: preview.newCount },
    { key: "update", label: t("bizResource.import.update") || "更新", count: preview.updateCount },
    { key: "deprecated", label: t("bizResource.import.deprecated") || "废弃", count: preview.deprecatedCount },
    { key: "error", label: t("bizResource.import.errors") || "错误", count: preview.errorCount, tone: "danger" },
  ];

  const rows = byKind[activeKind] ?? [];

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex border-b border-border px-5">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setActiveKind(tb.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium border-b-2 transition-colors ${
              activeKind === tb.key ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text-secondary"
            }`}
          >
            {tb.label}
            <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold ${
              tb.tone === "danger" && tb.count > 0 ? "bg-danger/10 text-danger" :
              activeKind === tb.key ? "bg-accent/15 text-accent" : "bg-surface-3 text-text-muted"
            }`}>
              {tb.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-text-muted">{t("common.noData") || "没有这类条目"}</div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {rows.map(({ idx, row }) => {
              const p = row.proposed;
              const isError = row.kind === "error";
              const isChecked = !excluded.has(idx) && !isError;
              return (
                <div key={idx} className={`flex items-start gap-3 px-5 py-2.5 ${isError ? "bg-danger/5" : ""}`}>
                  {!isError && (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(idx)}
                      className="mt-1 rounded border-border"
                    />
                  )}
                  {isError && <AlertTriangle size={14} className="mt-0.5 text-danger shrink-0" />}
                  <div className="flex-1 min-w-0">
                    {isError ? (
                      <>
                        <div className="text-[13px] font-medium text-danger">
                          {p.name || (t("bizResource.import.unknownRow") || "未命名行")}
                        </div>
                        <div className="text-[12px] text-text-secondary mt-0.5">{row.error}</div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-text-primary truncate">
                            {p.displayName || p.name}
                          </span>
                          {p.group && (
                            <span className="inline-flex items-center rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                              {p.group}
                            </span>
                          )}
                          {p.methods && p.methods.split(",").slice(0, 2).map((m) => (
                            <span key={m} className="inline-flex items-center rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-accent">
                              {m.trim()}
                            </span>
                          ))}
                        </div>
                        <div className="text-[11px] font-mono text-text-muted truncate">{p.pattern}</div>
                        {row.kind === "update" && row.existing && (
                          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                            {t("bizResource.import.diffPrev") || "原:"} <span className="font-mono">{row.existing.pattern}</span>
                            {row.existing.methods && <> · {row.existing.methods}</>}
                          </div>
                        )}
                        {row.kind === "deprecated" && (
                          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle size={10} />
                            {t("bizResource.import.deprecatedHint") || "本次未出现,将标记已废弃(不删除)"}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {row.kind === "new" && <Check size={14} className="text-success shrink-0" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
