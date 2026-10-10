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
import * as AdapterBackend from "../backend/AdapterBackend";
import * as ApplicationBackend from "../backend/ApplicationBackend";
import type { Permission } from "../backend/PermissionBackend";
import { friendlyError } from "../utils/errorHelper";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";
import PermissionStateBadge from "../components/PermissionStateBadge";
import { canApprovePermission, getStoredAccount, isGlobalAdmin } from "../utils/auth";

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
  const [adapterOptions, setAdapterOptions] = useState<{ value: string; label: string }[]>([]);
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
          { value: "admin", label: t("common.adminShared") },
          ...res.data.map((o) => ({ value: o.name, label: o.displayName || o.name })),
        ]);
      }
    });
  }, [isAdmin]);

  // Load models and adapters
  useEffect(() => {
    if (!permission?.owner) return;
    ModelBackend.getModels({ owner: permission.owner }).then((res) => {
      if (res.status === "ok" && res.data) {
        setModelOptions(res.data.map((m) => ({ value: `${(m as any).owner}/${m.name}`, label: `${(m as any).owner}/${m.name}` })));
      }
    });
    AdapterBackend.getAdapters({ owner: permission.owner }).then((res) => {
      if (res.status === "ok" && res.data) {
        setAdapterOptions(res.data.map((a) => ({ value: `${(a as any).owner}/${a.name}`, label: `${(a as any).owner}/${a.name}` })));
      }
    });
  }, [permission?.owner]);

  // Load users, groups, roles, apps when permission.owner changes
  useEffect(() => {
    if (!permission?.owner) return;
    const ow = permission.owner;
    UserBackend.getUsers({ owner: ow }).then((res) => {
      if (res.status === "ok" && res.data) {
        const all = { value: "*", label: t("common.all") || "All" };
        setUserOptions([all, ...res.data.map((u) => ({ value: `${(u as any).owner}/${u.name}`, label: `${(u as any).owner}/${u.name}` }))]);
      }
    });
    GroupBackend.getGroups({ owner: ow }).then((res) => {
      if (res.status === "ok" && res.data) {
        const all = { value: "*", label: t("common.all") || "All" };
        setGroupOptions([all, ...res.data.map((g) => ({ value: `${(g as any).owner}/${g.name}`, label: `${(g as any).owner}/${g.name}` }))]);
      }
    });
    RoleBackend.getRoles({ owner: ow }).then((res) => {
      if (res.status === "ok" && res.data) {
        const all = { value: "*", label: t("common.all") || "All" };
        setRoleOptions([all, ...res.data.map((r) => ({ value: `${r.owner}/${r.name}`, label: `${r.owner}/${r.name}` }))]);
      }
    });
    ApplicationBackend.getApplicationsByOrganization({ owner: "admin", organization: ow }).then((res) => {
      if (res.status === "ok" && res.data) {
        const all = { value: "*", label: t("common.all") || "All" };
        setAppOptions([all, ...res.data.map((a) => ({ value: a.name, label: (a as any).displayName || a.name }))]);
      }
    });
  }, [permission?.owner]);

  const [logs, setLogs] = useState<PermissionBackend.PermissionApprovalLog[]>([]);
  const [logTick, setLogTick] = useState(0);
  const [actionBusy, setActionBusy] = useState(false);
  useEffect(() => {
    if (isAddMode || !owner || !name) return;
    PermissionBackend.getPermissionApprovalLogs(owner, name).then((res) => {
      if (res.status === "ok" && Array.isArray(res.data)) setLogs(res.data);
    }).catch(() => {});
  }, [owner, name, isAddMode, logTick]);

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

  const canApprove = canApprovePermission(account, permission.owner);
  const isSubmitter = !!account && !!permission.submitter && permission.submitter === account.name;

  // Runs an approval action, then merges only the server-owned approval fields
  // so unsaved edits to the rest of the form survive.
  const runStateAction = async (call: () => Promise<{ status: string; msg: string }>, okKey: Parameters<typeof t>[0]) => {
    setActionBusy(true);
    try {
      const res = await call();
      if (res.status !== "ok") {
        modal.toast(friendlyError(res.msg, t) || t("permissions.stateChangeFailed"), "error");
        return;
      }
      const fresh = await PermissionBackend.getPermission(permission.owner, permission.name);
      if (fresh.status === "ok" && fresh.data) {
        const f = fresh.data;
        const merge = (p: Permission): Permission => ({ ...p, state: f.state, approver: f.approver, approveTime: f.approveTime, rejectReason: f.rejectReason ?? "" });
        setPermission((prev) => (prev ? merge(prev) : prev));
        try { setOriginalJson(JSON.stringify(merge(JSON.parse(originalJson)))); } catch { /* keep */ }
      }
      modal.toast(t(okKey));
      invalidateList();
      setLogTick((n) => n + 1);
    } finally {
      setActionBusy(false);
    }
  };

  const handleApprove = () => runStateAction(() => PermissionBackend.approvePermission(permission.owner, permission.name), "permissions.approveSuccess");
  const handleReject = async () => {
    const reason = await modal.prompt({
      title: t("permissions.rejectTitle"),
      message: `${permission.owner}/${permission.name}`,
      placeholder: t("permissions.rejectReasonPlaceholder"),
      maxLength: 500,
      confirmLabel: t("permissions.reject"),
    });
    if (reason === null) return;
    if (!reason.trim()) { modal.toast(t("permissions.rejectReasonRequired"), "error"); return; }
    await runStateAction(() => PermissionBackend.rejectPermission(permission.owner, permission.name, reason.trim()), "permissions.rejectSuccess");
  };
  // Revoke and resubmit both move the permission back to Pending through the update endpoint,
  // which enforces the state machine server-side.
  const moveToPending = (okKey: string) => runStateAction(async () => {
    const latest = await PermissionBackend.getPermission(permission.owner, permission.name);
    if (latest.status !== "ok" || !latest.data) return { status: "error", msg: latest.msg };
    return PermissionBackend.updatePermission(permission.owner, permission.name, { ...latest.data, state: "Pending" });
  }, okKey);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await PermissionBackend.updatePermission(owner!, name!, permission);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess"));
        setSaved(true);
        setOriginalJson(JSON.stringify(permission));
        setIsAddMode(false);
        invalidateList();
        if (permission.name !== name) {
          navigate(`/permissions/${permission.owner}/${permission.name}`, { replace: true });
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
      const res = await PermissionBackend.updatePermission(owner!, name!, permission);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess"));
        invalidateList();
        navigate("/permissions");
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
          modal.toast(res.msg || t("common.deleteFailed"), "error");
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
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("permissions.title")}`}
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

      {/* Basic Info */}
      <FormSection title={t("permissions.section.basic")}>
        <FormField label={t("field.owner")}>
          {isAdmin ? (
            <SingleSearchSelect value={permission.owner} options={orgOptions} onChange={(v) => set("owner", v)} placeholder={t("common.search")} />
          ) : (
            <input value={permission.owner} disabled className={inputClass} />
          )}
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={permission.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={permission.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("field.description")}>
          <input value={permission.description || ""} onChange={(e) => set("description", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("col.model")} tooltip={t("permissions.tooltip.model")}>
          <SingleSearchSelect value={permission.model} options={modelOptions} onChange={(v) => set("model", v)} placeholder={t("common.search")} />
        </FormField>
        <FormField label={t("permissions.field.adapter")} tooltip={t("permissions.tooltip.adapter")}>
          <SingleSearchSelect value={permission.adapter} options={adapterOptions} onChange={(v) => set("adapter", v)} placeholder={t("common.search")} />
        </FormField>
      </FormSection>

      {/* Members */}
      <FormSection title={t("permissions.section.members")}>
        <FormField label={t("roles.field.users")} tooltip={t("permissions.tooltip.users")} span="full">
          <MultiSearchSelect selected={permission.users || []} options={userOptions} onChange={(v) => set("users", v)} placeholder={t("common.search")} />
        </FormField>
        <FormField label={t("roles.field.groups")} tooltip={t("permissions.tooltip.groups")} span="full">
          <MultiSearchSelect selected={permission.groups || []} options={groupOptions} onChange={(v) => set("groups", v)} placeholder={t("common.search")} />
        </FormField>
        <FormField label={t("roles.field.roles")} tooltip={t("permissions.tooltip.roles")} span="full">
          <MultiSearchSelect selected={permission.roles || []} options={roleOptions} onChange={(v) => set("roles", v)} placeholder={t("common.search")} />
        </FormField>
        <FormField label={t("roles.field.domains")} tooltip={t("permissions.tooltip.domains")} span="full">
          <MultiSearchSelect selected={permission.domains || []} options={(permission.domains || []).map((d) => ({ value: d, label: d }))} onChange={(v) => set("domains", v)} placeholder={t("roles.field.domainsPlaceholder")} />
        </FormField>
      </FormSection>

      {/* Resources & Actions */}
      <FormSection title={t("permissions.section.resources")}>
        <FormField label={t("permissions.field.resourceType")} tooltip={t("permissions.tooltip.resourceType")}>
          <SimpleSelect value={permission.resourceType} options={RESOURCE_TYPE_OPTIONS} onChange={(v) => { set("resourceType", v); set("resources", []); set("actions", []); }} />
        </FormField>
        <FormField label={t("permissions.field.resources")} tooltip={t("permissions.tooltip.resources")} span="full">
          <MultiSearchSelect selected={permission.resources || []} options={resourceOpts} onChange={(v) => set("resources", v)} placeholder={isCustom || isAPI ? t("permissions.field.resourcesCustomPlaceholder") : t("common.search")} />
        </FormField>
        <FormField label={t("permissions.field.actions")} tooltip={t("permissions.tooltip.actions")} span="full">
          <MultiSearchSelect selected={permission.actions || []} options={actionOpts} onChange={(v) => set("actions", v)} placeholder={t("common.search")} />
        </FormField>
        <FormField label={t("permissions.field.effect")} tooltip={t("permissions.tooltip.effect")}>
          <SimpleSelect value={permission.effect} options={EFFECT_OPTIONS.map((o) => ({ value: o.value, label: t(`permissions.effect${o.label}` as any) }))} onChange={(v) => set("effect", v)} />
        </FormField>
        <FormField label={t("col.isEnabled")}>
          <Switch checked={permission.isEnabled} onChange={(v) => set("isEnabled", v)} />
        </FormField>
      </FormSection>

      {/* Approval */}
      <FormSection title={t("permissions.section.approval")}>
        <FormField label={t("permissions.field.submitter")} tooltip={t("permissions.tooltip.submitter")}>
          <input value={permission.submitter || ""} disabled className={inputClass} />
        </FormField>
        <FormField label={t("permissions.field.approver")} tooltip={t("permissions.tooltip.approver")}>
          <input value={permission.approver || ""} disabled className={inputClass} />
        </FormField>
        <FormField label={t("permissions.field.approveTime")}>
          <input value={permission.approveTime ? new Date(permission.approveTime).toLocaleString() : "\u2014"} disabled className={inputClass} />
        </FormField>
        <FormField label={t("permissions.field.state")} tooltip={t("permissions.tooltip.state")}>
          <div className="flex flex-wrap items-center gap-2">
            <PermissionStateBadge state={permission.state} />
            {!isAddMode && permission.state === "Pending" && (
              <>
                <button type="button" onClick={handleApprove} disabled={!canApprove || actionBusy} title={canApprove ? undefined : t("permissions.adminOnly")} className="rounded px-2 py-1 text-[12px] font-medium text-success hover:bg-success/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">{t("permissions.approve")}</button>
                <button type="button" onClick={handleReject} disabled={!canApprove || actionBusy} title={canApprove ? undefined : t("permissions.adminOnly")} className="rounded px-2 py-1 text-[12px] font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">{t("permissions.reject")}</button>
              </>
            )}
            {!isAddMode && permission.state === "Approved" && canApprove && (
              <button type="button" onClick={() => moveToPending("permissions.revokeSuccess")} disabled={actionBusy} className="rounded px-2 py-1 text-[12px] font-medium text-warning hover:bg-warning/10 transition-colors disabled:opacity-30">{t("permissions.revoke")}</button>
            )}
            {!isAddMode && permission.state === "Rejected" && (canApprove || isSubmitter) && (
              <button type="button" onClick={() => moveToPending("permissions.resubmitSuccess")} disabled={actionBusy} className="rounded px-2 py-1 text-[12px] font-medium text-accent hover:bg-accent/10 transition-colors disabled:opacity-30">{t("permissions.resubmit")}</button>
            )}
          </div>
          <p className="mt-1 text-[12px] text-text-muted">{t("permissions.stateChangeHint")}</p>
        </FormField>
        {permission.state === "Rejected" && (
          <FormField label={t("permissions.field.rejectReason")} span="full">
            <p className="text-[13px] text-danger whitespace-pre-wrap">{permission.rejectReason || "—"}</p>
          </FormField>
        )}
        {!isAddMode && (
          <FormField label={t("permissions.approvalHistory")} span="full">
            {logs.length === 0 ? (
              <p className="text-[12px] text-text-muted">{t("permissions.approvalHistoryEmpty")}</p>
            ) : (
              <ul className="space-y-1 text-[12px] text-text-secondary">
                {logs.map((l) => (
                  <li key={l.id} className="font-mono">
                    {new Date(l.createdTime).toLocaleString()} · {l.operator} · {l.fromState || "—"} → {l.toState}{l.reason ? ` · ${l.reason}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </FormField>
        )}
      </FormSection>
    </motion.div>
  );
}
