import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, Play, Copy, Check, X, Users as UsersIcon, RefreshCw, RotateCcw, Pencil, Trash2, LayoutDashboard, Crown, ShieldCheck, FlaskConical, Code, UserPlus, Shield, Search, UserCheck, Mail } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as BizBackend from "../backend/BizBackend";
import * as UserBackend from "../backend/UserBackend";
import type { BizAppConfig, BizRole, BizPermission, PoliciesExport } from "../backend/BizBackend";
import { getInitial, getAvatarColor, hasRealAvatar } from "../utils/avatar";

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
  const [appIcon, setAppIcon] = useState("");

  const fetchData = useCallback(() => {
    if (!owner || !appName) return;
    setLoading(true);
    const appId = `${owner}/${appName}`;

    Promise.all([
      BizBackend.getBizAppConfig(appId).catch(() => ({ status: "error" as const, msg: "", data: null as any })),
      BizBackend.getBizRoles(owner, appName).catch(() => ({ status: "error" as const, msg: "", data: [] as any })),
      BizBackend.getBizPermissions(owner, appName).catch(() => ({ status: "error" as const, msg: "", data: [] as any })),
      import("../backend/ApplicationBackend").then((mod) => mod.getApplication("admin", appName)).catch(() => ({ status: "error" as const, data: null as any })),
    ]).then(([configRes, rolesRes, permsRes, appRes]) => {
      if (configRes.status === "ok" && configRes.data) setConfig(configRes.data);
      setRoles(rolesRes.status === "ok" && rolesRes.data ? rolesRes.data : []);
      setPermissions(permsRes.status === "ok" && permsRes.data ? permsRes.data : []);
      if (appRes.status === "ok" && appRes.data) {
        const app = appRes.data as any;
        const favicon = app.favicon && app.favicon !== "/img/favicon.png" ? app.favicon : (app.logo && app.logo !== "/img/logo.png" ? app.logo : "");
        setAppIcon(favicon);
      }
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
            {appIcon ? (
              <img src={appIcon} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                {(config.displayName || config.appName).charAt(0).toUpperCase()}
              </div>
            )}
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
            permissions={permissions}
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
            config={config}
            roles={roles}
            permissions={permissions}
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

// ── User Avatar (real image or gradient fallback) ──
function UserAvatar({ userId, avatar, size = 36 }: { userId: string; avatar?: string; size?: number }) {
  const px = `${size}px`;
  if (hasRealAvatar(avatar)) {
    return <img src={avatar} alt="" className="rounded-full object-cover flex-shrink-0 shadow-sm" style={{ width: px, height: px }} />;
  }
  return (
    <div className={`rounded-full bg-gradient-to-br ${getAvatarColor(userId)} flex items-center justify-center text-white font-semibold flex-shrink-0 shadow-sm`} style={{ width: px, height: px, fontSize: `${Math.round(size * 0.33)}px` }}>
      {getInitial(userId)}
    </div>
  );
}

// ═══════ ROLES TAB ═══════
type SlidePanel = { type: "viewUsers" | "addUser" | "addRole"; role: BizRole } | null;

function RolesTab({ roles, permissions: allPerms, onRefresh, appOwner, appName, t, modal, navigate }: {
  roles: BizRole[]; permissions: BizPermission[]; onRefresh: () => void;
  appOwner: string; appName: string;
  t: (key: any) => string; modal: any; navigate: any;
}) {
  const [panel, setPanel] = useState<SlidePanel>(null);
  const [orgUsers, setOrgUsers] = useState<{ value: string; displayName: string; email: string; avatar: string }[]>([]);
  const [panelSearch, setPanelSearch] = useState("");
  const [panelLoading, setPanelLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());

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
          avatar: u.avatar || "",
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
      // Flash animation: show "added" state briefly
      setRecentlyAdded((prev) => new Set(prev).add(value));
      setTimeout(() => setRecentlyAdded((prev) => { const next = new Set(prev); next.delete(value); return next; }), 1500);
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
      key: "roles", title: t("authz.roles.col.subRoles"), width: "160px",
      render: (_, r) => <span className="text-text-muted font-mono text-[11px]">{r.roles?.length ? r.roles.join(", ") : "\u2014"}</span>,
    },
    {
      key: "permCount", title: t("authz.roles.col.permCount" as any), sortable: true, width: "100px",
      render: (_, r) => {
        const count = allPerms.filter((p) => p.roles?.includes(r.name)).length;
        return (
          <span className={`inline-flex items-center gap-1 font-mono font-semibold rounded px-2 py-0.5 ${count > 0 ? "text-emerald-400" : "text-text-muted"}`}>
            <ShieldCheck size={12} className="opacity-60" />
            {count}
          </span>
        );
      },
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
              className="fixed top-0 right-0 bottom-0 z-[91] w-[400px] max-w-[90vw] bg-surface-1 border-l border-border shadow-xl flex flex-col"
            >
              {/* ── Header ── */}
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${panel.type === "addRole" ? "from-emerald-500 to-teal-600" : "from-blue-500 to-indigo-600"} flex items-center justify-center text-white flex-shrink-0`}>
                      {panel.type === "addRole" ? <Shield size={18} /> : panel.type === "viewUsers" ? <UsersIcon size={18} /> : <UserPlus size={18} />}
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold leading-tight">
                        {panel.type === "viewUsers" && t("authz.roles.panel.viewUsers" as any)}
                        {panel.type === "addUser" && t("authz.roles.panel.addUser" as any)}
                        {panel.type === "addRole" && t("authz.roles.panel.addRole" as any)}
                      </h3>
                      <p className="text-[12px] text-text-muted mt-0.5 font-mono">{panelRole.name}{panelRole.displayName ? ` · ${panelRole.displayName}` : ""}</p>
                    </div>
                  </div>
                  <button onClick={() => setPanel(null)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors -mt-1 -mr-1"><X size={16} /></button>
                </div>

                {/* Search bar with icon */}
                {panel.type !== "viewUsers" && (
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input
                      className="w-full rounded-lg border border-border bg-surface-2 pl-9 pr-8 py-2.5 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                      placeholder={panel.type === "addUser" ? t("authz.roles.panel.searchUsers" as any) : t("authz.roles.panel.searchRoles" as any)}
                      value={panelSearch}
                      onChange={(e) => setPanelSearch(e.target.value)}
                      autoFocus
                    />
                    {panelSearch && (
                      <button onClick={() => setPanelSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-secondary transition-colors">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                )}

                {/* Counter badge */}
                {panel.type !== "viewUsers" && (
                  <div className="flex items-center gap-2 mt-2.5">
                    <span className="text-[11px] text-text-muted">
                      {(panel.type === "addUser"
                        ? (t("authz.roles.panel.available" as any) as string).replace("{count}", String(filteredUsersForAdd.length))
                        : (t("authz.roles.panel.available" as any) as string).replace("{count}", String(filteredRolesForAdd.length))
                      )}
                    </span>
                    {(panelRole.users?.length ?? 0) > 0 && panel.type === "addUser" && (
                      <>
                        <span className="w-px h-3 bg-border" />
                        <button
                          onClick={() => { setPanel({ type: "viewUsers", role: panelRole }); setPanelSearch(""); }}
                          className="text-[11px] text-accent hover:text-accent-hover transition-colors"
                        >
                          {(t("authz.roles.panel.assigned" as any) as string).replace("{count}", String(panelRole.users.length))}
                        </button>
                      </>
                    )}
                  </div>
                )}
                {panel.type === "viewUsers" && (
                  <div className="flex items-center gap-2 mt-2.5">
                    <span className="text-[11px] text-text-muted">
                      {(t("authz.roles.panel.assigned" as any) as string).replace("{count}", String(panelRole.users?.length ?? 0))}
                    </span>
                  </div>
                )}
              </div>

              <div className="h-px bg-border" />

              {/* ── Content ── */}
              <div className="flex-1 overflow-y-auto">
                {/* View Users */}
                {panel.type === "viewUsers" && (
                  (panelRole.users?.length ?? 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-8">
                      <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
                        <UsersIcon size={24} className="text-text-muted/40" />
                      </div>
                      <p className="text-[13px] font-medium text-text-secondary mb-1">{t("authz.roles.panel.noUsersYet" as any)}</p>
                      <p className="text-[11px] text-text-muted">{t("authz.roles.panel.noUsersHint" as any)}</p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {panelRole.users.map((userId, idx) => {
                        const info = orgUsers.find((u) => u.value === userId);
                        return (
                          <motion.div
                            key={userId}
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            className="group flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2/60 transition-colors"
                          >
                            <UserAvatar userId={userId} avatar={info?.avatar} />
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium truncate">{info?.displayName || userId.split("/")[1]}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-text-muted font-mono truncate">{userId}</span>
                                {info?.email && (
                                  <>
                                    <span className="w-px h-3 bg-border-subtle" />
                                    <span className="text-[10px] text-text-muted truncate flex items-center gap-1"><Mail size={9} />{info.email}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleQuickRemoveUser(panelRole, userId)}
                              disabled={panelLoading}
                              className="rounded-lg p-1.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger/10 transition-all"
                              title={t("authz.roles.panel.removeUser" as any)}
                            >
                              <X size={14} />
                            </button>
                          </motion.div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* Add User */}
                {panel.type === "addUser" && (
                  filteredUsersForAdd.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-8">
                      <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
                        <Search size={24} className="text-text-muted/40" />
                      </div>
                      <p className="text-[13px] font-medium text-text-secondary">{t("authz.roles.panel.noResults" as any)}</p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {filteredUsersForAdd.map((u, idx) => {
                        const justAdded = recentlyAdded.has(u.value);
                        return (
                          <motion.button
                            key={u.value}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.02 }}
                            onClick={() => handleQuickUpdate(panelRole, "users", u.value)}
                            disabled={panelLoading || justAdded}
                            className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-all ${justAdded ? "bg-success/5" : "hover:bg-surface-2/60"} disabled:cursor-default`}
                          >
                            <UserAvatar userId={u.value} avatar={u.avatar} />
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium truncate">{u.displayName}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-text-muted font-mono truncate">{u.value}</span>
                                {u.email && (
                                  <>
                                    <span className="w-px h-3 bg-border-subtle" />
                                    <span className="text-[10px] text-text-muted truncate flex items-center gap-1"><Mail size={9} />{u.email}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            {justAdded ? (
                              <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[10px] font-semibold text-success">
                                <UserCheck size={12} /> {t("authz.roles.panel.added" as any)}
                              </span>
                            ) : (
                              <div className="rounded-lg border border-border bg-surface-2 p-1.5 text-text-muted hover:border-accent hover:text-accent hover:bg-accent/5 transition-all">
                                <Plus size={14} />
                              </div>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  )
                )}

                {/* Add Sub-Role */}
                {panel.type === "addRole" && (
                  filteredRolesForAdd.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-8">
                      <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
                        <Search size={24} className="text-text-muted/40" />
                      </div>
                      <p className="text-[13px] font-medium text-text-secondary">{t("authz.roles.panel.noResults" as any)}</p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {filteredRolesForAdd.map((r, idx) => {
                        const justAdded = recentlyAdded.has(r.name);
                        return (
                          <motion.button
                            key={r.name}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.02 }}
                            onClick={() => handleQuickUpdate(panelRole, "roles", r.name)}
                            disabled={panelLoading || justAdded}
                            className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-all ${justAdded ? "bg-success/5" : "hover:bg-surface-2/60"} disabled:cursor-default`}
                          >
                            <div className="w-9 h-9 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-text-muted flex-shrink-0">
                              <Shield size={15} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium truncate font-mono">{r.name}</div>
                              <div className="text-[11px] text-text-muted mt-0.5">{r.displayName || "\u2014"} · {r.users?.length ?? 0} {t("authz.roles.col.users" as any).toLowerCase()}</div>
                            </div>
                            {justAdded ? (
                              <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[10px] font-semibold text-success">
                                <Check size={12} /> {t("authz.roles.panel.added" as any)}
                              </span>
                            ) : (
                              <div className="rounded-lg border border-border bg-surface-2 p-1.5 text-text-muted hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/5 transition-all">
                                <Plus size={14} />
                              </div>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  )
                )}
              </div>

              {/* ── Footer ── */}
              {panel.type === "viewUsers" && (
                <div className="px-5 py-3 border-t border-border flex items-center justify-center">
                  <button
                    onClick={() => { setPanel({ type: "addUser", role: panelRole }); setPanelSearch(""); }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-4 py-2 text-[12px] font-semibold text-accent hover:bg-accent/20 transition-colors"
                  >
                    <UserPlus size={14} /> {t("authz.roles.quickAddUser" as any)}
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
      key: "effect", title: t("authz.perms.col.effect"), sortable: true, filterable: true, width: "90px",
      render: (_, p) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.effect === "Allow" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
          {p.effect === "Allow" ? t("permissions.effectAllow" as any) : t("permissions.effectDeny" as any)}
        </span>
      ),
    },
    {
      key: "state", title: t("authz.perms.col.approval" as any), sortable: true, filterable: true, width: "100px",
      render: (_, p) => {
        const state = p.state || "Approved";
        const styles: Record<string, string> = {
          Approved: "bg-success/10 text-success",
          Pending: "bg-amber-500/10 text-amber-500",
          Rejected: "bg-danger/10 text-danger",
        };
        return (
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[state] || "bg-surface-2 text-text-muted"}`}>
            {t(`authz.perms.state.${state}` as any) || state}
          </span>
        );
      },
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
function TestTab({ appOwner, appName, config, roles, permissions, t }: {
  appOwner: string; appName: string;
  config: BizAppConfig | null; roles: BizRole[]; permissions: BizPermission[];
  t: (key: any) => string;
}) {
  const [sub, setSub] = useState("");
  const [obj, setObj] = useState("");
  const [act, setAct] = useState("");
  const [dom, setDom] = useState("");
  const [result, setResult] = useState<{ allowed: boolean; detail: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [history, setHistory] = useState<{ time: string; sub: string; obj: string; act: string; dom?: string; allowed: boolean }[]>([]);

  // Detect if model uses domain (r = sub, dom, obj, act)
  const hasDomain = useMemo(() => {
    if (!config?.modelText) return false;
    for (const line of config.modelText.split("\n")) {
      if (/^r\s*=/.test(line.trim()) && line.includes("dom")) return true;
    }
    return false;
  }, [config?.modelText]);

  // Extract suggestions from existing data
  const suggestions = useMemo(() => {
    const subjects = new Set<string>();
    const resources = new Set<string>();
    const actions = new Set<string>();
    roles.forEach((r) => { r.users?.forEach((u) => subjects.add(u)); subjects.add(r.name); });
    permissions.forEach((p) => {
      p.users?.forEach((u) => subjects.add(u));
      p.roles?.forEach((r) => subjects.add(r));
      p.resources?.forEach((r) => resources.add(r));
      p.actions?.forEach((a) => actions.add(a));
    });
    return {
      subjects: [...subjects].sort(),
      resources: [...resources].sort(),
      actions: [...actions].sort(),
    };
  }, [roles, permissions]);

  const handleTest = async () => {
    if (!sub || !obj || !act) return;
    if (hasDomain && !dom) return;
    setTesting(true);
    try {
      const appId = `${appOwner}/${appName}`;
      const request = hasDomain ? [sub, dom, obj, act] : [sub, obj, act];
      const res = await BizBackend.bizEnforce(appId, request);
      if (res.status === "ok") {
        const allowed = !!res.data;
        setResult({ allowed, detail: "" });
        setHistory((h) => [{ time: new Date().toLocaleTimeString(), sub, obj, act, dom: hasDomain ? dom : undefined, allowed }, ...h.slice(0, 19)]);
      } else {
        setResult({ allowed: false, detail: res.msg || "Error" });
      }
    } catch (e: any) {
      setResult({ allowed: false, detail: e.message || "Error" });
    } finally {
      setTesting(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] font-mono text-text-primary outline-none focus:border-accent placeholder:text-text-muted";
  const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5";

  return (
    <div className="space-y-5">
      {/* Playground */}
      <div className="rounded-xl border border-border bg-surface-1 p-5">
        <h4 className="text-[14px] font-semibold text-text-primary mb-1 flex items-center gap-2">
          <Play size={16} className="text-accent" />
          {t("authz.test.title")}
        </h4>
        <p className="text-[12px] text-text-muted mb-4">{t("authz.test.subtitle")}</p>

        <div className={`grid grid-cols-1 gap-3 items-end ${hasDomain ? "md:grid-cols-[1fr_1fr_1fr_1fr_auto]" : "md:grid-cols-[1fr_1fr_1fr_auto]"}`}>
          <div>
            <label className={labelCls}>{t("authz.test.subject")}</label>
            <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder={`${appOwner}/alice`}
              list="test-subjects" className={inputCls} />
            <datalist id="test-subjects">
              {suggestions.subjects.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          {hasDomain && (
            <div>
              <label className={labelCls}>{t("authz.test.domain" as any)}</label>
              <input value={dom} onChange={(e) => setDom(e.target.value)} placeholder={t("authz.test.domainPlaceholder" as any)}
                className={inputCls} />
            </div>
          )}
          <div>
            <label className={labelCls}>{t("authz.test.object")}</label>
            <input value={obj} onChange={(e) => setObj(e.target.value)} placeholder="/orders/list"
              list="test-resources" className={inputCls} />
            <datalist id="test-resources">
              {suggestions.resources.map((r) => <option key={r} value={r} />)}
            </datalist>
          </div>
          <div>
            <label className={labelCls}>{t("authz.test.action")}</label>
            <input value={act} onChange={(e) => setAct(e.target.value)} placeholder="GET"
              list="test-actions" className={inputCls}
              onKeyDown={(e) => e.key === "Enter" && handleTest()} />
            <datalist id="test-actions">
              {suggestions.actions.map((a) => <option key={a} value={a} />)}
            </datalist>
          </div>
          <button onClick={handleTest} disabled={testing || !sub || !obj || !act || (hasDomain && !dom)}
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
                  {hasDomain && <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.test.domain" as any)}</th>}
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
                    {hasDomain && <td className="px-4 py-2 font-mono text-[11px]">{h.dom || ""}</td>}
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
