import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Wand2, X } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as BizBackend from "../backend/BizBackend";
import type { SchemaAST } from "./bizSchemaAst";

// Four-step bulk-grant wizard. Data flow:
//   Step 1 (Subject) → Step 2 (Object) → Step 3 (Relation) → Step 4
//   (Preview) → Apply (bizWriteTuples one-shot).
//
// Subject modes: single / userset (e.g. team:eng#member) / wildcard.
// Object modes: single / multi (newline-delimited) / prefix (resolved
// by scanning existing tuples at apply-time).
// Relation: selected from the current schema's object type.

interface Props {
  open: boolean;
  appId: string;
  ast: SchemaAST;
  onCancel: () => void;
  onApply: (written: number) => void;
}

type SubjectMode = "single" | "userset" | "wildcard";
type ObjectMode = "single" | "multi" | "prefix";

export default function BizTupleBulkGrantWizard({
  open,
  appId,
  ast,
  onCancel,
  onApply,
}: Props) {
  const { t } = useTranslation();
  const modal = useModal();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [subjMode, setSubjMode] = useState<SubjectMode>("single");
  const [subjValue, setSubjValue] = useState("");
  const [objMode, setObjMode] = useState<ObjectMode>("single");
  const [objValue, setObjValue] = useState("");
  const [relation, setRelation] = useState("");
  const [applying, setApplying] = useState(false);

  const objectTypeOfObj = objValue.split(":")[0] ?? "";
  const relationOptions = useMemo(() => {
    const td = ast.types.find((tp) => tp.name === objectTypeOfObj);
    return td?.relations.map((r) => r.name) ?? [];
  }, [ast, objectTypeOfObj]);

  const previewTuples = useMemo(() => {
    if (step < 4) return [];
    const userStr = subjValue.trim();
    let objectStrs: string[] = [];
    if (objMode === "single") {
      if (objValue.trim()) objectStrs = [objValue.trim()];
    } else if (objMode === "multi") {
      objectStrs = objValue
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (objMode === "prefix") {
      // Prefix mode resolves at apply-time via a backend scan; we
      // don't preview (would require a round-trip just for a preview).
      objectStrs = [];
    }
    return objectStrs.map((o) => ({ object: o, relation, user: userStr }));
  }, [step, subjValue, objMode, objValue, relation]);

  const canNext = (() => {
    if (step === 1) return Boolean(subjValue.trim());
    if (step === 2) return Boolean(objValue.trim());
    if (step === 3) return Boolean(relation);
    return true;
  })();

  const apply = async () => {
    setApplying(true);
    try {
      let writes = previewTuples;
      if (objMode === "prefix") {
        const prefix = objValue.trim();
        // readBizTuples takes a filter; for prefix we read all then
        // filter client-side. Admin-scale stores are small enough.
        const res = await BizBackend.readBizTuples(appId, {});
        if (res.status !== "ok" || !Array.isArray(res.data)) {
          modal.toast(res.msg || t("rebac.common.error"), "error");
          return;
        }
        const objSet = new Set<string>();
        for (const tuple of res.data) {
          if (tuple.object.startsWith(prefix)) objSet.add(tuple.object);
        }
        writes = Array.from(objSet).map((o) => ({
          object: o,
          relation,
          user: subjValue.trim(),
        }));
      }
      if (writes.length === 0) {
        modal.toast(t("rebac.wizard.nothingToWrite"), "error");
        return;
      }
      const res = await BizBackend.writeBizTuples({ appId, writes });
      if (res.status !== "ok") {
        modal.toast(res.msg || t("rebac.common.error"), "error");
        return;
      }
      onApply(res.data?.written ?? writes.length);
    } catch (err) {
      modal.toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setApplying(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("rebac.wizard.title")}
    >
      <div className="w-full max-w-2xl rounded-xl bg-surface-1 border border-border shadow-xl flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-accent-primary" aria-hidden />
            <h2 className="text-[14px] font-semibold text-text-primary">
              {t("rebac.wizard.title")} · {t("rebac.wizard.stepLabel")} {step} / 4
            </h2>
          </div>
          <button
            type="button"
            aria-label={t("rebac.common.cancel")}
            className="text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 rounded"
            onClick={onCancel}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-4 flex flex-col gap-3 min-h-[280px]">
          {step === 1 && (
            <>
              <p className="text-[12px] text-text-muted">
                {t("rebac.wizard.step1Hint")}
              </p>
              <RadioRow label={t("rebac.wizard.subjSingle")} value="single" current={subjMode} onChange={setSubjMode} />
              <RadioRow label={t("rebac.wizard.subjUserset")} value="userset" current={subjMode} onChange={setSubjMode} />
              <RadioRow label={t("rebac.wizard.subjWildcard")} value="wildcard" current={subjMode} onChange={setSubjMode} />
              <label className="flex flex-col gap-1 mt-1">
                <span className="text-[11px] text-text-muted font-medium">
                  {t("rebac.wizard.subjValue")}
                </span>
                <input
                  aria-label={t("rebac.wizard.subjValue")}
                  className="px-2 py-1 rounded border border-border bg-surface-1 text-[13px] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
                  value={subjValue}
                  onChange={(e) => setSubjValue(e.target.value)}
                  placeholder={
                    subjMode === "single"
                      ? "user:alice"
                      : subjMode === "userset"
                        ? "team:eng#member"
                        : "user:*"
                  }
                />
              </label>
            </>
          )}
          {step === 2 && (
            <>
              <p className="text-[12px] text-text-muted">
                {t("rebac.wizard.step2Hint")}
              </p>
              <RadioRow label={t("rebac.wizard.objSingle")} value="single" current={objMode} onChange={setObjMode} />
              <RadioRow label={t("rebac.wizard.objMulti")} value="multi" current={objMode} onChange={setObjMode} />
              <RadioRow label={t("rebac.wizard.objPrefix")} value="prefix" current={objMode} onChange={setObjMode} />
              <label className="flex flex-col gap-1 mt-1">
                <span className="text-[11px] text-text-muted font-medium">
                  {t("rebac.wizard.objValue")}
                </span>
                {objMode === "multi" ? (
                  <textarea
                    aria-label={t("rebac.wizard.objValue")}
                    className="px-2 py-1 rounded border border-border bg-surface-1 text-[12px] font-mono min-h-[120px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
                    value={objValue}
                    onChange={(e) => setObjValue(e.target.value)}
                    placeholder={"document:d1\ndocument:d2\ndocument:d3"}
                  />
                ) : (
                  <input
                    aria-label={t("rebac.wizard.objValue")}
                    className="px-2 py-1 rounded border border-border bg-surface-1 text-[13px] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
                    value={objValue}
                    onChange={(e) => setObjValue(e.target.value)}
                    placeholder={
                      objMode === "single" ? "document:d1" : "document:folder_legal_"
                    }
                  />
                )}
              </label>
            </>
          )}
          {step === 3 && (
            <>
              <p className="text-[12px] text-text-muted">
                {t("rebac.wizard.step3Hint")}
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-text-muted font-medium">
                  {t("rebac.browser.relation")}
                </span>
                <select
                  aria-label={t("rebac.browser.relation")}
                  className="px-2 py-1 rounded border border-border bg-surface-1 text-[13px] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                >
                  <option value="">--</option>
                  {relationOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {relationOptions.length === 0 && (
                  <span className="text-[11px] text-warning">
                    {t("rebac.wizard.noRelationsForType", {
                      type: objectTypeOfObj || "?",
                    })}
                  </span>
                )}
              </label>
            </>
          )}
          {step === 4 && (
            <>
              <p className="text-[12px] text-text-muted">
                {objMode === "prefix"
                  ? t("rebac.wizard.previewPrefix")
                  : `${previewTuples.length} ${t("rebac.wizard.tuplesToWrite")}`}
              </p>
              {objMode !== "prefix" && (
                <ul className="rounded border border-border bg-surface-2 text-[12px] font-mono max-h-[200px] overflow-auto">
                  {previewTuples.map((p, i) => (
                    <li key={i} className="px-2 py-0.5">
                      {p.object} # {p.relation} @ {p.user}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-between px-4 py-3 border-t border-border">
          <button
            type="button"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] border border-border hover:bg-surface-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            onClick={() =>
              setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))
            }
            disabled={step === 1}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("rebac.wizard.back")}
          </button>
          {step < 4 ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-accent-primary text-white hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
              disabled={!canNext}
              onClick={() => setStep((s) => ((s + 1) as 1 | 2 | 3 | 4))}
            >
              {t("rebac.wizard.next")}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-accent-primary text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
              disabled={applying}
              onClick={() => void apply()}
            >
              {applying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5" />
              )}
              {t("rebac.wizard.apply")}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function RadioRow<T extends string>({
  label,
  value,
  current,
  onChange,
}: {
  label: string;
  value: T;
  current: T;
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] cursor-pointer">
      <input
        type="radio"
        aria-label={label}
        checked={current === value}
        onChange={() => onChange(value)}
      />
      {label}
    </label>
  );
}
