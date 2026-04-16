import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, LogOut, Plus, X, Info, User, Shield } from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as BizBackend from "../backend/BizBackend";
import * as UserBackend from "../backend/UserBackend";
import type { BizPermission, BizAppConfig } from "../backend/BizBackend";
import { friendlyError } from "../utils/errorHelper";

// ── Field mapping: model field name → UI config ──
interface FieldConfig {
  key: string;
  label: string;
  labelKey: string;
  type: "subjects" | "resources" | "actions" | "text" | "eft";
}

function buildFieldConfigs(fields: string[], t: (k: string) => string): FieldConfig[] {
  return fields
    .filter((f) => f !== "eft") // eft handled as effect toggle in basic info
    .map((f) => {
      if (f === "sub") return { key: f, label: t("authz.perm.subjects" as any), labelKey: "authz.perm.subjects", type: "subjects" as const };
      if (f === "obj") return { key: f, label: t("authz.perm.resources" as any), labelKey: "authz.perm.resources", type: "resources" as const };
      if (f === "act") return { key: f, label: t("authz.perm.actions" as any), labelKey: "authz.perm.actions", type: "actions" as const };
      if (f === "dom") return { key: f, label: t("authz.perm.domain" as any), labelKey: "authz.perm.domain", type: "text" as const };
      return { key: f, label: f, labelKey: f, type: "text" as const };
    });
}

export default function BizPermissionEditPage() {
  const { owner, appName, name } = useParams<{ owner: string; appName: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !name || name === "new";
  const [isAddMode, setIsAddMode] = useState(isNew || (location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [perm, setPerm] = useState<BizPermission | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const timer = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(timer); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");
  const [loading, setLoading] = useState(true);

  // App config (for model text)
  const [appConfig, setAppConfig] = useState<BizAppConfig | null>(null);
  const [policyFields, setPolicyFields] = useState<string[]>(["sub", "obj", "act"]);

  // Dropdown data
  const [orgUsers, setOrgUsers] = useState<{ value: string; label: string; displayName: string }[]>([]);
  const [appRoles, setAppRoles] = useState<{ value: string; label: string; userCount: number }[]>([]);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [showCustomAction, setShowCustomAction] = useState(false);
  const [customActionValue, setCustomActionValue] = useState("");

  // Load permission (or create new)
  useEffect(() => {
    if (isNew) {
      const p = BizBackend.newBizPermission(owner!, appName!);
      setPerm(p);
      setOriginalJson(JSON.stringify(p));
      setLoading(false);
    } else {
      BizBackend.getBizPermission(owner!, appName!, name!).then((res) => {
        if (res.status === "ok" && res.data) {
          setPerm(res.data);
          setOriginalJson(JSON.stringify(res.data));
        }
      }).finally(() => setLoading(false));
    }
  }, [owner, appName, name, isNew]);

  // Load app config to get model text
  useEffect(() => {
    if (!owner || !appName) return;
    BizBackend.getBizAppConfig(`${owner}/${appName}`).then((res) => {
      if (res.status === "ok" && res.data) {
        setAppConfig(res.data);
        setPolicyFields(BizBackend.parsePolicyFields(res.data.modelText));
      }
    });
  }, [owner, appName]);

  // Load org users + app roles
  useEffect(() => {
    if (!owner) return;
    UserBackend.getUsers({ owner: owner! }).then((res) => {
      if (res.status === "ok" && res.data) {
        setOrgUsers(res.data.map((u: any) => ({
          value: `${u.owner}/${u.name}`,
          label: `${u.owner}/${u.name}`,
          displayName: u.displayName || u.name,
        })));
      }
    });
  }, [owner]);

  useEffect(() => {
    if (!owner || !appName) return;
    BizBackend.getBizRoles(owner!, appName!).then((res) => {
      if (res.status === "ok" && res.data) {
        setAppRoles(res.data.map((r) => ({
          value: r.name,
          label: r.displayName || r.name,
          userCount: r.users?.length || 0,
        })));
      }
    });
  }, [owner, appName]);

  const isDirty = !!perm && originalJson !== "" && JSON.stringify(perm) !== originalJson;
  // Only show unsaved banner in edit mode (not add mode — record doesn't exist on server yet)
  const showBanner = !isAddMode && isDirty;

  if (loading || !perm) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setPerm((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const backPath = `/authorization/${owner}/${appName}`;

  const handleSave = async () => {
    setSaving(true);
    try {
      let res;
      if (isAddMode && isNew) {
        res = await BizBackend.addBizPermission(perm);
      } else {
        res = await BizBackend.updateBizPermission(owner!, appName!, name || perm.name, perm);
      }
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(perm));
        setIsAddMode(false);
        if (isNew) {
          navigate(`${backPath}/permissions/${perm.name}`, { replace: true });
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
        res = await BizBackend.addBizPermission(perm);
      } else {
        res = await BizBackend.updateBizPermission(owner!, appName!, name || perm.name, perm);
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
    modal.showConfirm(t("common.confirmDelete"), async () => {
      const res = await BizBackend.deleteBizPermission(perm);
      if (res.status === "ok") {
        navigate(backPath);
      } else {
        modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    });
  };

  // Subject helpers
  const addSubject = (val: string, type: "user" | "role") => {
    if (type === "user" && !perm.users.includes(val)) {
      set("users", [...perm.users, val]);
    } else if (type === "role" && !perm.roles.includes(val)) {
      set("roles", [...perm.roles, val]);
    }
  };
  const removeSubject = (val: string, type: "user" | "role") => {
    if (type === "user") set("users", perm.users.filter((u) => u !== val));
    else set("roles", perm.roles.filter((r) => r !== val));
  };

  // Action helpers
  const addAction = (act: string) => {
    if (!perm.actions.includes(act)) set("actions", [...perm.actions, act]);
  };
  const removeAction = (act: string) => {
    set("actions", perm.actions.filter((a) => a !== act));
  };

  const hasEft = policyFields.includes("eft");
  const fieldConfigs = buildFieldConfigs(policyFields, t);
  const policyDefStr = `p = ${policyFields.join(", ")}`;

  const filteredSubjectsForAdd = [
    ...appRoles.filter((r) => !perm.roles.includes(r.value)).map((r) => ({ ...r, type: "role" as const })),
    ...orgUsers.filter((u) => !perm.users.includes(u.value)).map((u) => ({ value: u.value, label: u.displayName, type: "user" as const, userCount: 0 })),
  ].filter((s) => subjectSearch === "" || s.value.toLowerCase().includes(subjectSearch.toLowerCase()) || s.label.toLowerCase().includes(subjectSearch.toLowerCase()));

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("authz.perm.editTitle" as any)}`}
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
        <FormSection title={t("authz.perm.section.basic" as any)}>
          <FormField label={t("field.name" as any)}>
            <input className={monoInputClass} value={perm.name} onChange={(e) => set("name", e.target.value)} />
          </FormField>
          <FormField label={t("field.displayName" as any)}>
            <input className={inputClass} value={perm.displayName} onChange={(e) => set("displayName", e.target.value)} />
          </FormField>
          <FormField label={t("authz.perm.effect" as any)}>
            <div className="flex rounded-lg bg-surface-2 p-0.5 gap-0.5">
              <button
                onClick={() => set("effect", "Allow")}
                className={`flex-1 py-2 px-4 rounded-md text-[13px] font-semibold transition-all ${perm.effect === "Allow" ? "bg-success text-white shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
              >
                {t("authz.perm.effectAllow" as any)}
              </button>
              <button
                onClick={() => set("effect", "Deny")}
                className={`flex-1 py-2 px-4 rounded-md text-[13px] font-semibold transition-all ${perm.effect === "Deny" ? "bg-danger text-white shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
              >
                {t("authz.perm.effectDeny" as any)}
              </button>
            </div>
          </FormField>
          <FormField label={t("authz.perm.approval" as any)}>
            <div className="flex items-center gap-2 pt-1.5">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                perm.state === "Approved" ? "bg-success/10 text-success" :
                perm.state === "Pending" ? "bg-warning/10 text-warning" :
                "bg-danger/10 text-danger"
              }`}>
                {perm.state === "Approved" ? t("authz.perm.stateApproved" as any) :
                 perm.state === "Pending" ? t("authz.perm.statePending" as any) :
                 t("authz.perm.stateRejected" as any)}
              </span>
              {perm.approver && (
                <span className="text-[12px] text-text-muted">
                  {t("authz.perm.approvedBy" as any).replace("{approver}", perm.approver).replace("{time}", perm.approveTime)}
                </span>
              )}
            </div>
          </FormField>
          <FormField label={t("field.isEnabled" as any)} span="full">
            <div className="flex items-center justify-between">
              <span />
              <Switch checked={perm.isEnabled} onChange={(v) => set("isEnabled", v)} />
            </div>
          </FormField>
        </FormSection>

        {/* Dynamic Policy Fields */}
        <div className="rounded-xl border border-border bg-surface-1 overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold">{t("authz.perm.section.policyFields" as any)}</h3>
          </div>

          {/* Model hint */}
          <div className="px-5 pt-4">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-info/5 border-l-[3px] border-info text-[12px] text-info">
              <Info size={14} className="flex-shrink-0" />
              {t("authz.perm.modelHint" as any).replace("{definition}", policyDefStr)}
            </div>
          </div>

          {/* Dynamic field blocks */}
          {fieldConfigs.map((fc) => (
            <div key={fc.key} className="px-5 py-4 border-b border-border-subtle last:border-b-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                  {fc.label}
                  <code className="text-[11px] font-normal text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">{fc.key}</code>
                </div>
                {fc.type === "subjects" && (
                  <button onClick={() => setShowAddSubject(true)} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                    <Plus size={14} /> {t("authz.perm.addSubject" as any)}
                  </button>
                )}
              </div>

              {/* ── Subjects field ── */}
              {fc.type === "subjects" && (
                <div className="divide-y divide-border-subtle">
                  {perm.roles.map((r) => (
                    <div key={`role-${r}`} className="flex items-center gap-2.5 py-2">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-accent/10 text-accent uppercase tracking-wide w-[46px] text-center">
                        {t("authz.tab.roles" as any)}
                      </span>
                      <span className="flex-1 text-[13px] font-medium">{r}</span>
                      <span className="text-[12px] text-text-muted">{appRoles.find((ar) => ar.value === r)?.label} ({appRoles.find((ar) => ar.value === r)?.userCount || 0} users)</span>
                      <button onClick={() => removeSubject(r, "role")} className="rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors"><X size={14} /></button>
                    </div>
                  ))}
                  {perm.users.map((u) => (
                    <div key={`user-${u}`} className="flex items-center gap-2.5 py-2">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-info/10 text-info uppercase tracking-wide w-[46px] text-center">
                        {t("authz.roles.col.users" as any)}
                      </span>
                      <span className="flex-1 text-[13px] font-medium">{u}</span>
                      <span className="text-[12px] text-text-muted">{orgUsers.find((ou) => ou.value === u)?.displayName}</span>
                      <button onClick={() => removeSubject(u, "user")} className="rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors"><X size={14} /></button>
                    </div>
                  ))}
                  {perm.roles.length === 0 && perm.users.length === 0 && (
                    <div className="py-4 text-center text-[13px] text-text-muted">{t("common.noData")}</div>
                  )}
                </div>
              )}

              {/* ── Resources field ── */}
              {fc.type === "resources" && (
                <>
                  <textarea
                    className={`${monoInputClass} min-h-[88px] resize-y`}
                    value={perm.resources.join("\n")}
                    onChange={(e) => set("resources", e.target.value.split("\n").filter(Boolean))}
                    placeholder="/api/orders/*&#10;/api/orders/:id/items"
                  />
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-text-muted">
                    <Info size={14} className="flex-shrink-0" />
                    {t("authz.perm.resourceHint" as any)}
                  </p>
                </>
              )}

              {/* ── Actions field ── */}
              {fc.type === "actions" && (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {perm.actions.map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 rounded-md bg-surface-2 border border-border px-2.5 py-1 text-[12px] font-medium font-mono">
                        {a}
                        <button onClick={() => removeAction(a)} className="text-text-muted hover:text-danger transition-colors"><X size={12} /></button>
                      </span>
                    ))}
                    {perm.actions.length === 0 && <span className="text-[13px] text-text-muted">{t("common.noData")}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => addAction("GET")} className="text-[12px] text-accent font-medium border-b border-dashed border-accent hover:opacity-70 transition-opacity">
                      {t("authz.perm.shortcutRead" as any)}
                    </button>
                    <button onClick={() => { addAction("POST"); addAction("PUT"); }} className="text-[12px] text-accent font-medium border-b border-dashed border-accent hover:opacity-70 transition-opacity">
                      {t("authz.perm.shortcutWrite" as any)}
                    </button>
                    <button onClick={() => addAction(".*")} className="text-[12px] text-accent font-medium border-b border-dashed border-accent hover:opacity-70 transition-opacity">
                      {t("authz.perm.shortcutAll" as any)}
                    </button>
                    <button
                      onClick={() => { setCustomActionValue(""); setShowCustomAction(true); }}
                      className="text-[12px] text-accent font-medium border-b border-dashed border-accent hover:opacity-70 transition-opacity"
                    >
                      {t("authz.perm.shortcutCustom" as any)}
                    </button>
                  </div>
                </>
              )}

              {/* ── Text field (domain or custom) ── */}
              {fc.type === "text" && (
                <input className={inputClass} value={(perm as any)[fc.key] ?? ""} onChange={(e) => set(fc.key, e.target.value)} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add Subject Modal */}
      {showAddSubject && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddSubject(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)]"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[15px] font-semibold">{t("authz.perm.addSubject" as any)}</h3>
              <button onClick={() => setShowAddSubject(false)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><X size={16} /></button>
            </div>
            <div className="px-5 py-3 border-b border-border-subtle">
              <input className={inputClass} placeholder={t("common.search")} value={subjectSearch} onChange={(e) => setSubjectSearch(e.target.value)} autoFocus />
            </div>
            <div className="max-h-[350px] overflow-y-auto divide-y divide-border-subtle">
              {filteredSubjectsForAdd.map((s) => (
                <button key={`${s.type}-${s.value}`} onClick={() => { addSubject(s.value, s.type); }} className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2 transition-colors text-left">
                  {s.type === "role" ? (
                    <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center"><Shield size={14} className="text-accent" /></div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-info/10 flex items-center justify-center"><User size={14} className="text-info" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{s.value}</div>
                    <div className="text-[11px] text-text-muted">{s.type === "role" ? `${s.label} (${s.userCount} users)` : s.label}</div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${s.type === "role" ? "bg-accent/10 text-accent" : "bg-info/10 text-info"}`}>
                    {s.type}
                  </span>
                </button>
              ))}
              {filteredSubjectsForAdd.length === 0 && (
                <div className="py-8 text-center text-[13px] text-text-muted">{t("common.noData")}</div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Custom Action Input Modal */}
      {showCustomAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCustomAction(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative z-10 w-full max-w-xs rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)] p-5"
          >
            <h3 className="text-[15px] font-semibold mb-3">{t("authz.perm.shortcutCustom" as any)}</h3>
            <input
              className={`${monoInputClass} mb-3`}
              placeholder="DELETE"
              value={customActionValue}
              onChange={(e) => setCustomActionValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && customActionValue.trim()) {
                  addAction(customActionValue.trim());
                  setShowCustomAction(false);
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCustomAction(false)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={() => { if (customActionValue.trim()) { addAction(customActionValue.trim()); setShowCustomAction(false); } }}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"
              >
                {t("common.confirm")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
