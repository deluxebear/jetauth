import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, Trash2, LogOut} from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as SubscriptionBackend from "../backend/SubscriptionBackend";
import type { Subscription } from "../backend/SubscriptionBackend";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";

const PERIOD_OPTIONS = [
  { id: "Monthly", name: "Monthly" },
  { id: "Yearly", name: "Yearly" },
];

const STATE_OPTIONS = [
  { id: "Pending", name: "Pending" },
  { id: "Active", name: "Active" },
  { id: "Upcoming", name: "Upcoming" },
  { id: "Expired", name: "Expired" },
  { id: "Error", name: "Error" },
  { id: "Suspended", name: "Suspended" },
];

export default function SubscriptionEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Subscription>({
    queryKey: "subscription",
    owner,
    name,
    fetchFn: SubscriptionBackend.getSubscription,
  });

  useEffect(() => {
    if (entity) { setSub(entity); setOriginalJson(JSON.stringify(entity)); }
  }, [entity]);

  const isDirty = !!sub && originalJson !== "" && JSON.stringify(sub) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !sub) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setSub((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await SubscriptionBackend.updateSubscription(owner!, name!, sub);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(sub));
        setIsAddMode(false);
        invalidateList();
        if (sub.name !== name) {
          navigate(`/subscriptions/${sub.owner}/${sub.name}`, { replace: true });
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
      const res = await SubscriptionBackend.updateSubscription(owner!, name!, sub);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/subscriptions");
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
      await SubscriptionBackend.deleteSubscription(sub);
      invalidateList();
    }
    navigate("/subscriptions");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await SubscriptionBackend.deleteSubscription(sub);
        if (res.status === "ok") {
          invalidateList();
          navigate("/subscriptions");
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
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("subscriptions.title" as any)}`}
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
      <FormSection title={t("subscriptions.section.basic" as any)}>
        <FormField label={t("field.owner")}>
          <input value={sub.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={sub.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={sub.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("subscriptions.field.descriptionField" as any)}>
          <input value={sub.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Time & Period */}
      <FormSection title={t("subscriptions.section.schedule" as any)}>
        <FormField label={t("subscriptions.field.startTime" as any)}>
          <input type="date" value={sub.startTime ? sub.startTime.substring(0, 10) : ""} onChange={(e) => set("startTime", e.target.value ? new Date(e.target.value).toISOString() : "")} className={monoInputClass} />
        </FormField>
        <FormField label={t("subscriptions.field.endTime" as any)}>
          <input type="date" value={sub.endTime ? sub.endTime.substring(0, 10) : ""} onChange={(e) => set("endTime", e.target.value ? new Date(e.target.value).toISOString() : "")} className={monoInputClass} />
        </FormField>
        <FormField label={t("subscriptions.field.period" as any)}>
          <SimpleSelect value={sub.period} options={PERIOD_OPTIONS.map((o) => ({ value: o.id, label: o.name }))} onChange={(v) => set("period", v)} />
        </FormField>
      </FormSection>

      {/* Relations */}
      <FormSection title={t("subscriptions.section.relations" as any)}>
        <FormField label={t("subscriptions.field.user" as any)}>
          <input value={sub.user} onChange={(e) => set("user", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("subscriptions.field.pricing" as any)}>
          <input value={sub.pricing} onChange={(e) => set("pricing", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("subscriptions.field.plan" as any)}>
          <input value={sub.plan} onChange={(e) => set("plan", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("subscriptions.field.payment" as any)}>
          <input value={sub.payment} disabled className={inputClass} />
        </FormField>
      </FormSection>

      {/* State */}
      <FormSection title={t("subscriptions.section.state" as any)}>
        <FormField label={t("col.state" as any)}>
          <SimpleSelect value={sub.state} options={STATE_OPTIONS.map((o) => ({ value: o.id, label: o.name }))} onChange={(v) => set("state", v)} />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
