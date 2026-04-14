import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, LogOut} from "lucide-react";
import { FormField, FormSection, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as FormBackend from "../backend/FormBackend";
import type { Form } from "../backend/FormBackend";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";

export default function FormEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Form>({
    queryKey: "form",
    owner: owner,
    name: name,
    fetchFn: FormBackend.getForm,
  });

  useEffect(() => {
    if (entity) setForm(entity);
  }, [entity]);

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setForm((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await FormBackend.updateForm(form.owner, name!, form);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setIsAddMode(false);
        invalidateList();
        if (form.name !== name) {
          navigate(`/forms/${form.name}`, { replace: true });
        }
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } finally {
      setSaving(false);
    }
  };
  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = await FormBackend.updateForm(form.owner, name!, form);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/forms");
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
      await FormBackend.deleteForm(form);
      invalidateList();
    }
    navigate("/forms");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      const res = await FormBackend.deleteForm(form);
      if (res.status === "ok") { invalidateList(); navigate("/forms"); }
      else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
    });
  };

  const typeOptions = [
    { id: "users", name: "form:Users" },
    { id: "applications", name: "form:Applications" },
    { id: "providers", name: "form:Providers" },
    { id: "organizations", name: "form:Organizations" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("forms.title" as any)}</h1>
            <p className="text-[13px] text-text-muted font-mono mt-0.5">{form.owner}/{name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors"><Trash2 size={14} /> {t("common.delete")}</button>
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

      {/* Basic */}
      <FormSection title={t("forms.section.basic" as any)}>
        <FormField label={t("field.name")} required>
          <input value={form.name} disabled className={monoInputClass} />
        </FormField>
        <FormField label={t("col.displayName" as any)}>
          <input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("col.type" as any)}>
          <SimpleSelect value={form.type} options={[
            { value: "", label: "--" },
            ...typeOptions.map((opt) => ({ value: opt.id, label: t(opt.name as any) })),
          ]} onChange={(v) => set("type", v)} />
        </FormField>
        <FormField label={t("forms.field.tag" as any)}>
          <input value={form.tag ?? ""} onChange={(e) => set("tag", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Form Items (JSON editor) */}
      <FormSection title={t("forms.field.formItems" as any)}>
        <FormField label={t("forms.field.formItems" as any)} span="full">
          <textarea
            value={JSON.stringify(form.formItems ?? [], null, 2)}
            onChange={(e) => {
              try { set("formItems", JSON.parse(e.target.value)); } catch { /* ignore invalid JSON */ }
            }}
            rows={16}
            className={`${monoInputClass} text-[11px]`}
          />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
