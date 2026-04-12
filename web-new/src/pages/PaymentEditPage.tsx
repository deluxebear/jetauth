import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, LogOut} from "lucide-react";
import { FormField, FormSection, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as PaymentBackend from "../backend/PaymentBackend";
import type { Payment } from "../backend/PaymentBackend";
import { friendlyError } from "../utils/errorHelper";

export default function PaymentEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [saving, setSaving] = useState(false);

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Payment>({
    queryKey: "payment",
    owner,
    name,
    fetchFn: PaymentBackend.getPayment,
  });

  useEffect(() => {
    if (entity) setPayment(entity);
  }, [entity]);

  if (loading || !payment) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setPayment((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await PaymentBackend.updatePayment(owner!, name!, payment);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setIsAddMode(false);
        invalidateList();
        if (payment.name !== name) {
          navigate(`/payments/${payment.owner}/${payment.name}`, { replace: true });
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
      const res = await PaymentBackend.updatePayment(owner!, name!, payment);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/payments");
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
      await PaymentBackend.deletePayment(payment);
      invalidateList();
    }
    navigate("/payments");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await PaymentBackend.deletePayment(payment);
        if (res.status === "ok") {
          invalidateList();
          navigate("/payments");
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
            <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("payments.title" as any)}</h1>
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

      {/* Basic Info (mostly read-only) */}
      <FormSection title={t("payments.section.basic" as any)}>
        <FormField label={t("field.owner")}>
          <input value={payment.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name")}>
          <input value={payment.name} disabled className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={payment.displayName} disabled className={inputClass} />
        </FormField>
      </FormSection>

      {/* Payment Details (read-only) */}
      <FormSection title={t("payments.section.details" as any)}>
        <FormField label={t("payments.field.provider" as any)}>
          <input value={payment.provider} disabled className={inputClass} />
        </FormField>
        <FormField label={t("payments.field.type" as any)}>
          <input value={payment.type} disabled className={inputClass} />
        </FormField>
        <FormField label={t("payments.field.price" as any)}>
          <input value={String(payment.price)} disabled className={monoInputClass} />
        </FormField>
        <FormField label={t("payments.field.currency" as any)}>
          <input value={payment.currency} disabled className={inputClass} />
        </FormField>
        <FormField label={t("col.state" as any)}>
          <input value={payment.state} disabled className={inputClass} />
        </FormField>
        <FormField label={t("payments.field.message" as any)}>
          <input value={payment.message} disabled className={inputClass} />
        </FormField>
      </FormSection>

      {/* Invoice Info (editable) */}
      <FormSection title={t("payments.section.invoice" as any)}>
        <FormField label={t("payments.field.personName" as any)}>
          <input value={payment.personName} onChange={(e) => set("personName", e.target.value)} disabled={!!payment.invoiceUrl} className={inputClass} />
        </FormField>
        <FormField label={t("payments.field.personIdCard" as any)}>
          <input value={payment.personIdCard} onChange={(e) => set("personIdCard", e.target.value)} disabled={!!payment.invoiceUrl} className={inputClass} />
        </FormField>
        <FormField label={t("payments.field.personEmail" as any)}>
          <input value={payment.personEmail} onChange={(e) => set("personEmail", e.target.value)} disabled={!!payment.invoiceUrl} className={inputClass} />
        </FormField>
        <FormField label={t("payments.field.personPhone" as any)}>
          <input value={payment.personPhone} onChange={(e) => set("personPhone", e.target.value)} disabled={!!payment.invoiceUrl} className={inputClass} />
        </FormField>
        <FormField label={t("payments.field.invoiceType" as any)}>
          <select value={payment.invoiceType} onChange={(e) => set("invoiceType", e.target.value)} disabled={!!payment.invoiceUrl} className={inputClass}>
            <option value="">{t("common.none" as any)}</option>
            <option value="Individual">{t("payments.field.individual" as any)}</option>
            <option value="Organization">{t("col.organization" as any)}</option>
          </select>
        </FormField>
        <FormField label={t("payments.field.invoiceTitle" as any)}>
          <input value={payment.invoiceTitle} onChange={(e) => set("invoiceTitle", e.target.value)} disabled={!!payment.invoiceUrl || payment.invoiceType === "Individual"} className={inputClass} />
        </FormField>
        <FormField label={t("payments.field.invoiceTaxId" as any)}>
          <input value={payment.invoiceTaxId} onChange={(e) => set("invoiceTaxId", e.target.value)} disabled={!!payment.invoiceUrl || payment.invoiceType === "Individual"} className={inputClass} />
        </FormField>
        <FormField label={t("payments.field.invoiceRemark" as any)}>
          <input value={payment.invoiceRemark} onChange={(e) => set("invoiceRemark", e.target.value)} disabled={!!payment.invoiceUrl} className={inputClass} />
        </FormField>
        <FormField label={t("payments.field.invoiceUrl" as any)}>
          <input value={payment.invoiceUrl} disabled className={monoInputClass} />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
