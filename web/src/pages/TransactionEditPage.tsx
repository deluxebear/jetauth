import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, LogOut} from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as TransactionBackend from "../backend/TransactionBackend";
import type { Transaction } from "../backend/TransactionBackend";
import { friendlyError } from "../utils/errorHelper";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";

export default function TransactionEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [txn, setTxn] = useState<Transaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Transaction>({
    queryKey: "transaction",
    owner,
    name,
    fetchFn: TransactionBackend.getTransaction,
  });

  useEffect(() => {
    if (entity) { setTxn(entity); setOriginalJson(JSON.stringify(entity)); }
  }, [entity]);

  const isDirty = !!txn && originalJson !== "" && JSON.stringify(txn) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !txn) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setTxn((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await TransactionBackend.updateTransaction(owner!, name!, txn);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess"));
        setSaved(true);
        setOriginalJson(JSON.stringify(txn));
        setIsAddMode(false);
        invalidateList();
        if (txn.name !== name) {
          navigate(`/transactions/${txn.owner}/${txn.name}`, { replace: true });
        }
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed"), "error");
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
      const res = await TransactionBackend.updateTransaction(owner!, name!, txn);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess"));
        invalidateList();
        navigate("/transactions");
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed"), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = async () => {
    if (isAddMode) {
      await TransactionBackend.deleteTransaction(txn);
      invalidateList();
    }
    navigate("/transactions");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await TransactionBackend.deleteTransaction(txn);
        if (res.status === "ok") {
          invalidateList();
          navigate("/transactions");
        } else {
          modal.toast(res.msg || t("common.deleteFailed"), "error");
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("transactions.title")}`}
        subtitle={`${owner}/${name}`}
        onBack={handleBack}
      >
          <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
            <Trash2 size={14} /> {t("common.delete")}
          </button>
                    <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save")} />
          <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
            {t("common.saveAndExit")}
          </button>
      </StickyEditHeader>

      {showBanner && <UnsavedBanner isAddMode={isAddMode} />}

      {/* Basic Info (mostly read-only) */}
      <FormSection title={t("transactions.section.basic")}>
        <FormField label={t("field.owner")}>
          <input value={txn.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name")}>
          <input value={txn.name} disabled className={monoInputClass} />
        </FormField>
      </FormSection>

      {/* Details */}
      <FormSection title={t("transactions.section.details")}>
        <FormField label={t("transactions.field.application")}>
          <input value={txn.application} disabled className={inputClass} />
        </FormField>
        <FormField label={t("transactions.field.domain")}>
          <input value={txn.domain} disabled className={monoInputClass} />
        </FormField>
        <FormField label={t("transactions.field.category")}>
          <input value={txn.category} disabled className={inputClass} />
        </FormField>
        <FormField label={t("transactions.field.type")}>
          <input value={txn.type} disabled className={inputClass} />
        </FormField>
        <FormField label={t("transactions.field.subtype")}>
          <input value={txn.subtype} disabled className={inputClass} />
        </FormField>
        <FormField label={t("transactions.field.provider")}>
          <input value={txn.provider} disabled className={inputClass} />
        </FormField>
        <FormField label={t("transactions.field.tag")}>
          <input value={txn.tag} disabled className={inputClass} />
        </FormField>
        <FormField label={t("transactions.field.user")}>
          <input value={txn.user} disabled className={inputClass} />
        </FormField>
      </FormSection>

      {/* Financial */}
      <FormSection title={t("transactions.section.financial")}>
        <FormField label={t("transactions.field.amount")}>
          <input type="number" value={txn.amount} onChange={(e) => set("amount", Number(e.target.value))} className={monoInputClass} />
        </FormField>
        <FormField label={t("transactions.field.currency")}>
          <input value={txn.currency} onChange={(e) => set("currency", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("transactions.field.payment")}>
          <input value={txn.payment} disabled className={inputClass} />
        </FormField>
        <FormField label={t("col.state")}>
          <input value={txn.state} disabled className={inputClass} />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
