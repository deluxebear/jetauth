import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, LogOut} from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass, Switch, TagsDisplay } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as RoleBackend from "../backend/RoleBackend";
import type { Role } from "../backend/RoleBackend";
import { friendlyError } from "../utils/errorHelper";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";

export default function RoleEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [role, setRole] = useState<Role | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Role>({
    queryKey: "role",
    owner,
    name,
    fetchFn: RoleBackend.getRole,
  });

  useEffect(() => {
    if (entity) { setRole(entity); setOriginalJson(JSON.stringify(entity)); }
  }, [entity]);

  const isDirty = !!role && originalJson !== "" && JSON.stringify(role) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !role) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setRole((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await RoleBackend.updateRole(owner!, name!, role);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(role));
        setIsAddMode(false);
        invalidateList();
        if (role.name !== name) {
          navigate(`/roles/${role.owner}/${role.name}`, { replace: true });
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
      const res = await RoleBackend.updateRole(owner!, name!, role);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/roles");
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
      await RoleBackend.deleteRole(role!);
      invalidateList();
    }
    navigate("/roles");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await RoleBackend.deleteRole(role);
        if (res.status === "ok") {
          invalidateList();
          navigate("/roles");
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

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("roles.title" as any)}`}
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
      <FormSection title={t("roles.section.basic" as any)}>
        <FormField label={t("field.owner" as any)}>
          <input value={role.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name" as any)} required>
          <input value={role.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName" as any)}>
          <input value={role.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("field.description" as any)}>
          <input value={role.description || ""} onChange={(e) => set("description", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Members */}
      <FormSection title={t("roles.section.members" as any)}>
        <FormField label={t("roles.field.users" as any)} span="full">
          <div className="mb-2"><TagsDisplay tags={role.users || []} /></div>
          <input
            value={(role.users || []).join(", ")}
            onChange={(e) => handleTagsChange("users", e.target.value)}
            placeholder={t("roles.field.usersPlaceholder" as any)}
            className={monoInputClass}
          />
        </FormField>
        <FormField label={t("roles.field.groups" as any)} span="full">
          <div className="mb-2"><TagsDisplay tags={role.groups || []} /></div>
          <input
            value={(role.groups || []).join(", ")}
            onChange={(e) => handleTagsChange("groups", e.target.value)}
            placeholder={t("roles.field.groupsPlaceholder" as any)}
            className={monoInputClass}
          />
        </FormField>
        <FormField label={t("roles.field.roles" as any)} span="full">
          <div className="mb-2"><TagsDisplay tags={role.roles || []} /></div>
          <input
            value={(role.roles || []).join(", ")}
            onChange={(e) => handleTagsChange("roles", e.target.value)}
            placeholder={t("roles.field.rolesPlaceholder" as any)}
            className={monoInputClass}
          />
        </FormField>
        <FormField label={t("roles.field.domains" as any)} span="full">
          <div className="mb-2"><TagsDisplay tags={role.domains || []} /></div>
          <input
            value={(role.domains || []).join(", ")}
            onChange={(e) => handleTagsChange("domains", e.target.value)}
            placeholder={t("roles.field.domainsPlaceholder" as any)}
            className={monoInputClass}
          />
        </FormField>
      </FormSection>

      {/* Options */}
      <FormSection title={t("roles.section.options" as any)}>
        <FormField label={t("col.isEnabled" as any)}>
          <Switch checked={role.isEnabled} onChange={(v) => set("isEnabled", v)} />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
