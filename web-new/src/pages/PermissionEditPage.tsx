import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, LogOut} from "lucide-react";
import { FormField, FormSection, inputClass, monoInputClass, Switch, TagsDisplay } from "../components/FormSection";
import SimpleSelect from "../components/SimpleSelect";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as PermissionBackend from "../backend/PermissionBackend";
import type { Permission } from "../backend/PermissionBackend";
import { friendlyError } from "../utils/errorHelper";

const RESOURCE_TYPE_OPTIONS = [
  { value: "Application", label: "Application" },
  { value: "TreeNode", label: "TreeNode" },
  { value: "Custom", label: "Custom" },
  { value: "API", label: "API" },
];

const ACTION_OPTIONS = [
  { value: "Read", label: "Read" },
  { value: "Write", label: "Write" },
  { value: "Admin", label: "Admin" },
];

const API_ACTION_OPTIONS = [
  { value: "POST", label: "POST" },
  { value: "GET", label: "GET" },
];

const EFFECT_OPTIONS = [
  { value: "Allow", label: "Allow" },
  { value: "Deny", label: "Deny" },
];

const STATE_OPTIONS = [
  { value: "Approved", label: "Approved" },
  { value: "Pending", label: "Pending" },
];

export default function PermissionEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [permission, setPermission] = useState<Permission | null>(null);
  const [saving, setSaving] = useState(false);

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Permission>({
    queryKey: "permission",
    owner,
    name,
    fetchFn: PermissionBackend.getPermission,
  });

  useEffect(() => {
    if (entity) setPermission(entity);
  }, [entity]);

  if (loading || !permission) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setPermission((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await PermissionBackend.updatePermission(owner!, name!, permission);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setIsAddMode(false);
        invalidateList();
        if (permission.name !== name) {
          navigate(`/permissions/${permission.owner}/${permission.name}`, { replace: true });
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
      const res = await PermissionBackend.updatePermission(owner!, name!, permission);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/permissions");
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
      await PermissionBackend.deletePermission(permission);
      invalidateList();
    }
    navigate("/permissions");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await PermissionBackend.deletePermission(permission);
        if (res.status === "ok") {
          invalidateList();
          navigate("/permissions");
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  const handleTagsChange = (key: string, text: string) => {
    const values = text.split(",").map((s) => s.trim()).filter(Boolean);
    set(key, values);
  };

  const isAPI = permission.resourceType === "API";
  const actionOptions = isAPI ? API_ACTION_OPTIONS : ACTION_OPTIONS;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("permissions.title" as any)}</h1>
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
      <FormSection title={t("permissions.section.basic" as any)}>
        <FormField label={t("field.owner" as any)}>
          <input value={permission.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name" as any)} required>
          <input value={permission.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName" as any)}>
          <input value={permission.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("field.description" as any)}>
          <input value={permission.description || ""} onChange={(e) => set("description", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("col.model" as any)}>
          <input value={permission.model} onChange={(e) => set("model", e.target.value)} className={monoInputClass} />
        </FormField>
      </FormSection>

      {/* Members */}
      <FormSection title={t("permissions.section.members" as any)}>
        <FormField label={t("roles.field.users" as any)} span="full">
          <div className="mb-2"><TagsDisplay tags={permission.users || []} /></div>
          <input
            value={(permission.users || []).join(", ")}
            onChange={(e) => handleTagsChange("users", e.target.value)}
            className={monoInputClass}
          />
        </FormField>
        <FormField label={t("roles.field.groups" as any)} span="full">
          <div className="mb-2"><TagsDisplay tags={permission.groups || []} /></div>
          <input
            value={(permission.groups || []).join(", ")}
            onChange={(e) => handleTagsChange("groups", e.target.value)}
            className={monoInputClass}
          />
        </FormField>
        <FormField label={t("roles.field.roles" as any)} span="full">
          <div className="mb-2"><TagsDisplay tags={permission.roles || []} /></div>
          <input
            value={(permission.roles || []).join(", ")}
            onChange={(e) => handleTagsChange("roles", e.target.value)}
            className={monoInputClass}
          />
        </FormField>
        <FormField label={t("roles.field.domains" as any)} span="full">
          <div className="mb-2"><TagsDisplay tags={permission.domains || []} /></div>
          <input
            value={(permission.domains || []).join(", ")}
            onChange={(e) => handleTagsChange("domains", e.target.value)}
            className={monoInputClass}
          />
        </FormField>
      </FormSection>

      {/* Resources & Actions */}
      <FormSection title={t("permissions.section.resources" as any)}>
        <FormField label={t("permissions.field.resourceType" as any)}>
          <SimpleSelect value={permission.resourceType} options={RESOURCE_TYPE_OPTIONS} onChange={(v) => { set("resourceType", v); set("resources", []); }} />
        </FormField>
        <FormField label={t("permissions.field.resources" as any)} span="full">
          <div className="mb-2"><TagsDisplay tags={permission.resources || []} /></div>
          <input
            value={(permission.resources || []).join(", ")}
            onChange={(e) => handleTagsChange("resources", e.target.value)}
            className={monoInputClass}
          />
        </FormField>
        <FormField label={t("permissions.field.actions" as any)} span="full">
          <div className="mb-2"><TagsDisplay tags={permission.actions || []} /></div>
          <input
            value={(permission.actions || []).join(", ")}
            onChange={(e) => handleTagsChange("actions", e.target.value)}
            placeholder={actionOptions.map((o) => o.value).join(", ")}
            className={monoInputClass}
          />
        </FormField>
        <FormField label={t("permissions.field.effect" as any)}>
          <SimpleSelect value={permission.effect} options={EFFECT_OPTIONS.map((o) => ({ value: o.value, label: t(`permissions.effect${o.label}` as any) }))} onChange={(v) => set("effect", v)} />
        </FormField>
        <FormField label={t("col.isEnabled" as any)}>
          <Switch checked={permission.isEnabled} onChange={(v) => set("isEnabled", v)} />
        </FormField>
      </FormSection>

      {/* Approval */}
      <FormSection title={t("permissions.section.approval" as any)}>
        <FormField label={t("permissions.field.submitter" as any)}>
          <input value={permission.submitter || ""} disabled className={inputClass} />
        </FormField>
        <FormField label={t("permissions.field.approver" as any)}>
          <input value={permission.approver || ""} disabled className={inputClass} />
        </FormField>
        <FormField label={t("permissions.field.approveTime" as any)}>
          <input value={permission.approveTime ? new Date(permission.approveTime).toLocaleString() : "\u2014"} disabled className={inputClass} />
        </FormField>
        <FormField label={t("permissions.field.state" as any)}>
          <SimpleSelect value={permission.state} options={STATE_OPTIONS.map((o) => ({ value: o.value, label: t(`permissions.state${o.label}` as any) }))} onChange={(v) => {
            if (v === "Approved") {
              set("approveTime", new Date().toISOString());
            } else {
              set("approver", "");
              set("approveTime", "");
            }
            set("state", v);
          }} />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
