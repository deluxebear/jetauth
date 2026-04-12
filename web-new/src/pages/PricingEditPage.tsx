import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, LogOut} from "lucide-react";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as PricingBackend from "../backend/PricingBackend";
import type { Pricing } from "../backend/PricingBackend";
import { friendlyError } from "../utils/errorHelper";

export default function PricingEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [saving, setSaving] = useState(false);

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Pricing>({
    queryKey: "pricing",
    owner,
    name,
    fetchFn: PricingBackend.getPricing,
  });

  useEffect(() => {
    if (entity) setPricing(entity);
  }, [entity]);

  if (loading || !pricing) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setPricing((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await PricingBackend.updatePricing(owner!, name!, pricing);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setIsAddMode(false);
        invalidateList();
        if (pricing.name !== name) {
          navigate(`/pricings/${pricing.owner}/${pricing.name}`, { replace: true });
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
      const res = await PricingBackend.updatePricing(owner!, name!, pricing);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/pricings");
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
      await PricingBackend.deletePricing(pricing);
      invalidateList();
    }
    navigate("/pricings");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await PricingBackend.deletePricing(pricing);
        if (res.status === "ok") {
          invalidateList();
          navigate("/pricings");
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("pricings.title" as any)}</h1>
            <p className="text-[13px] text-text-muted font-mono mt-0.5">{owner}/{name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
            <Trash2 size={14} /> {t("common.delete")}
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg border border-accent px-3 py-2 text-[13px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /> : <Save size={14} />}
            {t("common.save")}
          </button>
          <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
            {t("common.saveAndExit" as any)}
          </button>
        </div>
      </div>

      {/* Basic Info */}
      <FormSection title={t("pricings.section.basic" as any)}>
        <FormField label={t("field.owner")}>
          <input value={pricing.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={pricing.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={pricing.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("pricings.field.descriptionField" as any)}>
          <input value={pricing.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Configuration */}
      <FormSection title={t("pricings.section.config" as any)}>
        <FormField label={t("pricings.field.application" as any)}>
          <input value={pricing.application} onChange={(e) => set("application", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("pricings.field.plans" as any)} span="full">
          <input value={(pricing.plans || []).join(", ")} onChange={(e) => set("plans", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} className={inputClass} placeholder={t("pricings.field.plansPlaceholder" as any)} />
        </FormField>
        <FormField label={t("pricings.field.trialDuration" as any)}>
          <input type="number" min={0} value={pricing.trialDuration} onChange={(e) => set("trialDuration", Number(e.target.value))} className={monoInputClass} />
        </FormField>
        <FormField label={t("col.isEnabled" as any)}>
          <Switch checked={pricing.isEnabled} onChange={(v) => set("isEnabled", v)} />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
