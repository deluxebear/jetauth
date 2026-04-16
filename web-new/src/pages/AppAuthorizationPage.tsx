import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, Play, Copy, Check, X, Users as UsersIcon, RefreshCw, RotateCcw, Pencil, Trash2, LayoutDashboard, Crown, ShieldCheck, FlaskConical, Code, UserPlus, Shield } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as BizBackend from "../backend/BizBackend";
import * as UserBackend from "../backend/UserBackend";
import type { BizAppConfig, BizRole, BizPermission, PoliciesExport } from "../backend/BizBackend";
import { getInitial, getAvatarColor } from "../utils/avatar";

type TabKey = "overview" | "roles" | "permissions" | "test" | "integration";

export default function AppAuthorizationPage() {
  const { owner, appName } = useParams<{ owner: string; appName: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<BizAppConfig | null>(null);
  const [roles, setRoles] = useState<BizRole[]>([]);
  const [permissions, setPermissions] = useState<BizPermission[]>([]);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(() => {
    if (!owner || !appName) return;
    setLoading(true);
    const appId = `${owner}/${appName}`;

    Promise.all([
      BizBackend.getBizAppConfig(appId).catch(() => ({ status: "error" as const, msg: "", data: null as any })),
      BizBackend.getBizRoles(owner, appName).catch(() => ({ status: "error" as const, msg: "", data: [] as any })),
      BizBackend.getBizPermissions(owner, appName).catch(() => ({ status: "error" as const, msg: "", data: [] as any })),
    ]).then(([configRes, rolesRes, permsRes]) => {
      if (configRes.status === "ok" && configRes.data) setConfig(configRes.data);
      setRoles(rolesRes.status === "ok" && rolesRes.data ? rolesRes.data : []);
      setPermissions(permsRes.status === "ok" && permsRes.data ? permsRes.data : []);
    }).finally(() => setLoading(false));
  }, [owner, appName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSyncPolicies = async () => {
    if (!owner || !appName) return;
    setSyncing(true);
    try {
      const res = await BizBackend.bizSyncPolicies(`${owner}/${appName}`);
      if (res.status === "ok" && res.data) {
        modal.toast(`${t("authz.overview.syncSuccess" as any)} — ${res.data.policyCount} policies, ${res.data.roleCount} roles`, "success");
        fetchData();
      } else {
        modal.toast(res.msg || t("common.error"), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.error"), "error");
    } finally {
      setSyncing(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  // Stats
  const userSet = new Set<string>();
  roles.forEach((r) => r.users?.forEach((u) => userSet.add(u)));
  permissions.forEach((p) => p.users?.forEach((u) => userSet.add(u)));
  const allowCount = permissions.filter((p) => p.effect === "Allow").length;
  const denyCount = permissions.filter((p) => p.effect === "Deny").length;

  const tabs: { key: TabKey; label: string; count?: number; icon: React.ReactNode }[] = [
    { key: "overview", label: t("authz.tab.overview" as any), icon: <LayoutDashboard size={14} /> },
    { key: "roles", label: t("authz.tab.roles" as any), count: roles.length, icon: <Crown size={14} /> },
    { key: "permissions", label: t("authz.tab.permissions" as any), count: permissions.length, icon: <ShieldCheck size={14} /> },
    { key: "test", label: t("authz.tab.test" as any), icon: <FlaskConical size={14} /> },
    { key: "integration", label: t("authz.tab.integration" as any), icon: <Code size={14} /> },
  ];

  return (
    <div className="space-y-0">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 px-6 bg-surface-0/80 backdrop-blur-md border-b border-border-subtle">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/authorization")} className="rounded-lg p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
              {(config.displayName || config.appName).charAt(0).toUpperCase()}
            </div>
            <div>
              <Link to={`/applications/admin/${config.appName}`} className="text-lg font-bold tracking-tight hover:text-accent transition-colors">
                {config.displayName || config.appName}
              </Link>
              <p className="text-[11px] text-text-muted font-mono">{config.owner} / {config.appName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncPolicies}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 disabled:opacity-50 transition-colors"
              title={t("authz.overview.syncDescription" as any)}
            >
              {syncing ? (
                <div className="h-3.5 w-3.5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
              {t("authz.overview.syncPolicies" as any)}
            </button>
            <motion.button
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.3 }}
              onClick={fetchData}
              className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors"
              title={t("common.refresh")}
            >
              <RefreshCw size={15} />
            </motion.button>
          </div>
        </div>
        {/* Tab Bar */}
        <div className="flex -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text-secondary"
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold ${
                  activeTab === tab.key ? "bg-accent/15 text-accent" : "bg-surface-3 text-text-muted"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-6">
        {activeTab === "overview" && (
          <OverviewTab
            config={config}
            roles={roles}
            permissions={permissions}
            userCount={userSet.size}
            allowCount={allowCount}
            denyCount={denyCount}
            onRefresh={fetchData}
            t={t}
            modal={modal}
          />
        )}
        {activeTab === "roles" && (
          <RolesTab
            roles={roles}
            onRefresh={fetchData}
            appOwner={owner!}
            appName={appName!}
            t={t}
            modal={modal}
            navigate={navigate}
          />
        )}
        {activeTab === "permissions" && (
          <PermissionsTab
            permissions={permissions}
            onRefresh={fetchData}
            appOwner={owner!}
            appName={appName!}
            t={t}
            modal={modal}
            navigate={navigate}
          />
        )}
        {activeTab === "test" && (
          <TestTab
            appOwner={owner!}
            appName={appName!}
            t={t}
          />
        )}
        {activeTab === "integration" && (
          <IntegrationTab
            config={config}
            t={t}
            modal={modal}
          />
        )}
      </div>
    </div>
  );
}

// ═══════ OVERVIEW TAB ═══════
function OverviewTab({ config, roles, permissions, userCount, allowCount, denyCount, onRefresh, t, modal }: {
  config: BizAppConfig; roles: BizRole[]; permissions: BizPermission[];
  userCount: number; allowCount: number; denyCount: number;
  onRefresh: () => void;
  t: (key: any) => string; modal: any;
}) {
  const [editingModel, setEditingModel] = useState(false);
  const [modelDraft, setModelDraft] = useState(config.modelText);
  const [savingConfig, setSavingConfig] = useState(false);

  // Parse model text
  let modelType = "";
  let roleDef = "";
  let matcher = "";
  if (config.modelText) {
    const text = config.modelText;
    if (text.includes("g = _, _, _")) { modelType = "RBAC with domains"; roleDef = "g = _, _, _"; }
    else if (text.includes("g = _, _")) { modelType = "RBAC"; roleDef = "g = _, _"; }
    else if (text.includes("role_definition")) { modelType = "RBAC (custom)"; }
    else { modelType = "ACL / ABAC"; }
    const matcherMatch = text.match(/m\s*=\s*(.+)/);
    if (matcherMatch) matcher = matcherMatch[1].trim();
  }

  const doSaveModel = async () => {
    setSavingConfig(true);
    try {
      const updated = { ...config, modelText: modelDraft };
      const res = await BizBackend.updateBizAppConfig(`${config.owner}/${config.appName}`, updated);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any), "success");
        setEditingModel(false);
        onRefresh();
      } else {
        modal.toast(res.msg || t("common.saveFailed" as any), "error");
      }
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveModel = () => {
    // Detect policy_definition field changes
    const oldFields = BizBackend.parsePolicyFields(config.modelText);
    const newFields = BizBackend.parsePolicyFields(modelDraft);
    const oldKey = oldFields.join(", ");
    const newKey = newFields.join(", ");

    if (oldKey !== newKey) {
      // Fields changed — high risk, show detailed warning
      const warnings = [
        t("authz.overview.modelWarning.title" as any),
        "",
        `${t("authz.overview.modelWarning.fieldChange" as any)}`,
        `  ${t("authz.overview.modelWarning.before" as any)} p = ${oldKey}`,
        `  ${t("authz.overview.modelWarning.after" as any)} p = ${newKey}`,
        "",
        t("authz.overview.modelWarning.consequences" as any),
        `  • ${t("authz.overview.modelWarning.policiesRebuilt" as any)}`,
        `  • ${t("authz.overview.modelWarning.fieldMismatch" as any)}`,
        `  • ${t("authz.overview.modelWarning.enforceFail" as any)}`,
        "",
        t("authz.overview.modelWarning.recommendation" as any),
      ].join("\n");
      modal.showConfirm(warnings, doSaveModel);
    } else {
      // Same fields (e.g. only matcher changed) — low risk, still confirm
      modal.showConfirm(t("authz.overview.modelWarning.syncConfirm" as any), doSaveModel);
    }
  };

  const handleToggleEnabled = async () => {
    const updated = { ...config, isEnabled: !config.isEnabled };
    const res = await BizBackend.updateBizAppConfig(`${config.owner}/${config.appName}`, updated);
    if (res.status === "ok") {
      onRefresh();
    } else {
      modal.toast(res.msg || t("common.saveFailed" as any), "error");
    }
  };

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">{t("authz.metrics.roles")}</div>
          <div className="text-[28px] font-bold text-text-primary font-mono tracking-tight">{roles.length}</div>
          <div className="text-[11px] text-text-muted mt-0.5">{roles.filter((r) => r.isEnabled).length} {t("common.enabled" as any)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">{t("authz.metrics.permissions")}</div>
          <div className="text-[28px] font-bold text-text-primary font-mono tracking-tight">{permissions.length}</div>
          <div className="text-[11px] text-text-muted mt-0.5">{allowCount} {t("authz.overview.allowRules")} · {denyCount} {t("authz.overview.denyRules")}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">{t("authz.metrics.users")}</div>
          <div className="text-[28px] font-bold text-text-primary font-mono tracking-tight">{userCount}</div>
        </div>
      </div>

      {/* Config Section */}
      <div className="rounded-xl border border-border bg-surface-1">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h4 className="text-[14px] font-semibold">{t("authz.overview.configuration" as any)}</h4>
            <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-accent/10 text-accent">{modelType || "—"}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-text-muted">{t("authz.overview.status" as any)}</span>
            <button
              onClick={handleToggleEnabled}
              className={`relative w-11 h-6 rounded-full transition-colors ${config.isEnabled ? "bg-accent" : "bg-surface-4"}`}
            >
              <span className={`absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full shadow transition-transform ${config.isEnabled ? "translate-x-5" : ""}`} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Policy Table */}
          <div className="flex items-center gap-4">
            <span className="text-[12px] text-text-muted w-20 flex-shrink-0">{t("authz.overview.policyTable" as any)}</span>
            <span className="text-[13px] font-mono font-medium text-text-primary">{config.policyTable || "—"}</span>
          </div>

          {/* Model info row */}
          {(roleDef || matcher) && (
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {roleDef && (
                <div className="flex items-center gap-4">
                  <span className="text-[12px] text-text-muted w-20 flex-shrink-0">{t("authz.overview.roleDef")}</span>
                  <span className="text-[12px] font-mono text-text-primary">{roleDef}</span>
                </div>
              )}
              {matcher && (
                <div className="flex items-center gap-4 min-w-0">
                  <span className="text-[12px] text-text-muted flex-shrink-0">Matcher</span>
                  <span className="text-[11px] font-mono text-text-secondary truncate">{matcher}</span>
                </div>
              )}
            </div>
          )}

          {/* Model Text */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-text-secondary">{t("authz.overview.model")}</span>
              {!editingModel ? (
                <button
                  onClick={() => { setModelDraft(config.modelText); setEditingModel(true); }}
                  className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
                >
                  <Pencil size={12} /> {t("common.edit")}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingModel(false)}
                    className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={handleSaveModel}
                    disabled={savingConfig || modelDraft === config.modelText}
                    className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
                  >
                    {savingConfig && <div className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                    {t("common.save")}
                  </button>
                </div>
              )}
            </div>
            {editingModel ? (
              <textarea
                value={modelDraft}
                onChange={(e) => setModelDraft(e.target.value)}
                rows={14}
                spellCheck={false}
                className="w-full rounded-lg border border-accent bg-surface-2 px-4 py-3 text-[12px] font-mono leading-relaxed text-text-primary outline-none resize-y focus:ring-1 focus:ring-accent/30"
              />
            ) : (
              <pre className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-[12px] font-mono leading-relaxed text-text-secondary overflow-x-auto max-h-[320px] overflow-y-auto whitespace-pre-wrap">
                {config.modelText || "—"}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════ ROLES TAB ═══════
type SlidePanel = { type: "viewUsers" | "addUser" | "addRole"; role: BizRole } | null;

function RolesTab({ roles, onRefresh, appOwner, appName, t, modal, navigate }: {
  roles: BizRole[]; onRefresh: () => void;
  appOwner: string; appName: string;
  t: (key: any) => string; modal: any; navigate: any;
}) {
  const [panel, setPanel] = useState<SlidePanel>(null);
  const [orgUsers, setOrgUsers] = useState<{ value: string; displayName: string; email: string }[]>([]);
  const [panelSearch, setPanelSearch] = useState("");
  const [panelLoading, setPanelLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load org users when a user-related panel opens (refetch each time to stay fresh)
  const needsUsers = panel?.type === "addUser" || panel?.type === "viewUsers";
  useEffect(() => {
    if (!needsUsers) return;
    UserBackend.getUsers({ owner: appOwner }).then((res) => {
      if (res.status === "ok" && res.data) {
        setOrgUsers(res.data.map((u: any) => ({
          value: `${u.owner}/${u.name}`,
          displayName: u.displayName || u.name,
          email: u.email || "",
        })));
      }
    });
  }, [needsUsers, appOwner]);

  // Escape key — document-level listener for all panel types
  useEffect(() => {
    if (!panel) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setPanel(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [panel]);

  // Lock body scroll when panel is open
  useEffect(() => {
    if (panel) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [panel]);

  const handleAddRole = () => {
    navigate(`/authorization/${appOwner}/${appName}/roles/new`, { state: { mode: "add" } });
  };

  const handleDeleteRole = (role: BizRole, e: React.MouseEvent) => {
    e.stopPropagation();
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
      ? `${t("common.confirmDelete")} [${role.name}]\n\n${warnings.join("\n\n")}`
      : `${t("common.confirmDelete")} [${role.name}]`;
    modal.showConfirm(msg, async () => {
      const res = await BizBackend.deleteBizRole(role);
      if (res.status === "ok") onRefresh();
      else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
    });
  };

  // Quick action: add user or sub-role to a role, then save
  const handleQuickUpdate = async (role: BizRole, field: "users" | "roles", value: string) => {
    if (!value || panelLoading || refreshing) return;
    const arr = [...(role[field] || [])];
    if (arr.includes(value)) return;
    arr.push(value);
    const updated = { ...role, [field]: arr };
    setPanelLoading(true);
    const res = await BizBackend.updateBizRole(appOwner, appName, role.name, updated);
    setPanelLoading(false);
    if (res.status === "ok") {
      modal.toast(t("authz.roles.panel.addSuccess" as any), "success");
      setRefreshing(true);
      onRefresh();
      setRefreshing(false);
    } else {
      modal.toast(res.msg || t("common.saveFailed" as any), "error");
    }
  };

  const handleQuickRemoveUser = async (role: BizRole, userId: string) => {
    if (panelLoading || refreshing) return;
    const updated = { ...role, users: role.users.filter((u) => u !== userId) };
    setPanelLoading(true);
    const res = await BizBackend.updateBizRole(appOwner, appName, role.name, updated);
    setPanelLoading(false);
    if (res.status === "ok") {
      modal.toast(t("authz.roles.panel.removeSuccess" as any), "success");
      setRefreshing(true);
      onRefresh();
      setRefreshing(false);
    } else {
      modal.toast(res.msg || t("common.saveFailed" as any), "error");
    }
  };

  const columns: Column<BizRole>[] = [
    {
      key: "name", title: t("authz.roles.col.name"), sortable: true, filterable: true, fixed: "left" as const, width: "200px",
      render: (_, r) => <Link to={`/authorization/${appOwner}/${appName}/roles/${encodeURIComponent(r.name)}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "displayName", title: t("authz.roles.col.displayName" as any), sortable: true, filterable: true, width: "200px",
      render: (_, r) => <span className="text-[12px] text-text-secondary">{r.displayName || "\u2014"}</span>,
    },
    {
      key: "users", title: t("authz.roles.col.users"), sortable: true, width: "100px",
      render: (_, r) => {
        const count = r.users?.length ?? 0;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); setPanel({ type: "viewUsers", role: r }); setPanelSearch(""); }}
            className={`inline-flex items-center gap-1 font-mono font-semibold rounded px-2 py-0.5 transition-colors ${count > 0 ? "text-blue-400 hover:bg-blue-500/10" : "text-text-muted hover:bg-surface-2"}`}
            title={t("authz.roles.viewUsers" as any)}
          >
            <UsersIcon size={12} className="opacity-60" />
            {count}
          </button>
        );
      },
    },
    {
      key: "roles", title: t("authz.roles.col.subRoles"), width: "180px",
      render: (_, r) => <span className="text-text-muted font-mono text-[11px]">{r.roles?.length ? r.roles.join(", ") : "\u2014"}</span>,
    },
    {
      key: "isEnabled", title: t("authz.roles.col.status" as any), sortable: true, width: "100px",
      render: (_, r) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.isEnabled ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {r.isEnabled ? t("common.enabled" as any) : t("common.disabled" as any)}
        </span>
      ),
    },
    {
      key: "__actions", title: t("common.action" as any), fixed: "right" as const, width: "160px",
      render: (_, r) => (
        <div className="flex items-center gap-0.5">
          <button onClick={(e) => { e.stopPropagation(); setPanel({ type: "addUser", role: r }); setPanelSearch(""); }} className="rounded p-1.5 text-text-muted hover:text-blue-500 hover:bg-blue-500/10 transition-colors" title={t("authz.roles.quickAddUser" as any)}><UserPlus size={14} /></button>
          <button onClick={(e) => { e.stopPropagation(); setPanel({ type: "addRole", role: r }); setPanelSearch(""); }} className="rounded p-1.5 text-text-muted hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors" title={t("authz.roles.quickAddRole" as any)}><Shield size={14} /></button>
          <Link to={`/authorization/${appOwner}/${appName}/roles/${encodeURIComponent(r.name)}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDeleteRole(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  // Get the latest role data (roles list refreshes after onRefresh)
  const panelRole = panel ? roles.find((r) => r.name === panel.role.name) ?? panel.role : null;

  // Filter helpers for panels (memoized to avoid recomputation on every render)
  const filteredUsersForAdd = useMemo(() => {
    if (panel?.type !== "addUser" || !panelRole) return [];
    return orgUsers.filter((u) => !(panelRole.users || []).includes(u.value) && (panelSearch === "" || u.value.toLowerCase().includes(panelSearch.toLowerCase()) || u.displayName.toLowerCase().includes(panelSearch.toLowerCase())));
  }, [panel?.type, panelRole, orgUsers, panelSearch]);
  const filteredRolesForAdd = useMemo(() => {
    if (panel?.type !== "addRole" || !panelRole) return [];
    return roles.filter((r) => r.name !== panelRole.name && !(panelRole.roles || []).includes(r.name) && (panelSearch === "" || r.name.toLowerCase().includes(panelSearch.toLowerCase()) || (r.displayName || "").toLowerCase().includes(panelSearch.toLowerCase())));
  }, [panel?.type, panelRole, roles, panelSearch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-text-primary">{t("authz.roles.title")}</h3>
        <button onClick={handleAddRole} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover transition-colors">
          <Plus size={14} /> {t("authz.roles.add")}
        </button>
      </div>
      <DataTable columns={columns} data={roles} rowKey={(r) => r.name} emptyText={t("common.noData")} />

      {/* ── Slide-out panel ── */}
      <AnimatePresence>
        {panel && panelRole && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-[2px]"
              onClick={() => setPanel(null)}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 z-[91] w-[380px] max-w-[90vw] bg-surface-1 border-l border-border shadow-xl flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div>
                  <h3 className="text-[15px] font-semibold">
                    {panel.type === "viewUsers" && t("authz.roles.panel.viewUsers" as any)}
                    {panel.type === "addUser" && t("authz.roles.panel.addUser" as any)}
                    {panel.type === "addRole" && t("authz.roles.panel.addRole" as any)}
                  </h3>
                  <p className="text-[12px] text-text-muted font-mono mt-0.5">{panelRole.name}{panelRole.displayName ? ` · ${panelRole.displayName}` : ""}</p>
                </div>
                <button onClick={() => setPanel(null)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><X size={16} /></button>
              </div>

              {/* Search (for addUser / addRole) */}
              {panel.type !== "viewUsers" && (
                <div className="px-5 py-3 border-b border-border-subtle">
                  <input
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
                    placeholder={t("common.search")}
                    value={panelSearch}
                    onChange={(e) => setPanelSearch(e.target.value)}
                    autoFocus
                  />
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {/* View Users */}
                {panel.type === "viewUsers" && (
                  (panelRole.users?.length ?? 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                      <UsersIcon size={32} className="mb-2 opacity-30" />
                      <p className="text-[13px]">{t("authz.roles.panel.noUsersYet" as any)}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border-subtle">
                      {panelRole.users.map((userId) => {
                        const info = orgUsers.find((u) => u.value === userId);
                        return (
                          <div key={userId} className="flex items-center gap-3 px-5 py-3">
                            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(userId)} flex items-center justify-center text-white text-[12px] font-semibold flex-shrink-0`}>
                              {getInitial(userId)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium truncate">{info?.displayName || userId.split("/")[1]}</div>
                              <div className="text-[11px] text-text-muted font-mono">{userId}</div>
                            </div>
                            <button
                              onClick={() => handleQuickRemoveUser(panelRole, userId)}
                              disabled={panelLoading}
                              className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                              title={t("authz.roles.panel.removeUser" as any)}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* Add User */}
                {panel.type === "addUser" && (
                  <div className="divide-y divide-border-subtle">
                    {filteredUsersForAdd.map((u) => (
                      <button
                        key={u.value}
                        onClick={() => handleQuickUpdate(panelRole, "users", u.value)}
                        disabled={panelLoading}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-2 transition-colors text-left disabled:opacity-50"
                      >
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(u.value)} flex items-center justify-center text-white text-[12px] font-semibold flex-shrink-0`}>
                          {getInitial(u.value)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate">{u.displayName}</div>
                          <div className="text-[11px] text-text-muted font-mono">{u.value}</div>
                        </div>
                        <Plus size={14} className="text-text-muted" />
                      </button>
                    ))}
                    {filteredUsersForAdd.length === 0 && (
                      <div className="py-12 text-center text-[13px] text-text-muted">{t("common.noData")}</div>
                    )}
                  </div>
                )}

                {/* Add Sub-Role */}
                {panel.type === "addRole" && (
                  <div className="divide-y divide-border-subtle">
                    {filteredRolesForAdd.map((r) => (
                      <button
                        key={r.name}
                        onClick={() => handleQuickUpdate(panelRole, "roles", r.name)}
                        disabled={panelLoading}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-2 transition-colors text-left disabled:opacity-50"
                      >
                        <div className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-text-muted flex-shrink-0">
                          <Shield size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate font-mono">{r.name}</div>
                          <div className="text-[11px] text-text-muted">{r.displayName || "\u2014"} · {r.users?.length ?? 0} {t("authz.roles.col.users" as any).toLowerCase()}</div>
                        </div>
                        <Plus size={14} className="text-text-muted" />
                      </button>
                    ))}
                    {filteredRolesForAdd.length === 0 && (
                      <div className="py-12 text-center text-[13px] text-text-muted">{t("common.noData")}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer hint */}
              {panel.type === "viewUsers" && (panelRole.users?.length ?? 0) > 0 && (
                <div className="px-5 py-3 border-t border-border-subtle text-center">
                  <button
                    onClick={() => setPanel({ type: "addUser", role: panelRole })}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent-hover transition-colors"
                  >
                    <Plus size={14} /> {t("authz.roles.quickAddUser" as any)}
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════ PERMISSIONS TAB ═══════
function PermissionsTab({ permissions, onRefresh, appOwner, appName, t, modal, navigate }: {
  permissions: BizPermission[]; onRefresh: () => void;
  appOwner: string; appName: string;
  t: (key: any) => string; modal: any; navigate: any;
}) {
  const handleAddPermission = () => {
    navigate(`/authorization/${appOwner}/${appName}/permissions/new`, { state: { mode: "add" } });
  };

  const handleDeletePermission = (perm: BizPermission, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(`${t("common.confirmDelete")} [${perm.name}]`, async () => {
      const res = await BizBackend.deleteBizPermission(perm);
      if (res.status === "ok") onRefresh();
      else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
    });
  };

  const columns: Column<BizPermission>[] = [
    {
      key: "name", title: t("authz.perms.col.name"), sortable: true, fixed: "left" as const, width: "180px",
      render: (_, p) => <Link to={`/authorization/${appOwner}/${appName}/permissions/${encodeURIComponent(p.name)}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{p.name}</Link>,
    },
    {
      key: "subjects", title: t("authz.perms.col.subject"), width: "220px",
      render: (_, p) => (
        <div className="flex flex-wrap gap-1">
          {p.roles?.map((r) => <span key={r} className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-accent/10 text-accent">{r}</span>)}
          {p.users?.filter((u) => u !== "*").map((u) => <span key={u} className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-400">{u}</span>)}
          {p.users?.includes("*") && <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-400">*</span>}
        </div>
      ),
    },
    {
      key: "resources", title: t("authz.perms.col.resources"), width: "250px",
      render: (_, p) => <span className="font-mono text-[11px] text-text-secondary">{p.resources?.join(", ") || "\u2014"}</span>,
    },
    {
      key: "actions", title: t("authz.perms.col.actions"), width: "150px",
      render: (_, p) => (
        <div className="flex flex-wrap gap-1">
          {p.actions?.map((a) => <span key={a} className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-cyan-500/10 text-cyan-400">{a}</span>)}
        </div>
      ),
    },
    {
      key: "effect", title: t("authz.perms.col.effect"), sortable: true, width: "90px",
      render: (_, p) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.effect === "Allow" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
          {p.effect === "Allow" ? t("permissions.effectAllow" as any) : t("permissions.effectDeny" as any)}
        </span>
      ),
    },
    {
      key: "isEnabled", title: t("authz.roles.col.status" as any), sortable: true, width: "90px",
      render: (_, p) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.isEnabled ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {p.isEnabled ? t("common.enabled" as any) : t("common.disabled" as any)}
        </span>
      ),
    },
    {
      key: "__actions", title: t("common.action" as any), fixed: "right" as const, width: "100px",
      render: (_, p) => (
        <div className="flex items-center gap-1">
          <Link to={`/authorization/${appOwner}/${appName}/permissions/${encodeURIComponent(p.name)}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDeletePermission(p, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-text-primary">{t("authz.perms.title")}</h3>
        <button onClick={handleAddPermission} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover transition-colors">
          <Plus size={14} /> {t("authz.perms.add")}
        </button>
      </div>
      <DataTable columns={columns} data={permissions} rowKey={(p) => p.name} emptyText={t("common.noData")} />
    </div>
  );
}

// ═══════ TEST TAB ═══════
function TestTab({ appOwner, appName, t }: {
  appOwner: string; appName: string;
  t: (key: any) => string;
}) {
  const [sub, setSub] = useState("");
  const [obj, setObj] = useState("");
  const [act, setAct] = useState("");
  const [result, setResult] = useState<{ allowed: boolean; detail: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [history, setHistory] = useState<{ time: string; sub: string; obj: string; act: string; allowed: boolean }[]>([]);

  const handleTest = async () => {
    if (!sub || !obj || !act) return;
    setTesting(true);
    try {
      const appId = `${appOwner}/${appName}`;
      const res = await BizBackend.bizEnforce(appId, [sub, obj, act]);
      if (res.status === "ok") {
        const allowed = !!res.data;
        setResult({ allowed, detail: "" });
        setHistory((h) => [{ time: new Date().toLocaleTimeString(), sub, obj, act, allowed }, ...h.slice(0, 19)]);
      } else {
        setResult({ allowed: false, detail: res.msg || "Error" });
      }
    } catch (e: any) {
      setResult({ allowed: false, detail: e.message || "Error" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Playground */}
      <div className="rounded-xl border border-border bg-surface-1 p-5">
        <h4 className="text-[14px] font-semibold text-text-primary mb-1 flex items-center gap-2">
          <Play size={16} className="text-accent" />
          {t("authz.test.title")}
        </h4>
        <p className="text-[12px] text-text-muted mb-4">{t("authz.test.subtitle")}</p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">{t("authz.test.subject")}</label>
            <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder={`${appOwner}/alice`}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] font-mono text-text-primary outline-none focus:border-accent placeholder:text-text-muted" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">{t("authz.test.object")}</label>
            <input value={obj} onChange={(e) => setObj(e.target.value)} placeholder="/orders/list"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] font-mono text-text-primary outline-none focus:border-accent placeholder:text-text-muted" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">{t("authz.test.action")}</label>
            <input value={act} onChange={(e) => setAct(e.target.value)} placeholder="GET"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] font-mono text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
              onKeyDown={(e) => e.key === "Enter" && handleTest()} />
          </div>
          <button onClick={handleTest} disabled={testing || !sub || !obj || !act}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors h-[36px]">
            {testing ? <div className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Play size={13} />}
            {t("authz.test.run")}
          </button>
        </div>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mt-4 rounded-lg px-4 py-3 text-[13px] font-semibold flex items-center gap-2 ${
                result.allowed
                  ? "bg-success/10 text-success border border-success/20"
                  : "bg-danger/10 text-danger border border-danger/20"
              }`}
            >
              {result.allowed ? <Check size={16} /> : <X size={16} />}
              <strong>{result.allowed ? t("authz.test.result.allow") : t("authz.test.result.deny")}</strong>
              {result.detail && <span className="font-normal text-[12px] ml-2 opacity-80">— {result.detail}</span>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <h3 className="text-[14px] font-semibold text-text-primary mb-3">{t("authz.test.history")}</h3>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-surface-2 border-b border-border">
                  <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.test.col.time")}</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.test.col.user")}</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.test.col.resource")}</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.test.col.action")}</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.test.col.result")}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-b border-border-subtle">
                    <td className="px-4 py-2 font-mono text-text-muted text-[11px]">{h.time}</td>
                    <td className="px-4 py-2 font-mono text-[11px]">{h.sub}</td>
                    <td className="px-4 py-2 font-mono text-[11px]">{h.obj}</td>
                    <td className="px-4 py-2 text-[11px]">{h.act}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        h.allowed ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                      }`}>
                        {h.allowed ? t("authz.test.result.allow" as any) : t("authz.test.result.deny" as any)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════ INTEGRATION TAB ═══════
function IntegrationTab({ config, t, modal }: { config: BizAppConfig; t: (key: any) => string; modal: any }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [policies, setPolicies] = useState<PoliciesExport | null>(null);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const endpoint = window.location.origin;
  const appId = `${config.owner}/${config.appName}`;

  const loadPolicies = async () => {
    setLoadingPolicies(true);
    try {
      const res = await BizBackend.bizGetPolicies(appId);
      if (res.status === "ok" && res.data) {
        setPolicies(res.data);
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.error"), "error");
    } finally {
      setLoadingPolicies(false);
    }
  };

  // Load policies on mount
  useEffect(() => { loadPolicies(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copyCode = (code: string, key: string) => {
    navigator.clipboard.writeText(code);
    setCopied(key);
    modal.toast(t("authz.integration.copySuccess"), "success");
    setTimeout(() => setCopied(null), 2000);
  };

  const goCode = `import "net/http"

// JetAuth Biz Authorization — ${config.displayName || config.appName}
// Endpoint: ${endpoint}
// AppId:    ${appId}

// API middleware — enforce permission on every request
func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        userId := getUserFromJWT(r)

        // Call biz-enforce: tests against the whole app's policies
        body, _ := json.Marshal([]string{userId, r.URL.Path, r.Method})
        req, _ := http.NewRequest("POST",
            "${endpoint}/api/biz-enforce?appId=${encodeURIComponent(appId)}", bytes.NewReader(body))
        req.Header.Set("Content-Type", "application/json")
        req.Header.Set("Authorization", "Bearer "+accessToken)

        resp, err := http.DefaultClient.Do(req)
        if err != nil { http.Error(w, "Auth error", 500); return }
        defer resp.Body.Close()

        var result struct { Data bool \`json:"data"\` }
        json.NewDecoder(resp.Body).Decode(&result)
        if !result.Data { http.Error(w, "Forbidden", 403); return }

        next.ServeHTTP(w, r)
    })
}

// Export all policies (for local caching / offline evaluation)
// GET ${endpoint}/api/biz-get-policies?appId=${encodeURIComponent(appId)}`;

  const tsCode = `// JetAuth Biz Authorization — ${config.displayName || config.appName}
const ENDPOINT = "${endpoint}";
const APP_ID = "${appId}";

// Enforce a single request against the app's policies
async function bizEnforce(sub: string, obj: string, act: string): Promise<boolean> {
  const resp = await fetch(
    \`\${ENDPOINT}/api/biz-enforce?appId=\${encodeURIComponent(APP_ID)}\`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${accessToken}\`,
      },
      body: JSON.stringify([sub, obj, act]),
    }
  );
  const { data } = await resp.json();
  return !!data;
}

// Export all policies (for local caching / offline evaluation)
async function bizGetPolicies() {
  const resp = await fetch(
    \`\${ENDPOINT}/api/biz-get-policies?appId=\${encodeURIComponent(APP_ID)}\`,
    { headers: { "Authorization": \`Bearer \${accessToken}\` } }
  );
  return resp.json(); // { data: { modelText, policies, groupingPolicies, version } }
}

// Frontend permission check example
const allowed = await bizEnforce(userId, "/orders", "DELETE");
// <Button disabled={!allowed}>Delete Order</Button>`;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border-l-[3px] border-l-accent border border-border bg-accent/[0.03] p-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-accent mb-2">{t("authz.integration.title")}</div>
        <p className="text-[12px] text-text-muted">{t("authz.integration.subtitle")}</p>
      </div>

      {/* Live Policies */}
      {policies && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-semibold text-text-primary">{t("authz.integration.livePolicies" as any)}</h3>
            <button
              onClick={loadPolicies}
              disabled={loadingPolicies}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-text-muted hover:bg-surface-2 transition-colors"
            >
              <RefreshCw size={12} className={loadingPolicies ? "animate-spin" : ""} />
              {t("common.refresh")}
            </button>
          </div>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-surface-2 border-b border-border">
                  <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.integration.policyType" as any)}</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.integration.policyRule" as any)}</th>
                </tr>
              </thead>
              <tbody>
                {policies.policies?.map((p, i) => (
                  <tr key={`p-${i}`} className="border-b border-border-subtle">
                    <td className="px-4 py-2"><span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-accent/10 text-accent">p</span></td>
                    <td className="px-4 py-2 font-mono text-[11px] text-text-secondary">{p.join(", ")}</td>
                  </tr>
                ))}
                {policies.groupingPolicies?.map((g, i) => (
                  <tr key={`g-${i}`} className="border-b border-border-subtle">
                    <td className="px-4 py-2"><span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-500/10 text-purple-400">g</span></td>
                    <td className="px-4 py-2 font-mono text-[11px] text-text-secondary">{g.join(", ")}</td>
                  </tr>
                ))}
                {(!policies.policies?.length && !policies.groupingPolicies?.length) && (
                  <tr><td colSpan={2} className="px-4 py-6 text-center text-text-muted text-[13px]">{t("common.noData")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Backend SDK */}
      <div>
        <h3 className="text-[13px] font-semibold text-text-primary mb-2">{t("authz.integration.backend")}</h3>
        <div className="relative">
          <button
            onClick={() => copyCode(goCode, "go")}
            className="absolute top-3 right-3 rounded-md p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors z-10"
            title="Copy"
          >
            {copied === "go" ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          </button>
          <pre className="rounded-xl border border-border bg-surface-1 p-5 text-[12px] font-mono leading-relaxed text-text-secondary overflow-x-auto">
            {goCode}
          </pre>
        </div>
      </div>

      {/* Frontend SDK */}
      <div>
        <h3 className="text-[13px] font-semibold text-text-primary mb-2">{t("authz.integration.frontend")}</h3>
        <div className="relative">
          <button
            onClick={() => copyCode(tsCode, "ts")}
            className="absolute top-3 right-3 rounded-md p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors z-10"
            title="Copy"
          >
            {copied === "ts" ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          </button>
          <pre className="rounded-xl border border-border bg-surface-1 p-5 text-[12px] font-mono leading-relaxed text-text-secondary overflow-x-auto">
            {tsCode}
          </pre>
        </div>
      </div>
    </div>
  );
}
