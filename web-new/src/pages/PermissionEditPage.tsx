import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, LogOut } from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import SimpleSelect from "../components/SimpleSelect";
import SingleSearchSelect from "../components/SingleSearchSelect";
import MultiSearchSelect from "../components/MultiSearchSelect";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as PermissionBackend from "../backend/PermissionBackend";
import * as OrganizationBackend from "../backend/OrganizationBackend";
import * as UserBackend from "../backend/UserBackend";
import * as GroupBackend from "../backend/GroupBackend";
import * as RoleBackend from "../backend/RoleBackend";
import * as ModelBackend from "../backend/ModelBackend";
import * as ApplicationBackend from "../backend/ApplicationBackend";
import type { Permission } from "../backend/PermissionBackend";
import { friendlyError } from "../utils/errorHelper";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";
import { getStoredAccount, isGlobalAdmin } from "../utils/auth";

const RESOURCE_TYPE_OPTIONS = [
  { value: "Application", label: "Application" },
  { value: "TreeNode", label: "TreeNode" },
  { value: "Custom", label: "Custom" },
  { value: "API", label: "API" },
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
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");

  const account = getStoredAccount();
  const isAdmin = isGlobalAdmin(account);

  // Dropdown options
  const [orgOptions, setOrgOptions] = useState<{ value: string; label: string }[]>([]);
  const [modelOptions, setModelOptions] = useState<{ value: string; label: string }[]>([]);
  const [userOptions, setUserOptions] = useState<{ value: string; label: string }[]>([]);
  const [groupOptions, setGroupOptions] = useState<{ value: string; label: string }[]>([]);
  const [roleOptions, setRoleOptions] = useState<{ value: string; label: string }[]>([]);
  const [appOptions, setAppOptions] = useState<{ value: string; label: string }[]>([]);

  // Load org list for admin
  useEffect(() => {
    if (!isAdmin) return;
    OrganizationBackend.getOrganizationNames("admin").then((res) => {
      if (res.status === "ok" && res.data) {
        setOrgOptions([
          { value: "admin", label: t("common.adminShared" as any) },
          ...res.data.map((o) => ({ value: o.name, label: o.displayName || o.name })),
        ]);
      }
    });
  }, [isAdmin]);

  // Load models
  useEffect(() => {
    if (!permission?.owner) return;
    ModelBackend.getModels({ owner: permission.owner }).then((res) => {
      if (res.status === "ok" && res.data) {
        setModelOptions(res.data.map((m) => ({ value: `${(m as any).owner}/${m.name}`, label: `${(m as any).owner}/${m.name}` })));
      }
    });
  }, [permission?.owner]);

  // Load users, groups, roles, apps when permission.owner changes
  useEffect(() => {
    if (!permission?.owner) return;
    const ow = permission.owner;
    UserBackend.getUsers({ owner: ow }).then((res) => {
      if (res.status === "ok" && res.data) {
        const all = { value: "*", label: t("common.all" as any) || "All" };
        setUserOptions([all, ...res.data.map((u) => ({ value: `${(u as any).owner}/${u.name}`, label: `${(u as any).owner}/${u.name}` }))]);
      }
    });
    GroupBackend.getGroups({ owner: ow }).then((res) => {
      if (res.status === "ok" && res.data) {
        const all = { value: "*", label: t("common.all" as any) || "All" };
        setGroupOptions([all, ...res.data.map((g) => ({ value: `${(g as any).owner}/${g.name}`, label: `${(g as any).owner}/${g.name}` }))]);
      }
    });
    RoleBackend.getRoles({ owner: ow }).then((res) => {
      if (res.status === "ok" && res.data) {
        const all = { value: "*", label: t("common.all" as any) || "All" };
        setRoleOptions([all, ...res.data.map((r) => ({ value: `${r.owner}/${r.name}`, label: `${r.owner}/${r.name}` }))]);
      }
    });
    ApplicationBackend.getApplicationsByOrganization({ owner: "admin", organization: ow }).then((res) => {
      if (res.status === "ok" && res.data) {
        const all = { value: "*", label: t("common.all" as any) || "All" };
        setAppOptions([all, ...res.data.map((a) => ({ value: a.name, label: (a as any).displayName || a.name }))]);
      }
    });
  }, [permission?.owner]);

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Permission>({
    queryKey: "permission",
    owner,
    name,
    fetchFn: PermissionBackend.getPermission,
  });

  useEffect(() => {
    if (entity) { setPermission(entity); setOriginalJson(JSON.stringify(entity)); }
  }, [entity]);

  const isDirty = !!permission && originalJson !== "" && JSON.stringify(permission) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

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
        setSaved(true);
        setOriginalJson(JSON.stringify(permission));
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

  const isAPI = permission.resourceType === "API";
  const isCustom = permission.resourceType === "Custom";

  // Actions options based on resourceType
  const actionOpts = isAPI
    ? [{ value: "POST", label: "POST" }, { value: "GET", label: "GET" }, { value: "PUT", label: "PUT" }, { value: "DELETE", label: "DELETE" }, { value: "PATCH", label: "PATCH" }]
    : [{ value: "Read", label: "Read" }, { value: "Write", label: "Write" }, { value: "Admin", label: "Admin" }];

  // Resources options based on resourceType
  const resourceOpts = (isCustom || isAPI)
    ? (permission.resources || []).map((r) => ({ value: r, label: r }))
    : appOptions;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("permissions.title" as any)}`}
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
      <FormSection title={t("permissions.section.basic" as any)}>
        <FormField label={t("field.owner" as any)}>
          {isAdmin ? (
            <SingleSearchSelect value={permission.owner} options={orgOptions} onChange={(v) => set("owner", v)} placeholder={t("common.search" as any)} />
          ) : (
            <input value={permission.owner} disabled className={inputClass} />
          )}
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
        <FormField label={t("col.model" as any)} tooltip={t("permissions.tooltip.model" as any)}>
          <SingleSearchSelect value={permission.model} options={modelOptions} onChange={(v) => set("model", v)} placeholder={t("common.search" as any)} />
        </FormField>
      </FormSection>

      {/* Members */}
      <FormSection title={t("permissions.section.members" as any)}>
        <FormField label={t("roles.field.users" as any)} tooltip={t("permissions.tooltip.users" as any)} span="full">
          <MultiSearchSelect selected={permission.users || []} options={userOptions} onChange={(v) => set("users", v)} placeholder={t("common.search" as any)} />
        </FormField>
        <FormField label={t("roles.field.groups" as any)} tooltip={t("permissions.tooltip.groups" as any)} span="full">
          <MultiSearchSelect selected={permission.groups || []} options={groupOptions} onChange={(v) => set("groups", v)} placeholder={t("common.search" as any)} />
        </FormField>
        <FormField label={t("roles.field.roles" as any)} tooltip={t("permissions.tooltip.roles" as any)} span="full">
          <MultiSearchSelect selected={permission.roles || []} options={roleOptions} onChange={(v) => set("roles", v)} placeholder={t("common.search" as any)} />
        </FormField>
        <FormField label={t("roles.field.domains" as any)} tooltip={t("permissions.tooltip.domains" as any)} span="full">
          <MultiSearchSelect selected={permission.domains || []} options={(permission.domains || []).map((d) => ({ value: d, label: d }))} onChange={(v) => set("domains", v)} placeholder={t("roles.field.domainsPlaceholder" as any)} />
        </FormField>
      </FormSection>

      {/* Resources & Actions */}
      <FormSection title={t("permissions.section.resources" as any)}>
        <FormField label={t("permissions.field.resourceType" as any)} tooltip={t("permissions.tooltip.resourceType" as any)}>
          <SimpleSelect value={permission.resourceType} options={RESOURCE_TYPE_OPTIONS} onChange={(v) => { set("resourceType", v); set("resources", []); set("actions", []); }} />
        </FormField>
        <FormField label={t("permissions.field.resources" as any)} tooltip={t("permissions.tooltip.resources" as any)} span="full">
          <MultiSearchSelect selected={permission.resources || []} options={resourceOpts} onChange={(v) => set("resources", v)} placeholder={isCustom || isAPI ? t("permissions.field.resourcesCustomPlaceholder" as any) : t("common.search" as any)} />
        </FormField>
        <FormField label={t("permissions.field.actions" as any)} tooltip={t("permissions.tooltip.actions" as any)} span="full">
          <MultiSearchSelect selected={permission.actions || []} options={actionOpts} onChange={(v) => set("actions", v)} placeholder={t("common.search" as any)} />
        </FormField>
        <FormField label={t("permissions.field.effect" as any)} tooltip={t("permissions.tooltip.effect" as any)}>
          <SimpleSelect value={permission.effect} options={EFFECT_OPTIONS.map((o) => ({ value: o.value, label: t(`permissions.effect${o.label}` as any) }))} onChange={(v) => set("effect", v)} />
        </FormField>
        <FormField label={t("col.isEnabled" as any)}>
          <Switch checked={permission.isEnabled} onChange={(v) => set("isEnabled", v)} />
        </FormField>
      </FormSection>

      {/* Approval */}
      <FormSection title={t("permissions.section.approval" as any)}>
        <FormField label={t("permissions.field.submitter" as any)} tooltip={t("permissions.tooltip.submitter" as any)}>
          <input value={permission.submitter || ""} disabled className={inputClass} />
        </FormField>
        <FormField label={t("permissions.field.approver" as any)} tooltip={t("permissions.tooltip.approver" as any)}>
          <input value={permission.approver || ""} disabled className={inputClass} />
        </FormField>
        <FormField label={t("permissions.field.approveTime" as any)}>
          <input value={permission.approveTime ? new Date(permission.approveTime).toLocaleString() : "\u2014"} disabled className={inputClass} />
        </FormField>
        <FormField label={t("permissions.field.state" as any)} tooltip={t("permissions.tooltip.state" as any)}>
          <SimpleSelect value={permission.state} options={STATE_OPTIONS.map((o) => ({ value: o.value, label: t(`permissions.state${o.label}` as any) }))} onChange={(v) => {
            if (v === "Approved") {
              set("approver", account?.name || "");
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
