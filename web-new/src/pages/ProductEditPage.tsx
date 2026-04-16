import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, LogOut, X } from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as ProductBackend from "../backend/ProductBackend";
import type { Product } from "../backend/ProductBackend";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";
import CurrencySelect from "../components/CurrencySelect";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";

export default function ProductEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [product, setProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");
  const [rechargeInput, setRechargeInput] = useState("");

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Product>({
    queryKey: "product",
    owner,
    name,
    fetchFn: ProductBackend.getProduct,
  });

  useEffect(() => {
    if (entity) { setProduct(entity); setOriginalJson(JSON.stringify(entity)); }
  }, [entity]);

  const isDirty = !!product && originalJson !== "" && JSON.stringify(product) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !product) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setProduct((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await ProductBackend.updateProduct(owner!, name!, product);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(product));
        setIsAddMode(false);
        invalidateList();
        if (product.name !== name) {
          navigate(`/products/${product.owner}/${product.name}`, { replace: true });
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
      const res = await ProductBackend.updateProduct(owner!, name!, product);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/products");
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
      await ProductBackend.deleteProduct(product);
      invalidateList();
    }
    navigate("/products");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await ProductBackend.deleteProduct(product);
        if (res.status === "ok") {
          invalidateList();
          navigate("/products");
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  const handleAddRechargeOption = () => {
    const val = parseFloat(rechargeInput);
    if (isNaN(val) || val <= 0) return;
    const options = product.rechargeOptions || [];
    if (!options.includes(val)) {
      set("rechargeOptions", [...options, val]);
    }
    setRechargeInput("");
  };

  const handleRemoveRechargeOption = (val: number) => {
    set("rechargeOptions", (product.rechargeOptions || []).filter((o) => o !== val));
  };

  const stateOptions = [
    { value: "Published", label: t("products.state.published" as any) },
    { value: "Draft", label: t("products.state.draft" as any) },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("products.title" as any)}`}
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
      <FormSection title={t("products.section.basic" as any)}>
        <FormField label={t("field.owner")}>
          <input value={product.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={product.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={product.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("products.field.tag" as any)}>
          <input value={product.tag} onChange={(e) => set("tag", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("products.field.description" as any)}>
          <input value={product.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("products.field.detail" as any)}>
          <input value={product.detail} onChange={(e) => set("detail", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Image */}
      <FormSection title={t("products.section.image" as any)}>
        <FormField label={t("products.field.imageUrl" as any)} span="full">
          <input value={product.image} onChange={(e) => set("image", e.target.value)} className={monoInputClass} />
        </FormField>
        {product.image && (
          <FormField label={t("products.field.preview" as any)} span="full">
            <a href={product.image} target="_blank" rel="noreferrer">
              <img src={product.image} alt={product.name} className="h-20 object-contain" />
            </a>
          </FormField>
        )}
      </FormSection>

      {/* Pricing */}
      <FormSection title={t("products.section.pricing" as any)}>
        <FormField label={t("products.field.currency" as any)}>
          <CurrencySelect
            value={product.currency || "USD"}
            onChange={(v) => set("currency", v)}
          />
        </FormField>
        <FormField label={t("products.field.isRecharge" as any)}>
          <Switch checked={product.isRecharge} onChange={(v) => set("isRecharge", v)} />
        </FormField>

        {product.isRecharge ? (
          <>
            <FormField label={t("products.field.disableCustomRecharge" as any)}>
              <Switch
                checked={product.disableCustomRecharge}
                onChange={(v) => set("disableCustomRecharge", v)}
              />
            </FormField>
            <FormField label={t("products.field.rechargeOptions" as any)} span="full">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={rechargeInput}
                    onChange={(e) => setRechargeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddRechargeOption();
                      }
                    }}
                    className={monoInputClass}
                    placeholder={t("products.field.rechargeOptionsPlaceholder" as any)}
                    min="0"
                    step="any"
                  />
                </div>
                {(product.rechargeOptions || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(product.rechargeOptions || []).map((opt) => (
                      <span
                        key={opt}
                        className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-[12px] font-mono font-medium text-accent"
                      >
                        {product.currency} {opt}
                        <button
                          onClick={() => handleRemoveRechargeOption(opt)}
                          className="rounded-full p-0.5 hover:bg-danger/20 hover:text-danger transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </FormField>
          </>
        ) : (
          <FormField label={t("products.field.price" as any)}>
            <input
              type="number"
              value={product.price}
              onChange={(e) => set("price", Number(e.target.value))}
              className={monoInputClass}
              min="0"
              step="any"
            />
          </FormField>
        )}

        <FormField label={t("products.field.quantity" as any)}>
          <input type="number" value={product.quantity} onChange={(e) => set("quantity", Number(e.target.value))} className={monoInputClass} />
        </FormField>
        <FormField label={t("products.field.sold" as any)}>
          <input type="number" value={product.sold} onChange={(e) => set("sold", Number(e.target.value))} className={monoInputClass} />
        </FormField>
      </FormSection>

      {/* Providers & URLs */}
      <FormSection title={t("products.section.providers" as any)}>
        <FormField label={t("products.field.providers" as any)} span="full">
          <input
            value={(product.providers || []).join(", ")}
            onChange={(e) => set("providers", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            className={inputClass}
            placeholder={t("products.field.providersPlaceholder" as any)}
          />
        </FormField>
        <FormField label={t("products.field.successUrl" as any)} span="full">
          <input value={product.successUrl} onChange={(e) => set("successUrl", e.target.value)} className={monoInputClass} />
        </FormField>
      </FormSection>

      {/* State */}
      <FormSection title={t("products.section.state" as any)}>
        <FormField label={t("col.state" as any)}>
          <SimpleSelect
            value={product.state}
            options={stateOptions}
            onChange={(v) => set("state", v)}
          />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
