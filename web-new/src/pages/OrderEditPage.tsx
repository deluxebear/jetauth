import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, LogOut} from "lucide-react";
import { FormField, FormSection, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as OrderBackend from "../backend/OrderBackend";
import type { Order } from "../backend/OrderBackend";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";
import SaveButton from "../components/SaveButton";

const STATE_OPTIONS = [
  { id: "Created", name: "Created" },
  { id: "Paid", name: "Paid" },
  { id: "Delivered", name: "Delivered" },
  { id: "Completed", name: "Completed" },
  { id: "Canceled", name: "Canceled" },
  { id: "Expired", name: "Expired" },
];

export default function OrderEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [order, setOrder] = useState<Order | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Order>({
    queryKey: "order",
    owner,
    name,
    fetchFn: OrderBackend.getOrder,
  });

  useEffect(() => {
    if (entity) setOrder(entity);
  }, [entity]);

  if (loading || !order) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setOrder((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await OrderBackend.updateOrder(owner!, name!, order);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setIsAddMode(false);
        invalidateList();
        if (order.name !== name) {
          navigate(`/orders/${order.owner}/${order.name}`, { replace: true });
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
      const res = await OrderBackend.updateOrder(owner!, name!, order);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/orders");
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
      await OrderBackend.deleteOrder(order);
      invalidateList();
    }
    navigate("/orders");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await OrderBackend.deleteOrder(order);
        if (res.status === "ok") {
          invalidateList();
          navigate("/orders");
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
            <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("orders.title" as any)}</h1>
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
      <FormSection title={t("orders.section.basic" as any)}>
        <FormField label={t("field.owner")}>
          <input value={order.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={order.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={order.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Products */}
      <FormSection title={t("orders.section.products" as any)}>
        <FormField label={t("orders.field.products" as any)} span="full">
          <input value={(order.products || []).join(", ")} onChange={(e) => set("products", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Relations */}
      <FormSection title={t("orders.section.relations" as any)}>
        <FormField label={t("orders.field.user" as any)}>
          <input value={order.user} onChange={(e) => set("user", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("orders.field.payment" as any)}>
          <input value={order.payment} onChange={(e) => set("payment", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* State */}
      <FormSection title={t("orders.section.state" as any)}>
        <FormField label={t("col.state" as any)}>
          <SimpleSelect value={order.state} options={STATE_OPTIONS.map((o) => ({ value: o.id, label: o.name }))} onChange={(v) => set("state", v)} />
        </FormField>
        <FormField label={t("orders.field.message" as any)}>
          <input value={order.message} onChange={(e) => set("message", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
