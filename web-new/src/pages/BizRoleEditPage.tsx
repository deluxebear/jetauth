import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, LogOut, Plus, X, Users, Shield, Info } from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as BizBackend from "../backend/BizBackend";
import * as UserBackend from "../backend/UserBackend";
import type { BizRole } from "../backend/BizBackend";
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

  // Sibling roles for inheritance
  const [siblingRoles, setSiblingRoles] = useState<{ value: string; label: string }[]>([]);
  const [showAddRole, setShowAddRole] = useState(false);

  // Load role (or create new)
  useEffect(() => {
    if (isNew) {
      const r = BizBackend.newBizRole(owner!, appName!);
      setRole(r);
      setOriginalJson(JSON.stringify(r));
      setLoading(false);
    } else {
      BizBackend.getBizRole(owner!, appName!, name!).then((res) => {
        if (res.status === "ok" && res.data) {
          setRole(res.data);
          setOriginalJson(JSON.stringify(res.data));
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

  // Load sibling roles
  useEffect(() => {
    if (!owner || !appName) return;
    BizBackend.getBizRoles(owner!, appName!).then((res) => {
      if (res.status === "ok" && res.data) {
        setSiblingRoles(
          res.data
            .filter((r) => r.name !== name)
            .map((r) => ({ value: r.name, label: r.displayName || r.name }))
        );
      }
    });
  }, [owner, appName, name]);

  const isDirty = !!role && originalJson !== "" && JSON.stringify(role) !== originalJson;
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

  const handleSave = async () => {
    setSaving(true);
    try {
      let res;
      if (isAddMode && isNew) {
        res = await BizBackend.addBizRole(role);
      } else {
        res = await BizBackend.updateBizRole(owner!, appName!, name || role.name, role);
      }
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(role));
        setIsAddMode(false);
        if (isNew) {
          navigate(`${backPath}/roles/${role.name}`, { replace: true });
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
      let res;
      if (isAddMode && isNew) {
        res = await BizBackend.addBizRole(role);
      } else {
        res = await BizBackend.updateBizRole(owner!, appName!, name || role.name, role);
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
    const userCount = role.users?.length ?? 0;
    const msg = userCount > 0
      ? `${t("common.confirmDelete")}\n\n${t("authz.role.deleteHasUsers" as any).replace("{count}", String(userCount))}`
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

  const getUserInfo = (userId: string) => orgUsers.find((u) => u.value === userId);
  const getInitial = (s: string) => {
    const name = s.includes("/") ? s.split("/")[1] : s;
    return name.charAt(0).toUpperCase();
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

      <div>
        {/* Basic Info */}
        <FormSection title={t("authz.role.section.basic" as any)}>
          <FormField label={t("field.name" as any)}>
            <input className={monoInputClass} value={role.name} onChange={(e) => set("name", e.target.value)} />
          </FormField>
          <FormField label={t("field.displayName" as any)}>
            <input className={inputClass} value={role.displayName} onChange={(e) => set("displayName", e.target.value)} />
          </FormField>
          <FormField label={t("field.description" as any)} span="full">
            <textarea className={`${inputClass} min-h-[72px] resize-y`} value={role.description} onChange={(e) => set("description", e.target.value)} />
          </FormField>
          <FormField label={t("field.isEnabled" as any)} span="full">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-text-muted">{t("authz.role.enabledHelp" as any)}</p>
              <Switch checked={role.isEnabled} onChange={(v) => set("isEnabled", v)} />
            </div>
          </FormField>
        </FormSection>

        {/* User Assignment */}
        <FormSection
          title={t("authz.role.section.users" as any)}
          action={
            <button onClick={() => setShowAddUser(true)} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              <Plus size={14} /> {t("authz.role.addUsers" as any)}
            </button>
          }
        >
          <div className="col-span-2">
            {role.users.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-text-muted">{t("authz.role.noUsers" as any)}</div>
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
                      <button onClick={() => removeUser(userId)} className="rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </FormSection>

        {/* Role Inheritance */}
        <FormSection
          title={t("authz.role.section.inheritance" as any)}
          action={
            <button onClick={() => setShowAddRole(true)} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              <Plus size={14} /> {t("authz.role.addRole" as any)}
            </button>
          }
        >
          <div className="col-span-2">
            {role.roles.length === 0 ? (
              <div className="py-6 text-center text-[13px] text-text-muted">{t("authz.role.noSubRoles" as any)}</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {role.roles.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 border border-border px-3 py-1.5 text-[13px] font-medium">
                    <Shield size={14} className="text-text-muted" />
                    {r}
                    <button onClick={() => removeSubRole(r)} className="text-text-muted hover:text-danger transition-colors">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 flex items-center gap-1 text-[11px] text-text-muted">
              <Info size={14} /> {t("authz.role.inheritHelp" as any)}
            </p>
          </div>
        </FormSection>

        {/* Properties (JSON) */}
        <FormSection title={t("authz.role.section.properties" as any)}>
          <FormField label={t("authz.role.propertiesHelp" as any)} span="full">
            <textarea
              className={`${monoInputClass} min-h-[120px] resize-y`}
              value={role.properties}
              onChange={(e) => set("properties", e.target.value)}
              placeholder='{"dataScope": {"orders": "department"}}'
            />
          </FormField>
        </FormSection>
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddUser(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)]"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[15px] font-semibold">{t("authz.role.selectUsers" as any)}</h3>
              <button onClick={() => setShowAddUser(false)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><X size={16} /></button>
            </div>
            <div className="px-5 py-3 border-b border-border-subtle">
              <input className={inputClass} placeholder={t("common.search")} value={userSearch} onChange={(e) => setUserSearch(e.target.value)} autoFocus />
            </div>
            <div className="max-h-[300px] overflow-y-auto divide-y divide-border-subtle">
              {filteredUsersForAdd.map((u) => (
                <button key={u.value} onClick={() => addUser(u.value)} className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2 transition-colors text-left">
                  <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(u.value)} flex items-center justify-center text-white text-[10px] font-semibold`}>
                    {getInitial(u.value)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{u.displayName}</div>
                    <div className="text-[11px] text-text-muted font-mono">{u.value}</div>
                  </div>
                </button>
              ))}
              {filteredUsersForAdd.length === 0 && (
                <div className="py-8 text-center text-[13px] text-text-muted">{t("common.noData")}</div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Add SubRole Modal */}
      {showAddRole && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddRole(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
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
                  <div>
                    <div className="text-[13px] font-medium">{r.value}</div>
                    <div className="text-[11px] text-text-muted">{r.label}</div>
                  </div>
                </button>
              ))}
              {siblingRoles.filter((r) => !role.roles.includes(r.value)).length === 0 && (
                <div className="py-8 text-center text-[13px] text-text-muted">{t("common.noData")}</div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
