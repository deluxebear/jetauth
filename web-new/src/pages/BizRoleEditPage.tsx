import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2, LogOut, Plus, X, Users, Shield, Info, Check,
  ShieldCheck, ShieldX, AlertTriangle, Eye, Code,
} from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as BizBackend from "../backend/BizBackend";
import * as UserBackend from "../backend/UserBackend";
import type { BizRole, BizPermission } from "../backend/BizBackend";
import { friendlyError } from "../utils/errorHelper";

export default function BizRoleEditPage() {
  const { owner, appName, name } = useParams<{ owner: string; appName: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !name || name === "new";
  const [isAddMode, setIsAddMode] = useState(isNew || (location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [role, setRole] = useState<BizRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const timer = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(timer); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");
  const [loading, setLoading] = useState(true);

  // Users for add-user modal
  const [orgUsers, setOrgUsers] = useState<{ value: string; label: string; displayName: string; email: string }[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  // Sibling roles for inheritance
  const [siblingRoles, setSiblingRoles] = useState<{ value: string; label: string; userCount: number; permCount: number }[]>([]);
  const [showAddRole, setShowAddRole] = useState(false);

  // Permission preview
  const [permissions, setPermissions] = useState<BizPermission[]>([]);

  // Properties editor mode
  const [propsMode, setPropsMode] = useState<"visual" | "json">("visual");
  const [propsEntries, setPropsEntries] = useState<{ key: string; value: string }[]>([]);

  // Parse properties string into visual entries
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

  // Load role (or create new)
  useEffect(() => {
    if (isNew) {
      const r = BizBackend.newBizRole(owner!, appName!);
      setRole(r);
      setOriginalJson(JSON.stringify(r));
      setPropsEntries([]);
      setLoading(false);
    } else {
      BizBackend.getBizRole(owner!, appName!, name!).then((res) => {
        if (res.status === "ok" && res.data) {
          setRole(res.data);
          setOriginalJson(JSON.stringify(res.data));
          initPropsEntries(res.data.properties);
        }
      }).finally(() => setLoading(false));
    }
  }, [owner, appName, name, isNew]);

  // Load org users
  useEffect(() => {
    if (!owner) return;
    UserBackend.getUsers({ owner: owner! }).then((res) => {
      if (res.status === "ok" && res.data) {
        setOrgUsers(res.data.map((u: any) => ({
          value: `${u.owner}/${u.name}`,
          label: `${u.owner}/${u.name}`,
          displayName: u.displayName || u.name,
          email: u.email || "",
        })));
      }
    });
  }, [owner]);

  // Load sibling roles + permissions for preview (parallel to avoid race)
  useEffect(() => {
    if (!owner || !appName) return;
    Promise.all([
      BizBackend.getBizRoles(owner!, appName!),
      BizBackend.getBizPermissions(owner!, appName!),
    ]).then(([rolesRes, permsRes]) => {
      const allPerms = (permsRes.status === "ok" && permsRes.data) ? permsRes.data : [];
      setPermissions(allPerms);
      if (rolesRes.status === "ok" && rolesRes.data) {
        setSiblingRoles(
          rolesRes.data
            .filter((r) => r.name !== name)
            .map((r) => ({
              value: r.name,
              label: r.displayName || r.name,
              userCount: r.users?.length ?? 0,
              permCount: allPerms.filter((p) => p.roles?.includes(r.name)).length,
            }))
        );
      }
    });
  }, [owner, appName, name]);

  // Permissions related to this role
  const rolePermissions = useMemo(() => {
    if (!role) return [];
    return permissions.filter((p) => p.roles?.includes(role.name));
  }, [permissions, role?.name]);

  const isDirty = useMemo(() => !!role && originalJson !== "" && JSON.stringify(role) !== originalJson, [role, originalJson]);
  const showBanner = !isAddMode && isDirty;

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

  const backPath = `/authorization/${owner}/${appName}`;

  // Clean properties: remove empty-key entries before saving
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
    setSaving(true);
    try {
      const toSave = prepareRoleForSave(role);
      setRole(toSave);
      let res;
      if (isAddMode && isNew) {
        res = await BizBackend.addBizRole(toSave);
      } else {
        res = await BizBackend.updateBizRole(owner!, appName!, name || toSave.name, toSave);
      }
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(toSave));
        setIsAddMode(false);
        if (isNew) {
          navigate(`${backPath}/roles/${toSave.name}`, { replace: true });
        }
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const toSave = prepareRoleForSave(role);
      let res;
      if (isAddMode && isNew) {
        res = await BizBackend.addBizRole(toSave);
      } else {
        res = await BizBackend.updateBizRole(owner!, appName!, name || toSave.name, toSave);
      }
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        navigate(backPath);
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    navigate(backPath);
  };

  const handleDelete = () => {
    const warnings: string[] = [];
    const userCount = role.users?.length ?? 0;
    const subRoleCount = role.roles?.length ?? 0;
    if (userCount > 0) {
      warnings.push((t("authz.role.deleteHasUsers" as any) as string).replace("{count}", String(userCount)));
    }
    if (subRoleCount > 0) {
      warnings.push((t("authz.role.deleteHasSubRoles" as any) as string).replace("{count}", String(subRoleCount)).replace("{roles}", role.roles.join(", ")));
    }
    const msg = warnings.length > 0
      ? `${t("common.confirmDelete")}\n\n${warnings.join("\n\n")}`
      : t("common.confirmDelete");
    modal.showConfirm(msg, async () => {
      const res = await BizBackend.deleteBizRole(role);
      if (res.status === "ok") {
        navigate(backPath);
      } else {
        modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    });
  };

  // Toggle isEnabled with confirmation when disabling
  const handleToggleEnabled = (newVal: boolean) => {
    if (!newVal && role.users.length > 0) {
      modal.showConfirm(
        (t("authz.role.disableConfirm" as any) as string).replace("{count}", String(role.users.length)),
        () => set("isEnabled", false),
      );
    } else {
      set("isEnabled", newVal);
    }
  };

  // User management helpers
  const addUser = (userId: string) => {
    if (!role.users.includes(userId)) {
      set("users", [...role.users, userId]);
    }
  };
  const removeUser = (userId: string) => {
    set("users", role.users.filter((u) => u !== userId));
  };
  const addSubRole = (roleName: string) => {
    if (!role.roles.includes(roleName)) {
      set("roles", [...role.roles, roleName]);
    }
    setShowAddRole(false);
  };
  const removeSubRole = (roleName: string) => {
    set("roles", role.roles.filter((r) => r !== roleName));
  };

  // Batch add users
  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };
  const confirmBatchAdd = () => {
    const newUsers = [...role.users];
    selectedUsers.forEach((u) => { if (!newUsers.includes(u)) newUsers.push(u); });
    set("users", newUsers);
    setSelectedUsers(new Set());
    setShowAddUser(false);
  };

  const getUserInfo = (userId: string) => orgUsers.find((u) => u.value === userId);
  const getInitial = (s: string) => {
    const n = s.includes("/") ? s.split("/")[1] : s;
    return n.charAt(0).toUpperCase();
  };
  const AVATAR_COLORS = [
    "from-indigo-500 to-purple-500", "from-cyan-500 to-teal-500",
    "from-amber-500 to-orange-500", "from-rose-500 to-pink-500",
    "from-emerald-500 to-green-500", "from-blue-500 to-sky-500",
  ];
  const getAvatarColor = (s: string) => AVATAR_COLORS[Math.abs([...s].reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0)) % AVATAR_COLORS.length];

  const filteredUsersForAdd = orgUsers.filter(
    (u) => !role.users.includes(u.value) && (userSearch === "" || u.label.toLowerCase().includes(userSearch.toLowerCase()) || u.displayName.toLowerCase().includes(userSearch.toLowerCase()))
  );

  // Properties visual editor helpers — entries are state-driven, synced to role.properties on change
  const syncPropsToRole = (entries: { key: string; value: string }[]) => {
    const obj: Record<string, unknown> = {};
    for (const e of entries) {
      if (!e.key) continue;
      try { obj[e.key] = JSON.parse(e.value); } catch { obj[e.key] = e.value; }
    }
    set("properties", Object.keys(obj).length > 0 ? JSON.stringify(obj, null, 2) : "");
  };
  const addPropsEntry = () => {
    const next = [...propsEntries, { key: "", value: "" }];
    setPropsEntries(next);
    // Don't sync yet — key is empty, will sync when user types
  };
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
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("authz.role.editTitle" as any)}`}
        subtitle={`${appName} / ${isNew ? t("common.add") : name}`}
        onBack={handleBack}
      >
        {!isNew && (
          <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
            <Trash2 size={14} /> {t("common.delete")}
          </button>
        )}
        <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save")} />
        <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
          {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
          {t("common.saveAndExit" as any)}
        </button>
      </StickyEditHeader>

      {showBanner && <UnsavedBanner isAddMode={isAddMode} />}

      {/* Disabled banner */}
      {!role.isEnabled && !isAddMode && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[13px] text-amber-700 dark:text-amber-400">
          <AlertTriangle size={16} />
          {t("authz.role.disabledBanner" as any)}
        </div>
      )}

      {/* Add mode hint */}
      {isAddMode && isNew && (
        <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2.5 text-[13px] text-accent">
          <Info size={16} />
          {t("authz.role.addModeHint" as any)}
        </div>
      )}

      <div className="flex gap-6">
        {/* ── Left: Main content ── */}
        <div className="flex-1 min-w-0 space-y-0">
          {/* Basic Info */}
          <FormSection title={t("authz.role.section.basic" as any)}>
            <FormField label={t("field.name" as any)}>
              <input className={monoInputClass} value={role.name} onChange={(e) => set("name", e.target.value)} placeholder={t("authz.role.namePlaceholder" as any)} />
            </FormField>
            <FormField label={t("field.displayName" as any)}>
              <input className={inputClass} value={role.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder={t("authz.role.displayNamePlaceholder" as any)} />
            </FormField>
            <FormField label={t("field.description" as any)} span="full">
              <textarea className={`${inputClass} min-h-[72px] resize-y`} value={role.description} onChange={(e) => set("description", e.target.value)} placeholder={t("authz.role.descPlaceholder" as any)} />
            </FormField>
            <FormField label={t("field.isEnabled" as any)} span="full">
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-text-muted">{t("authz.role.enabledHelp" as any)}</p>
                <Switch checked={role.isEnabled} onChange={handleToggleEnabled} />
              </div>
            </FormField>
          </FormSection>

          {/* User Assignment — collapsed in new add mode */}
          {!(isAddMode && isNew) && (
            <FormSection
              title={`${t("authz.role.section.users" as any)} (${role.users.length})`}
              action={
                <button onClick={() => { setShowAddUser(true); setSelectedUsers(new Set()); setUserSearch(""); }} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                  <Plus size={14} /> {t("authz.role.addUsers" as any)}
                </button>
              }
            >
              <div className="col-span-2">
                {role.users.length === 0 ? (
                  <div className="py-8 text-center text-[13px] text-text-muted">
                    <Users size={24} className="mx-auto mb-2 text-text-muted/50" />
                    {t("authz.role.noUsers" as any)}
                  </div>
                ) : (
                  <div className="divide-y divide-border-subtle">
                    {role.users.map((userId) => {
                      const info = getUserInfo(userId);
                      return (
                        <div key={userId} className="flex items-center gap-3 py-2.5">
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(userId)} flex items-center justify-center text-white text-[12px] font-semibold flex-shrink-0`}>
                            {getInitial(userId)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold truncate">{info?.displayName || userId.split("/")[1]}</div>
                            <div className="text-[11px] text-text-muted font-mono">{userId}</div>
                          </div>
                          <div className="text-[12px] text-text-secondary hidden sm:block">{info?.email}</div>
                          <button onClick={() => removeUser(userId)} title={t("common.delete")} className="rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </FormSection>
          )}

          {/* Role Inheritance — collapsed in new add mode */}
          {!(isAddMode && isNew) && (
            <FormSection
              title={`${t("authz.role.section.inheritance" as any)} (${role.roles.length})`}
              action={
                <button onClick={() => setShowAddRole(true)} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                  <Plus size={14} /> {t("authz.role.addRole" as any)}
                </button>
              }
            >
              <div className="col-span-2">
                {role.roles.length === 0 ? (
                  <div className="py-6 text-center text-[13px] text-text-muted">
                    <Shield size={24} className="mx-auto mb-2 text-text-muted/50" />
                    {t("authz.role.noSubRoles" as any)}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {role.roles.map((r) => {
                      const sr = siblingRoles.find((s) => s.value === r);
                      return (
                        <span
                          key={r}
                          className="group relative inline-flex items-center gap-1.5 rounded-full bg-surface-2 border border-border px-3 py-1.5 text-[13px] font-medium"
                        >
                          <Shield size={14} className="text-text-muted" />
                          {r}
                          {sr && (
                            <span className="text-[11px] text-text-muted ml-0.5">
                              ({sr.userCount}u, {sr.permCount}p)
                            </span>
                          )}
                          <button onClick={() => removeSubRole(r)} className="text-text-muted hover:text-danger transition-colors">
                            <X size={12} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <p className="mt-3 flex items-center gap-1 text-[11px] text-text-muted">
                  <Info size={14} /> {t("authz.role.inheritHelp" as any)}
                </p>
              </div>
            </FormSection>
          )}

          {/* Properties — structured editor */}
          <FormSection
            title={t("authz.role.section.properties" as any)}
            action={
              <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-0.5">
                <button
                  onClick={() => {
                    // Re-parse from role.properties when switching to visual
                    if (role.properties) {
                      try {
                        const obj = JSON.parse(role.properties);
                        if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
                          setPropsEntries(Object.entries(obj).map(([k, v]) => ({ key: k, value: typeof v === "string" ? v : JSON.stringify(v) })));
                        }
                      } catch {
                        modal.toast(t("authz.role.properties.parseError" as any), "error");
                        return;
                      }
                    } else {
                      setPropsEntries([]);
                    }
                    setPropsMode("visual");
                  }}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${propsMode === "visual" ? "bg-surface-1 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
                >
                  <Eye size={12} /> {t("authz.role.properties.visual" as any)}
                </button>
                <button
                  onClick={() => setPropsMode("json")}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${propsMode === "json" ? "bg-surface-1 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
                >
                  <Code size={12} /> {t("authz.role.properties.json" as any)}
                </button>
              </div>
            }
          >
            <div className="col-span-2">
              {propsMode === "visual" ? (
                <div className="space-y-2">
                  {propsEntries.length === 0 ? (
                    <div className="py-4 text-center text-[13px] text-text-muted">
                      {t("authz.role.properties.empty" as any)}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_1fr_32px] gap-2 text-[11px] font-medium text-text-muted uppercase tracking-wider px-1">
                        <span>{t("authz.role.properties.key" as any)}</span>
                        <span>{t("authz.role.properties.value" as any)}</span>
                        <span />
                      </div>
                      {propsEntries.map((entry, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                          <input
                            className={monoInputClass}
                            value={entry.key}
                            onChange={(e) => updatePropsEntry(idx, "key", e.target.value)}
                            placeholder="key"
                          />
                          <input
                            className={monoInputClass}
                            value={entry.value}
                            onChange={(e) => updatePropsEntry(idx, "value", e.target.value)}
                            placeholder="value"
                          />
                          <button onClick={() => removePropsEntry(idx)} className="rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={addPropsEntry} className="flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover transition-colors">
                    <Plus size={14} /> {t("authz.role.properties.addEntry" as any)}
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
        </div>

        {/* ── Right: Summary + Permission Preview ── */}
        <div className="hidden lg:block w-[280px] flex-shrink-0 space-y-4">
          {/* Role Summary Card */}
          <div className="rounded-xl border border-border bg-surface-1 p-4 space-y-3 sticky top-[80px]">
            <h4 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">
              {t("authz.role.section.summary" as any)}
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[13px]">
                <Users size={14} className="text-text-muted" />
                <span>{(t("authz.role.summary.users" as any) as string).replace("{count}", String(role.users.length))}</span>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <Shield size={14} className="text-text-muted" />
                <span>{(t("authz.role.summary.subRoles" as any) as string).replace("{count}", String(role.roles.length))}</span>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <ShieldCheck size={14} className="text-text-muted" />
                <span>
                  {rolePermissions.length > 0
                    ? (t("authz.role.summary.permissions" as any) as string).replace("{count}", String(rolePermissions.length))
                    : t("authz.role.summary.noPermissions" as any)}
                </span>
              </div>
            </div>

            {/* Status indicator */}
            <div className="pt-2 border-t border-border-subtle">
              <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${role.isEnabled
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${role.isEnabled ? "bg-emerald-500" : "bg-amber-500"}`} />
                {role.isEnabled ? t("common.enabled") : t("common.disabled")}
              </div>
            </div>
          </div>

          {/* Permission Preview Card */}
          {!isNew && (
            <div className="rounded-xl border border-border bg-surface-1 overflow-hidden sticky top-[260px]">
              <div className="px-4 py-3 border-b border-border-subtle bg-surface-2/30">
                <h4 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">
                  {t("authz.role.section.permPreview" as any)}
                </h4>
              </div>
              <div className="p-3 max-h-[300px] overflow-y-auto">
                {rolePermissions.length === 0 ? (
                  <div className="py-4 text-center text-[12px] text-text-muted">
                    <ShieldX size={20} className="mx-auto mb-1.5 text-text-muted/50" />
                    {t("authz.role.permPreview.empty" as any)}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {rolePermissions.map((perm) => (
                      <div key={perm.name} className="rounded-lg border border-border-subtle bg-surface-0 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${perm.effect === "Allow"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-red-500/10 text-red-600 dark:text-red-400"
                          }`}>
                            {perm.effect === "Allow" ? <ShieldCheck size={10} /> : <ShieldX size={10} />}
                            {perm.effect === "Allow" ? t("authz.role.permPreview.allow" as any) : t("authz.role.permPreview.deny" as any)}
                          </span>
                          <span className="text-[12px] font-medium truncate">{perm.displayName || perm.name}</span>
                        </div>
                        {perm.resources?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {perm.resources.map((r, i) => (
                              <span key={i} className="inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-text-secondary">{r}</span>
                            ))}
                          </div>
                        )}
                        {perm.actions?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {perm.actions.map((a, i) => (
                              <span key={i} className="inline-block rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent">{a}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-center text-[10px] text-text-muted">{t("authz.role.permPreview.hint" as any)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal — batch mode */}
      <AnimatePresence>
        {showAddUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center" onKeyDown={(e) => { if (e.key === "Escape") setShowAddUser(false); }}>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowAddUser(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)]"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-[15px] font-semibold">{t("authz.role.selectUsers" as any)}</h3>
                <div className="flex items-center gap-2">
                  {selectedUsers.size > 0 && (
                    <span className="text-[12px] text-accent font-medium">
                      {(t("authz.role.selectedCount" as any) as string).replace("{count}", String(selectedUsers.size))}
                    </span>
                  )}
                  <button onClick={() => setShowAddUser(false)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><X size={16} /></button>
                </div>
              </div>
              <div className="px-5 py-3 border-b border-border-subtle">
                <input className={inputClass} placeholder={t("common.search")} value={userSearch} onChange={(e) => setUserSearch(e.target.value)} autoFocus />
              </div>
              <div className="max-h-[300px] overflow-y-auto divide-y divide-border-subtle">
                {filteredUsersForAdd.map((u) => {
                  const isSelected = selectedUsers.has(u.value);
                  return (
                    <button key={u.value} onClick={() => toggleUserSelection(u.value)} className={`w-full flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2 transition-colors text-left ${isSelected ? "bg-accent/5" : ""}`}>
                      <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? "bg-accent border-accent" : "border-border"}`}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                      <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(u.value)} flex items-center justify-center text-white text-[10px] font-semibold`}>
                        {getInitial(u.value)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">{u.displayName}</div>
                        <div className="text-[11px] text-text-muted font-mono">{u.value}</div>
                      </div>
                    </button>
                  );
                })}
                {filteredUsersForAdd.length === 0 && (
                  <div className="py-8 text-center text-[13px] text-text-muted">{t("common.noData")}</div>
                )}
              </div>
              {/* Batch confirm footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
                <button onClick={() => setShowAddUser(false)} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                  {t("common.cancel")}
                </button>
                <button
                  onClick={confirmBatchAdd}
                  disabled={selectedUsers.size === 0}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  {t("authz.role.batchAdd" as any)} ({selectedUsers.size})
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add SubRole Modal */}
      <AnimatePresence>
        {showAddRole && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center" onKeyDown={(e) => { if (e.key === "Escape") setShowAddRole(false); }}>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowAddRole(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)]"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-[15px] font-semibold">{t("authz.role.selectRole" as any)}</h3>
                <button onClick={() => setShowAddRole(false)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><X size={16} /></button>
              </div>
              <div className="max-h-[250px] overflow-y-auto divide-y divide-border-subtle">
                {siblingRoles.filter((r) => !role.roles.includes(r.value)).map((r) => (
                  <button key={r.value} onClick={() => addSubRole(r.value)} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-2 transition-colors text-left">
                    <Shield size={16} className="text-text-muted" />
                    <div className="flex-1">
                      <div className="text-[13px] font-medium">{r.value}</div>
                      <div className="text-[11px] text-text-muted">{r.label}</div>
                    </div>
                    <span className="text-[11px] text-text-muted">
                      {r.userCount}u, {r.permCount}p
                    </span>
                  </button>
                ))}
                {siblingRoles.filter((r) => !role.roles.includes(r.value)).length === 0 && (
                  <div className="py-8 text-center text-[13px] text-text-muted">{t("common.noData")}</div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
