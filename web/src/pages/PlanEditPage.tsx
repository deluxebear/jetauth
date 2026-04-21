import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, LogOut} from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as PlanBackend from "../backend/PlanBackend";
import type { Plan } from "../backend/PlanBackend";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";

const PERIOD_OPTIONS = [
  { id: "Monthly", name: "Monthly" },
  { id: "Yearly", name: "Yearly" },
];

export default function PlanEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Plan>({
    queryKey: "plan",
    owner,
    name,
    fetchFn: PlanBackend.getPlan,
  });

  useEffect(() => {
    if (entity) { setPlan(entity); setOriginalJson(JSON.stringify(entity)); }
  }, [entity]);

  const isDirty = !!plan && originalJson !== "" && JSON.stringify(plan) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !plan) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setPlan((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await PlanBackend.updatePlan(owner!, name!, plan);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(plan));
        setIsAddMode(false);
        invalidateList();
        if (plan.name !== name) {
          navigate(`/plans/${plan.owner}/${plan.name}`, { replace: true });
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
      const res = await PlanBackend.updatePlan(owner!, name!, plan);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/plans");
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
      await PlanBackend.deletePlan(plan);
      invalidateList();
    }
    navigate("/plans");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await PlanBackend.deletePlan(plan);
        if (res.status === "ok") {
          invalidateList();
          navigate("/plans");
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("plans.title" as any)}`}
        subtitle={`${owner}/${name}`}
        onBack={handleBack}
      >
          <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
            <Trash2 size={14} /> {t("common.delete")}
          </button>
                    <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save")} />
          <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
            {t("common.saveAndExit" as any)}
          </button>
      </StickyEditHeader>

      {showBanner && <UnsavedBanner isAddMode={isAddMode} />}

      {/* Basic Info */}
      <FormSection title={t("plans.section.basic" as any)}>
        <FormField label={t("field.owner")}>
          <input value={plan.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={plan.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={plan.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("plans.field.description" as any)}>
          <input value={plan.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("plans.field.role" as any)}>
          <input value={plan.role} onChange={(e) => set("role", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Pricing */}
      <FormSection title={t("plans.section.pricing" as any)}>
        <FormField label={t("plans.field.price" as any)}>
          <input type="number" value={plan.price} onChange={(e) => set("price", Number(e.target.value))} className={monoInputClass} />
        </FormField>
        <FormField label={t("plans.field.currency" as any)}>
          <input value={plan.currency} onChange={(e) => set("currency", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("plans.field.period" as any)}>
          <SimpleSelect value={plan.period} options={PERIOD_OPTIONS.map((o) => ({ value: o.id, label: o.name }))} onChange={(v) => set("period", v)} />
        </FormField>
      </FormSection>

      {/* Providers & Options */}
      <FormSection title={t("plans.section.providers" as any)}>
        <FormField label={t("plans.field.paymentProviders" as any)} span="full">
          <input value={(plan.paymentProviders || []).join(", ")} onChange={(e) => set("paymentProviders", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Flags */}
      <FormSection title={t("plans.section.flags" as any)}>
        <FormField label={t("col.isEnabled" as any)}>
          <Switch checked={plan.isEnabled} onChange={(v) => set("isEnabled", v)} />
        </FormField>
        <FormField label={t("plans.field.isExclusive" as any)}>
          <Switch checked={plan.isExclusive} onChange={(v) => set("isExclusive", v)} />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
