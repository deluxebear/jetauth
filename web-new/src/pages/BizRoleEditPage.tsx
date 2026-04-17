import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bizKeys } from "../backend/bizQueryKeys";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle, Code, Eye, Info, LogOut, Plus, Shield, ShieldCheck, ShieldX, Trash2, X,
} from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as BizBackend from "../backend/BizBackend";
import type { BizRole, BizPermission, BizRoleScopeKind } from "../backend/BizBackend";
import BizRoleMemberTable from "../components/BizRoleMemberTable";
import BizRoleInheritancePicker from "../components/BizRoleInheritancePicker";
import { friendlyError } from "../utils/errorHelper";

// The route is /authorization/:owner/:appName/roles/:name — the new backend reads by numeric id.
// On edit, we fetch the full role list for the app, then locate the row by name to obtain its id.
// That list is already used to populate the inheritance picker's candidate pool, so no extra cost.
export default function BizRoleEditPage() {
  const { owner, appName, name } = useParams<{ owner: string; appName: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !name || name === "new";
  const [isAddMode, setIsAddMode] = useState(isNew || (location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();

  const queryClient = useQueryClient();

  // Shared query key with AppAuthorizationPage → navigating back from there
  // hits cache if staleTime hasn't elapsed (no loading spinner on fast back).
  const rolesQuery = useQuery({
    enabled: !!owner && !!appName,
    queryKey: bizKeys.roles(owner, appName),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await BizBackend.getBizRoles(owner!, appName!);
      return res.status === "ok" && res.data ? res.data : [];
    },
  });

  const [role, setRole] = useState<BizRole | null>(null);
  const [originalJson, setOriginalJson] = useState("");
  const [saved, setSaved] = useState(false);

  // Properties editor
  const [propsMode, setPropsMode] = useState<"visual" | "json">("visual");
  const [propsEntries, setPropsEntries] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => { if (saved) { const timer = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(timer); } }, [saved]);

  // Deep-link hash anchors (#members, #permissions) from the roles list page.
  // Wait one paint after role data settles so target nodes exist, then scroll
  // smoothly. Re-run whenever the hash changes so clicking the same anchor
  // from list → already-open edit page still moves focus.
  useEffect(() => {
    if (!location.hash) return;
    if (!role?.id) return; // target nodes are gated on role.id
    const id = location.hash.slice(1);
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(raf);
  }, [location.hash, role?.id]);

  const initPropsEntries = (props: string) => {
    if (!props) { setPropsEntries([]); return; }
    try {
      const obj = JSON.parse(props);
      if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
        setPropsEntries(Object.entries(obj).map(([k, v]) => ({ key: k, value: typeof v === "string" ? v : JSON.stringify(v) })));
      } else {
        setPropsMode("json");
      }
    } catch {
      setPropsMode("json");
    }
  };

  // Populate the editable `role` from the roles-query once data arrives. We
  // intentionally only seed when `role` is still null so a background
  // refetch never clobbers the admin's in-progress edits.
  useEffect(() => {
    if (role || !owner || !appName) return;
    if (isNew) {
      const r = BizBackend.newBizRole(owner, appName);
      setRole(r);
      setOriginalJson(JSON.stringify(r));
      setPropsEntries([]);
      return;
    }
    if (rolesQuery.isLoading) return;
    const list = rolesQuery.data ?? [];
    const found = list.find((r) => r.name === name);
    if (found) {
      setRole(found);
      setOriginalJson(JSON.stringify(found));
      initPropsEntries(found.properties);
    } else if (rolesQuery.isSuccess) {
      // Only complain once the list actually loaded — an intermediate empty
      // array while loading must not trigger a spurious not-found toast.
      modal.toast((t("bizRole.notFound") || "Role not found: {name}").replace("{name}", name || ""), "error");
    }
  }, [role, rolesQuery.data, rolesQuery.isLoading, rolesQuery.isSuccess, isNew, owner, appName, name, modal, t]);

  const allAppRoles = rolesQuery.data ?? [];

  const childrenQuery = useQuery({
    enabled: !!role?.id,
    queryKey: bizKeys.roleChildren(role?.id),
    queryFn: async () => {
      const res = await BizBackend.listRoleChildren(role!.id!);
      return res.status === "ok" && res.data ? res.data : [];
    },
  });
  const children = childrenQuery.data ?? [];

  const permsQuery = useQuery({
    enabled: !!role?.id && !!role?.organization && !!role?.name,
    queryKey: bizKeys.rolePermissions(role?.organization, role?.name),
    queryFn: async () => {
      const res = await BizBackend.listPermissionsByRole(role!.organization, role!.name);
      return res.status === "ok" && res.data ? res.data : [];
    },
  });
  const permsGrantedToRole = permsQuery.data ?? [];

  const loading = !role && (rolesQuery.isLoading || (!isNew && rolesQuery.isPending));

  const isDirty = useMemo(() => !!role && originalJson !== "" && JSON.stringify(role) !== originalJson, [role, originalJson]);

  // All remaining hooks (useMutation, derived handlers) MUST run before any
  // early return so hook order is stable across renders. Their bodies still
  // guard against `role` being null.
  const saveMutation = useMutation({
    mutationFn: (toSave: BizRole) =>
      isAddMode && isNew
        ? BizBackend.addBizRole(toSave)
        : BizBackend.updateBizRole(role!.id!, toSave),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => BizBackend.deleteBizRole(id),
    onSuccess: (res) => {
      if (res.status === "ok") {
        invalidateRoles();
        navigate(backPath);
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    },
    onError: (err: Error) => modal.toast(err.message || t("common.error"), "error"),
  });

  const showBanner = !isAddMode && isDirty;
  const saving = saveMutation.isPending;

  // Back / save-and-exit return to the roles list tab; deep-link after new-
  // save uses editBase without the tab query. Defined here (before the
  // early return) because saveMutation handlers below reference them.
  const backPath = `/authorization/${owner}/${appName}?tab=roles`;
  const editBase = `/authorization/${owner}/${appName}`;

  const invalidateRoles = () => {
    queryClient.invalidateQueries({ queryKey: bizKeys.roles(owner, appName) });
    // App's updatedTime bumps when policies rebuild → refresh app config too.
    queryClient.invalidateQueries({ queryKey: bizKeys.app(owner, appName) });
  };

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

  const setScope = (kind: BizRoleScopeKind) => {
    setRole((prev) => {
      if (!prev) return prev;
      // When switching to org-scope we clear appName per backend contract; when back to app-scope
      // we restore it from the route. Backend also enforces this (object/biz_role.go).
      if (kind === "org") return { ...prev, scopeKind: kind, appName: "" };
      return { ...prev, scopeKind: kind, appName: appName! };
    });
  };

  const prepareRoleForSave = (r: BizRole): BizRole => {
    if (propsMode === "visual") {
      const cleaned = propsEntries.filter((e) => e.key.trim() !== "");
      setPropsEntries(cleaned);
      const obj: Record<string, unknown> = {};
      for (const e of cleaned) {
        try { obj[e.key] = JSON.parse(e.value); } catch { obj[e.key] = e.value; }
      }
      const props = Object.keys(obj).length > 0 ? JSON.stringify(obj, null, 2) : "";
      return { ...r, properties: props };
    }
    return r;
  };

  const handleSave = async () => {
    const toSave = prepareRoleForSave(role);
    setRole(toSave);
    try {
      const res = await saveMutation.mutateAsync(toSave);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess") || "Saved");
        setSaved(true);
        setOriginalJson(JSON.stringify(toSave));
        setIsAddMode(false);
        invalidateRoles();
        if (isNew) {
          // After create, navigate to the edit URL by name (router resolves id via list again).
          navigate(`${editBase}/roles/${toSave.name}`, { replace: true });
        }
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed") || "Save failed", "error");
    }
  };

  const handleSaveAndExit = async () => {
    const toSave = prepareRoleForSave(role);
    try {
      const res = await saveMutation.mutateAsync(toSave);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess") || "Saved");
        invalidateRoles();
        navigate(backPath);
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed") || "Save failed", "error");
    }
  };

  const handleBack = () => navigate(backPath);

  const handleDelete = () => {
    if (!role.id) return;
    modal.showConfirm(t("common.confirmDelete") || "Confirm delete?", () => {
      deleteMutation.mutate(role.id!);
    });
  };

  // Properties visual editor helpers
  const syncPropsToRole = (entries: { key: string; value: string }[]) => {
    const obj: Record<string, unknown> = {};
    for (const e of entries) {
      if (!e.key) continue;
      try { obj[e.key] = JSON.parse(e.value); } catch { obj[e.key] = e.value; }
    }
    set("properties", Object.keys(obj).length > 0 ? JSON.stringify(obj, null, 2) : "");
  };
  const addPropsEntry = () => setPropsEntries((prev) => [...prev, { key: "", value: "" }]);
  const updatePropsEntry = (idx: number, field: "key" | "value", val: string) => {
    const next = propsEntries.map((e, i) => i === idx ? { ...e, [field]: val } : e);
    setPropsEntries(next);
    syncPropsToRole(next);
  };
  const removePropsEntry = (idx: number) => {
    const next = propsEntries.filter((_, i) => i !== idx);
    setPropsEntries(next);
    syncPropsToRole(next);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <StickyEditHeader
        title={`${isAddMode ? (t("common.add") || "Add") : (t("common.edit") || "Edit")} ${t("bizRole.editTitle") || "Role"}`}
        subtitle={`${appName} / ${isNew ? (t("common.add") || "new") : name}`}
        onBack={handleBack}
      >
        {!isNew && (
          <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
            <Trash2 size={14} /> {t("common.delete") || "Delete"}
          </button>
        )}
        <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save") || "Save"} />
        <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
          {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
          {t("common.saveAndExit") || "Save & exit"}
        </button>
      </StickyEditHeader>

      {showBanner && <UnsavedBanner isAddMode={isAddMode} />}

      {!role.isEnabled && !isAddMode && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[13px] text-amber-700 dark:text-amber-400">
          <AlertTriangle size={16} />
          {t("bizRole.disabledBanner") || "This role is disabled — it will not be evaluated at enforce time."}
        </div>
      )}

      {/* ── Basic info ── */}
      <FormSection title={t("bizRole.section.basic") || "Basic info"}>
        <FormField label={t("field.name") || "Name"}>
          <input
            className={monoInputClass}
            value={role.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="admin"
            disabled={!isAddMode}
          />
        </FormField>
        <FormField label={t("field.displayName") || "Display name"}>
          <input className={inputClass} value={role.displayName} onChange={(e) => set("displayName", e.target.value)} />
        </FormField>
        <FormField label={t("field.description") || "Description"} span="full">
          <textarea className={`${inputClass} min-h-[72px] resize-y`} value={role.description} onChange={(e) => set("description", e.target.value)} />
        </FormField>

        {/* Scope selector */}
        <FormField label={t("bizRole.scope.label") || "Scope"} span="full">
          <div className="space-y-2">
            <ScopeRadio
              checked={role.scopeKind === "app"}
              onSelect={() => setScope("app")}
              title={t("bizRole.scope.appTitle") || `Only this app — ${appName}`}
              hint={t("bizRole.scope.appHint") || "Visible only within this app."}
              disabled={!isAddMode}
              appName={appName}
            />
            <ScopeRadio
              checked={role.scopeKind === "org"}
              onSelect={() => setScope("org")}
              title={t("bizRole.scope.orgTitle") || "Org-shared — reusable across all apps in this org"}
              hint={t("bizRole.scope.orgHint") || "Granted to any app that references this role."}
              disabled={!isAddMode}
            />
          </div>
          {!isAddMode && (
            <p className="mt-2 flex items-center gap-1 text-[11px] text-text-muted">
              <Info size={12} />
              {t("bizRole.scope.immutable") || "Scope cannot be changed after creation."}
            </p>
          )}
        </FormField>

        <FormField label={t("field.isEnabled") || "Enabled"} span="full">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-text-muted">{t("bizRole.enabledHelp") || "Disabled roles are ignored during enforcement."}</p>
            <Switch checked={role.isEnabled} onChange={(v) => set("isEnabled", v)} />
          </div>
        </FormField>
      </FormSection>

      {/* ── Members ── (skipped on add mode since role doesn't exist yet) */}
      {/* id="members" — deep-link target from roles list "成员" count click */}
      {!(isAddMode && isNew) && role.id && (
        <div id="members" className="scroll-mt-24">
          <BizRoleMemberTable roleId={role.id} organization={role.organization} />
        </div>
      )}

      {/* ── Inherits from (parents) ── */}
      {!(isAddMode && isNew) && role.id && (
        <BizRoleInheritancePicker
          roleId={role.id}
          organization={role.organization}
          candidatePool={allAppRoles}
        />
      )}

      {/* ── Inherited by (children) ── read-only */}
      {!(isAddMode && isNew) && role.id && (
        <div className="rounded-xl border border-border bg-surface-1">
          <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30">
            <h3 className="text-[13px] font-semibold text-text-primary">
              {t("bizRole.inheritedBy.title") || "Inherited by"}
              <span className="ml-2 text-text-muted font-normal">({children.length})</span>
            </h3>
          </div>
          <div className="p-4">
            {children.length === 0 ? (
              <div className="py-4 text-center text-[13px] text-text-muted">
                {t("bizRole.inheritedBy.empty") || "No roles inherit from this one."}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {children.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 border border-border px-3 py-1.5 text-[13px]">
                    <Shield size={14} className="text-text-muted" />
                    <span className="font-mono">{c.name}</span>
                    {c.displayName && <span className="text-text-muted text-[11px]">({c.displayName})</span>}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 flex items-center gap-1 text-[11px] text-text-muted">
              <Info size={12} />
              {t("bizRole.inheritedBy.hint") || "Read-only. Edit the child role to change its inheritance."}
            </p>
          </div>
        </div>
      )}

      {/* ── Permissions granted to this role (reverse lookup) ── */}
      {/* id="permissions" — deep-link target from roles list "权限" count click */}
      {!(isAddMode && isNew) && role.id && (
        <div id="permissions" className="scroll-mt-24 rounded-xl border border-border bg-surface-1">
          <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30">
            <h3 className="text-[13px] font-semibold text-text-primary">
              {t("bizRole.grantedPerms.title") || "Permissions granted to this role"}
              <span className="ml-2 text-text-muted font-normal">({permsGrantedToRole.length})</span>
            </h3>
          </div>
          <div className="p-4">
            {permsGrantedToRole.length === 0 ? (
              <div className="py-4 text-center text-[13px] text-text-muted">
                <ShieldX size={22} className="mx-auto mb-2 text-text-muted/50" />
                {t("bizRole.grantedPerms.empty") || "This role is not referenced by any permission."}
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {permsGrantedToRole.map((p) => (
                  <div key={p.id ?? p.name} className="py-2 flex items-start gap-2">
                    <span className={`mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      p.effect === "Allow" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"
                    }`}>
                      {p.effect === "Allow" ? <ShieldCheck size={10} /> : <ShieldX size={10} />}
                      {p.effect}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium font-mono truncate">{p.displayName || p.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {(p.resources ?? []).map((r, i) => (
                          <span key={`r-${i}`} className="inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-text-secondary">{r}</span>
                        ))}
                        {(p.actions ?? []).map((a, i) => (
                          <span key={`a-${i}`} className="inline-block rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent">{a}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Properties ── */}
      <FormSection
        title={t("bizRole.section.properties") || "Properties"}
        action={
          <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-0.5">
            <button
              onClick={() => {
                if (role.properties) {
                  try {
                    const obj = JSON.parse(role.properties);
                    if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
                      setPropsEntries(Object.entries(obj).map(([k, v]) => ({ key: k, value: typeof v === "string" ? v : JSON.stringify(v) })));
                    }
                  } catch {
                    modal.toast(t("bizRole.properties.parseError") || "Cannot parse as JSON object", "error");
                    return;
                  }
                } else { setPropsEntries([]); }
                setPropsMode("visual");
              }}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${propsMode === "visual" ? "bg-surface-1 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
            >
              <Eye size={12} /> {t("bizRole.properties.visual") || "Visual"}
            </button>
            <button
              onClick={() => setPropsMode("json")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${propsMode === "json" ? "bg-surface-1 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
            >
              <Code size={12} /> {t("bizRole.properties.json") || "JSON"}
            </button>
          </div>
        }
      >
        <div className="col-span-2">
          {propsMode === "visual" ? (
            <div className="space-y-2">
              {propsEntries.length === 0 ? (
                <div className="py-4 text-center text-[13px] text-text-muted">{t("bizRole.properties.empty") || "No properties yet."}</div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_32px] gap-2 text-[11px] font-medium text-text-muted uppercase tracking-wider px-1">
                    <span>{t("bizRole.properties.key") || "Key"}</span>
                    <span>{t("bizRole.properties.value") || "Value"}</span>
                    <span />
                  </div>
                  {propsEntries.map((entry, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                      <input className={monoInputClass} value={entry.key} onChange={(e) => updatePropsEntry(idx, "key", e.target.value)} placeholder="key" />
                      <input className={monoInputClass} value={entry.value} onChange={(e) => updatePropsEntry(idx, "value", e.target.value)} placeholder="value" />
                      <button onClick={() => removePropsEntry(idx)} className="rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={addPropsEntry} className="flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover transition-colors">
                <Plus size={14} /> {t("bizRole.properties.addEntry") || "Add entry"}
              </button>
            </div>
          ) : (
            <textarea
              className={`${monoInputClass} min-h-[120px] resize-y`}
              value={role.properties}
              onChange={(e) => set("properties", e.target.value)}
              placeholder='{"dataScope": {"orders": "department"}}'
            />
          )}
        </div>
      </FormSection>
    </motion.div>
  );
}

function ScopeRadio({
  checked,
  onSelect,
  title,
  hint,
  disabled,
  appName,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
  disabled?: boolean;
  appName?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        checked ? "border-accent bg-accent/5" : "border-border hover:bg-surface-2"
      } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${checked ? "border-accent" : "border-border"}`}>
          {checked && <div className="w-2 h-2 rounded-full bg-accent" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-text-primary">
            {title}
            {appName && !title.includes(appName) && (
              <span className="ml-1 font-mono text-text-muted">{appName}</span>
            )}
          </div>
          <div className="text-[12px] text-text-muted mt-0.5">{hint}</div>
        </div>
      </div>
    </button>
  );
}
