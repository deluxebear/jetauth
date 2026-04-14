import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, LogOut} from "lucide-react";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as RuleBackend from "../backend/RuleBackend";
import type { Rule, Expression } from "../backend/RuleBackend";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";
import SaveButton from "../components/SaveButton";

const TYPE_OPTIONS = [
  { id: "WAF", name: "WAF" },
  { id: "IP", name: "IP" },
  { id: "User-Agent", name: "User-Agent" },
  { id: "IP Rate Limiting", name: "IP Rate Limiting" },
  { id: "Compound", name: "Compound" },
];

const ACTION_OPTIONS = [
  { id: "Allow", name: "Allow" },
  { id: "Block", name: "Block" },
];

export default function RuleEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [rule, setRule] = useState<Rule | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Rule>({
    queryKey: "rule",
    owner,
    name,
    fetchFn: RuleBackend.getRule,
  });

  useEffect(() => {
    if (entity) setRule(entity);
  }, [entity]);

  if (loading || !rule) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setRule((prev) => {
      if (!prev) return prev;
      if (key === "type") {
        return { ...prev, type: val as string, expressions: [] };
      }
      return { ...prev, [key]: val };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await RuleBackend.updateRule(owner!, name!, rule);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setIsAddMode(false);
        invalidateList();
        if (rule.name !== name) {
          navigate(`/rules/${rule.owner}/${rule.name}`, { replace: true });
        }
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };
  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = await RuleBackend.updateRule(owner!, name!, rule);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/rules");
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = async () => {
    if (isAddMode) {
      await RuleBackend.deleteRule(rule);
      invalidateList();
    }
    navigate("/rules");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await RuleBackend.deleteRule(rule);
        if (res.status === "ok") {
          invalidateList();
          navigate("/rules");
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  const updateExpression = (index: number, key: keyof Expression, value: string) => {
    const expressions = [...(rule.expressions || [])];
    expressions[index] = { ...expressions[index], [key]: value };
    set("expressions", expressions);
  };

  const addExpression = () => {
    set("expressions", [...(rule.expressions || []), { name: "", operator: "", value: "" }]);
  };

  const removeExpression = (index: number) => {
    const expressions = [...(rule.expressions || [])];
    expressions.splice(index, 1);
    set("expressions", expressions);
  };

  const showAction = rule.type !== "WAF";
  const showStatusCode = rule.type !== "WAF" && (rule.action === "Allow" || rule.action === "Block");

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("rules.title" as any)}</h1>
            <p className="text-[13px] text-text-muted font-mono mt-0.5">{owner}/{name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
            <Trash2 size={14} /> {t("common.delete")}
          </button>
                    <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save")} />
          <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
            {t("common.saveAndExit" as any)}
          </button>
        </div>
      </div>

      {/* Basic Info */}
      <FormSection title={t("rules.section.basic" as any)}>
        <FormField label={t("field.owner")}>
          <input value={rule.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={rule.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
      </FormSection>

      {/* Type & Action */}
      <FormSection title={t("rules.section.config" as any)}>
        <FormField label={t("rules.field.type" as any)}>
          <SimpleSelect value={rule.type} options={TYPE_OPTIONS.map((o) => ({ value: o.id, label: o.name }))} onChange={(v) => set("type", v)} />
        </FormField>
        {showAction && (
          <FormField label={t("common.action" as any)}>
            <SimpleSelect value={rule.action} options={ACTION_OPTIONS.map((o) => ({ value: o.id, label: o.name }))} onChange={(v) => set("action", v)} />
          </FormField>
        )}
        {showStatusCode && (
          <FormField label={t("rules.field.statusCode" as any)}>
            <input type="number" min={100} max={599} value={rule.statusCode} onChange={(e) => set("statusCode", Number(e.target.value))} className={monoInputClass} />
          </FormField>
        )}
        <FormField label={t("rules.field.reason" as any)} span="full">
          <input value={rule.reason} onChange={(e) => set("reason", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("rules.field.verboseMode" as any)}>
          <Switch checked={rule.isVerbose} onChange={(checked) => set("isVerbose", checked)} />
        </FormField>
      </FormSection>

      {/* Expressions */}
      <FormSection title={t("rules.field.expressions" as any)}>
        <div className="col-span-full space-y-2">
          {(rule.expressions || []).map((expr, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={expr.name ?? ""} onChange={(e) => updateExpression(i, "name", e.target.value)} className={`${monoInputClass} flex-1`} placeholder={t("field.name")} />
              <input value={expr.operator ?? ""} onChange={(e) => updateExpression(i, "operator", e.target.value)} className={`${monoInputClass} w-32`} placeholder={t("rules.field.operator" as any)} />
              <input value={expr.value ?? ""} onChange={(e) => updateExpression(i, "value", e.target.value)} className={`${monoInputClass} flex-1`} placeholder={t("rules.field.value" as any)} />
              <button onClick={() => removeExpression(i)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={addExpression} className="rounded-lg border border-dashed border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
            + {t("rules.addExpression" as any)}
          </button>
        </div>
      </FormSection>
    </motion.div>
  );
}
