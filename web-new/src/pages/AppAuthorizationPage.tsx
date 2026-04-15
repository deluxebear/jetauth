import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, Play, Copy, Check, X, Users as UsersIcon, RefreshCw } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as ApplicationBackend from "../backend/ApplicationBackend";
import * as PermissionBackend from "../backend/PermissionBackend";
import * as RoleBackend from "../backend/RoleBackend";
import * as ModelBackend from "../backend/ModelBackend";
import * as AdapterBackend from "../backend/AdapterBackend";
import * as EnforcerBackend from "../backend/EnforcerBackend";
import * as UserBackend from "../backend/UserBackend";
import type { Application } from "../backend/ApplicationBackend";
import type { Permission } from "../backend/PermissionBackend";
import type { Role } from "../backend/RoleBackend";
import type { Model } from "../backend/ModelBackend";
import type { Adapter } from "../backend/AdapterBackend";
import type { Enforcer } from "../backend/EnforcerBackend";
import RoleUserDrawer from "../components/RoleUserDrawer";

type TabKey = "overview" | "roles" | "permissions" | "test" | "integration";

export default function AppAuthorizationPage() {
  const { owner, appName } = useParams<{ owner: string; appName: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [app, setApp] = useState<Application | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [allOrgRoles, setAllOrgRoles] = useState<Role[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [enforcers, setEnforcers] = useState<Enforcer[]>([]);

  // Drawer
  const [drawerRole, setDrawerRole] = useState<Role | null>(null);

  const fetchData = useCallback(() => {
    if (!owner || !appName) return;
    setLoading(true);

    // Application owner is always "admin" in the API
    Promise.all([
      ApplicationBackend.getApplication("admin", appName).catch(() => ({ status: "error" as const, msg: "", data: null as any })),
      PermissionBackend.getPermissions({ owner }).catch(() => ({ status: "error" as const, msg: "", data: [] as any })),
      RoleBackend.getRoles({ owner }).catch(() => ({ status: "error" as const, msg: "", data: [] as any })),
      ModelBackend.getModels({ owner }).catch(() => ({ status: "error" as const, msg: "", data: [] as any })),
      AdapterBackend.getAdapters({ owner }).catch(() => ({ status: "error" as const, msg: "", data: [] as any })),
      EnforcerBackend.getEnforcers({ owner }).catch(() => ({ status: "error" as const, msg: "", data: [] as any })),
    ]).then(([appRes, permsRes, rolesRes, modelsRes, adaptersRes, enforcersRes]) => {
      if (appRes.status === "ok" && appRes.data) setApp(appRes.data);
      const allPerms = permsRes.status === "ok" && permsRes.data ? permsRes.data : [];
      const allRoles = rolesRes.status === "ok" && rolesRes.data ? rolesRes.data : [];
      setAllOrgRoles(allRoles);

      // Filter permissions referencing this app
      const appPerms = allPerms.filter((p) =>
        p.resources?.some((r) => r === appName || r === "*")
      );
      setPermissions(appPerms);

      // Roles referenced in app permissions + all org roles
      const roleIds = new Set<string>();
      appPerms.forEach((p) => p.roles?.forEach((r) => roleIds.add(r)));
      setRoles(allRoles.filter((r) => roleIds.has(`${r.owner}/${r.name}`) || allPerms.some((p) => p.roles?.includes(`${r.owner}/${r.name}`))));

      setModels(modelsRes.status === "ok" && modelsRes.data ? modelsRes.data : []);
      setAdapters(adaptersRes.status === "ok" && adaptersRes.data ? adaptersRes.data : []);
      setEnforcers(enforcersRes.status === "ok" && enforcersRes.data ? enforcersRes.data : []);
    }).finally(() => setLoading(false));
  }, [owner, appName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !app) {
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
  const resSet = new Set<string>();
  permissions.forEach((p) => p.resources?.forEach((r) => { if (r !== "*") resSet.add(r); }));
  const allowCount = permissions.filter((p) => p.effect === "Allow").length;
  const denyCount = permissions.filter((p) => p.effect === "Deny").length;

  // Find model/adapter/enforcer linked to this app's permissions
  const modelIds = [...new Set(permissions.map((p) => p.model).filter(Boolean))];
  const adapterIds = [...new Set(permissions.map((p) => p.adapter).filter(Boolean))];
  const linkedModel = modelIds.length > 0 ? models.find((m) => modelIds.includes(`${m.owner}/${m.name}`)) : null;
  const linkedAdapter = adapterIds.length > 0 ? adapters.find((a) => adapterIds.includes(`${a.owner}/${a.name}`)) : null;
  const linkedEnforcer = enforcers.find((e) =>
    (linkedModel && e.model === `${linkedModel.owner}/${linkedModel.name}`) ||
    (linkedAdapter && e.adapter === `${linkedAdapter.owner}/${linkedAdapter.name}`)
  );

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "overview", label: t("authz.tab.overview" as any) },
    { key: "roles", label: t("authz.tab.roles" as any), count: allOrgRoles.length },
    { key: "permissions", label: t("authz.tab.permissions" as any), count: permissions.length },
    { key: "test", label: t("authz.tab.test" as any) },
    { key: "integration", label: t("authz.tab.integration" as any) },
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
              {(app.displayName || app.name).charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{app.displayName || app.name}</h1>
              <p className="text-[11px] text-text-muted font-mono">{app.organization || app.owner} / {app.name}</p>
            </div>
          </div>
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
        {/* Tab Bar */}
        <div className="flex -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text-secondary"
              }`}
            >
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
            permissions={permissions}
            roles={allOrgRoles}
            userCount={userSet.size}
            resourceCount={resSet.size}
            allowCount={allowCount}
            denyCount={denyCount}
            linkedModel={linkedModel}
            linkedAdapter={linkedAdapter}
            linkedEnforcer={linkedEnforcer}
            t={t}
          />
        )}
        {activeTab === "roles" && (
          <RolesTab
            roles={roles}
            allOrgRoles={allOrgRoles}
            permissions={permissions}
            onOpenDrawer={setDrawerRole}
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
            permissions={permissions}
            t={t}
          />
        )}
        {activeTab === "integration" && (
          <IntegrationTab app={app} t={t} modal={modal} />
        )}
      </div>

      {/* Role User Drawer */}
      <RoleUserDrawer
        role={drawerRole}
        onClose={() => setDrawerRole(null)}
        onUpdate={() => { fetchData(); }}
      />
    </div>
  );
}

// ═══════ OVERVIEW TAB ═══════
function OverviewTab({ permissions, roles, userCount, resourceCount, allowCount, denyCount, linkedModel, linkedAdapter, linkedEnforcer, t }: {
  permissions: Permission[]; roles: Role[]; userCount: number; resourceCount: number;
  allowCount: number; denyCount: number;
  linkedModel: Model | null; linkedAdapter: Adapter | null; linkedEnforcer: Enforcer | null;
  t: (key: any) => string;
}) {
  const stats = [
    { label: t("authz.metrics.roles"), value: roles.length, sub: `${roles.filter((r) => r.isEnabled).length} ${t("common.enabled" as any)}` },
    { label: t("authz.metrics.permissions"), value: permissions.length, sub: `${allowCount} ${t("authz.overview.allowRules")} · ${denyCount} ${t("authz.overview.denyRules")}` },
    { label: t("authz.metrics.users"), value: userCount },
    { label: t("authz.metrics.resources"), value: resourceCount },
  ];

  // Parse model text
  let modelType = "";
  let roleDef = "";
  let matcher = "";
  if (linkedModel?.modelText) {
    const text = linkedModel.modelText;
    if (text.includes("g = _, _, _")) { modelType = "RBAC with domains"; roleDef = "g = _, _, _"; }
    else if (text.includes("g = _, _")) { modelType = "RBAC"; roleDef = "g = _, _"; }
    else if (text.includes("role_definition")) { modelType = "RBAC (custom)"; }
    else { modelType = "ACL / ABAC"; }
    const matcherMatch = text.match(/m\s*=\s*(.+)/);
    if (matcherMatch) matcher = matcherMatch[1].trim();
  }

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface-1 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">{s.label}</div>
            <div className="text-[28px] font-bold text-text-primary font-mono tracking-tight">{s.value}</div>
            {s.sub && <div className="text-[11px] text-text-muted mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Model + Adapter */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <h4 className="text-[13px] font-semibold text-text-primary mb-3">{t("authz.overview.model")}</h4>
          <div className="space-y-2.5">
            <ConfigRow label={t("authz.overview.currentModel")} value={linkedModel ? `${linkedModel.owner}/${linkedModel.name}` : t("authz.overview.defaultModel")} accent={!!linkedModel} />
            {modelType && <ConfigRow label={t("authz.overview.modelType")} value={modelType} />}
            {roleDef && <ConfigRow label={t("authz.overview.roleDef")} value={roleDef} mono />}
            {matcher && <ConfigRow label={t("authz.overview.matcher")} value={matcher} mono small />}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <h4 className="text-[13px] font-semibold text-text-primary mb-3">{t("authz.overview.adapterEnforcer")}</h4>
          <div className="space-y-2.5">
            <ConfigRow label={t("authz.overview.adapter")} value={linkedAdapter ? `${linkedAdapter.owner}/${linkedAdapter.name}` : t("authz.overview.noModel")} accent={!!linkedAdapter} />
            {linkedAdapter && <ConfigRow label={t("authz.overview.dbType")} value={linkedAdapter.databaseType || linkedAdapter.type || "—"} />}
            {linkedAdapter && <ConfigRow label={t("authz.overview.policyTable")} value={linkedAdapter.table || "—"} mono />}
            <ConfigRow label={t("authz.overview.enforcer")} value={linkedEnforcer ? `${linkedEnforcer.owner}/${linkedEnforcer.name}` : t("authz.overview.noModel")} accent={!!linkedEnforcer} />
            <ConfigRow label={t("authz.overview.cache")} value={t("authz.overview.cacheDisabled")} warn />
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigRow({ label, value, accent, mono, small, warn }: {
  label: string; value: string; accent?: boolean; mono?: boolean; small?: boolean; warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border-subtle last:border-b-0">
      <span className="text-[12px] text-text-muted">{label}</span>
      <span className={`text-[12px] font-medium font-mono ${accent ? "text-accent" : warn ? "text-warning" : "text-text-primary"} ${small ? "text-[11px]" : ""} ${!mono ? "font-sans" : ""} max-w-[60%] text-right truncate`}>
        {value}
      </span>
    </div>
  );
}

// ═══════ ROLES TAB ═══════
function RolesTab({ roles, allOrgRoles, permissions, onOpenDrawer, onRefresh, appOwner, appName, t, modal, navigate }: {
  roles: Role[]; allOrgRoles: Role[]; permissions: Permission[];
  onOpenDrawer: (role: Role) => void; onRefresh: () => void;
  appOwner: string; appName: string;
  t: (key: any) => string; modal: any; navigate: any;
}) {
  // Count permissions per role
  const permCountByRole = (role: Role) => {
    const roleId = `${role.owner}/${role.name}`;
    return permissions.filter((p) => p.roles?.includes(roleId)).length;
  };

  const handleAddRole = async () => {
    const role = RoleBackend.newRole(appOwner);
    const res = await RoleBackend.addRole(role);
    if (res.status === "ok") {
      navigate(`/roles/${role.owner}/${role.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed"), "error");
    }
  };

  // Show all org roles, not just app-filtered ones
  const displayRoles = allOrgRoles.length > 0 ? allOrgRoles : roles;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-text-primary">{t("authz.roles.title")}</h3>
        <button onClick={handleAddRole} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover transition-colors">
          <Plus size={14} /> {t("authz.roles.add")}
        </button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border">
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.roles.col.name")}</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.roles.col.users")}</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.roles.col.subRoles")}</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.roles.col.permissions")}</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.roles.col.status")}</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("common.action" as any)}</th>
            </tr>
          </thead>
          <tbody>
            {displayRoles.map((role) => {
              const pc = permCountByRole(role);
              const userCount = role.users?.length ?? 0;
              return (
                <tr key={`${role.owner}/${role.name}`} className="border-b border-border-subtle hover:bg-accent/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/roles/${role.owner}/${encodeURIComponent(role.name)}`} className="font-mono font-semibold text-accent hover:underline">
                      {role.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onOpenDrawer(role)}
                      className={`inline-flex items-center gap-1 font-mono font-semibold rounded px-2 py-0.5 transition-colors ${
                        userCount > 0
                          ? "text-blue-400 hover:bg-blue-400/10 cursor-pointer"
                          : "text-text-muted cursor-default"
                      }`}
                    >
                      <UsersIcon size={12} className="opacity-60" />
                      {userCount}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-text-muted font-mono text-[11px]">
                      {role.roles?.length ? role.roles.map((r) => r.split("/").pop()).join(", ") : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      pc > 0 ? "bg-accent/10 text-accent" : "bg-warning/10 text-warning"
                    }`}>
                      {pc} {t("authz.roles.rules")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      role.isEnabled ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    }`}>
                      {role.isEnabled ? t("common.enabled" as any) : t("common.disabled" as any)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/roles/${role.owner}/${encodeURIComponent(role.name)}`} className="text-[11px] text-text-muted hover:text-accent transition-colors">
                      {t("common.edit")}
                    </Link>
                  </td>
                </tr>
              );
            })}
            {displayRoles.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted text-[13px]">{t("common.noData")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════ PERMISSIONS TAB ═══════
function PermissionsTab({ permissions, onRefresh, appOwner, appName, t, modal, navigate }: {
  permissions: Permission[]; onRefresh: () => void;
  appOwner: string; appName: string;
  t: (key: any) => string; modal: any; navigate: any;
}) {
  const handleAddPermission = async () => {
    const perm = PermissionBackend.newPermission(appOwner);
    perm.resources = [appName];
    const res = await PermissionBackend.addPermission(perm);
    if (res.status === "ok") {
      navigate(`/permissions/${perm.owner}/${perm.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed"), "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-text-primary">{t("authz.perms.title")}</h3>
        <div className="flex gap-2">
          <button onClick={handleAddPermission} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover transition-colors">
            <Plus size={14} /> {t("authz.perms.add")}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border">
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.perms.col.name")}</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.perms.col.subject")}</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.perms.col.resources")}</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.perms.col.actions")}</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.perms.col.effect")}</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.perms.col.approval")}</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("common.action" as any)}</th>
            </tr>
          </thead>
          <tbody>
            {permissions.map((perm) => (
              <tr key={`${perm.owner}/${perm.name}`} className="border-b border-border-subtle hover:bg-accent/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <Link to={`/permissions/${perm.owner}/${encodeURIComponent(perm.name)}`} className="font-mono font-semibold text-accent hover:underline">
                    {perm.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {perm.roles?.map((r) => (
                      <span key={r} className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-accent/10 text-accent">
                        {r.split("/").pop()}
                      </span>
                    ))}
                    {perm.users?.filter((u) => u !== "*").map((u) => (
                      <span key={u} className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-400">
                        {u.split("/").pop()}
                      </span>
                    ))}
                    {perm.users?.includes("*") && (
                      <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-400">*</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-[11px] text-text-secondary">{perm.resources?.join(", ") || "—"}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {perm.actions?.map((a) => (
                      <span key={a} className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-cyan-500/10 text-cyan-400">{a}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    perm.effect === "Allow" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                  }`}>
                    {perm.effect === "Allow" ? t("permissions.effectAllow" as any) : t("permissions.effectDeny" as any)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {perm.state === "Pending" ? (
                    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-warning/10 text-warning">Pending</span>
                  ) : (
                    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-success/10 text-success">Approved</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {perm.state === "Pending" && (
                      <Link to={`/permissions/${perm.owner}/${encodeURIComponent(perm.name)}`} className="text-[11px] text-success font-semibold hover:underline">
                        {t("authz.perms.approve")}
                      </Link>
                    )}
                    <Link to={`/permissions/${perm.owner}/${encodeURIComponent(perm.name)}`} className="text-[11px] text-text-muted hover:text-accent transition-colors">
                      {t("common.edit")}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {permissions.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted text-[13px]">{t("common.noData")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════ TEST TAB ═══════
function TestTab({ appOwner, appName, permissions, t }: {
  appOwner: string; appName: string; permissions: Permission[];
  t: (key: any) => string;
}) {
  const [sub, setSub] = useState("");
  const [obj, setObj] = useState("");
  const [act, setAct] = useState("");
  const [selectedPermId, setSelectedPermId] = useState("");
  const [result, setResult] = useState<{ allowed: boolean; key: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [history, setHistory] = useState<{ time: string; sub: string; obj: string; act: string; allowed: boolean; key: string }[]>([]);

  const handleTest = async () => {
    if (!sub || !obj || !act) return;
    setTesting(true);
    try {
      const params: any = {};
      if (selectedPermId) {
        params.permissionId = selectedPermId;
      } else {
        params.owner = appOwner;
      }
      const res = await PermissionBackend.enforce(params, [sub, obj, act]);
      if (res.status === "ok" && res.data) {
        const allowed = res.data[0] ?? false;
        const key = (res as any).data2?.[0] || "";
        setResult({ allowed, key });
        setHistory((h) => [{ time: new Date().toLocaleTimeString(), sub, obj, act, allowed, key }, ...h.slice(0, 19)]);
      } else {
        setResult({ allowed: false, key: res.msg || "" });
      }
    } catch (e: any) {
      setResult({ allowed: false, key: e.message || "Error" });
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

        {/* Permission selector */}
        <div className="mb-4">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">{t("authz.test.selectPermission")}</label>
          <select
            value={selectedPermId}
            onChange={(e) => setSelectedPermId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] font-mono text-text-primary outline-none focus:border-accent"
          >
            <option value="">{t("authz.test.allPermissions")}</option>
            {permissions.map((p) => (
              <option key={`${p.owner}/${p.name}`} value={`${p.owner}/${p.name}`}>{p.name} ({p.effect})</option>
            ))}
          </select>
        </div>

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
              {result.key && <span className="font-normal text-[12px] ml-2 opacity-80">— {result.key}</span>}
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
                        {h.allowed ? "Allow" : "Deny"}
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
function IntegrationTab({ app, t, modal }: { app: Application; t: (key: any) => string; modal: any }) {
  const [copied, setCopied] = useState<string | null>(null);
  const endpoint = window.location.origin;
  const clientId = app.clientId || "<clientId>";
  const clientSecret = app.clientSecret === "***" ? "<clientSecret>" : (app.clientSecret || "<clientSecret>");
  const orgName = app.organization || app.owner;

  const copyCode = (code: string, key: string) => {
    navigator.clipboard.writeText(code);
    setCopied(key);
    modal.toast(t("authz.integration.copySuccess"), "success");
    setTimeout(() => setCopied(null), 2000);
  };

  const goCode = `import casdoorsdk "github.com/casdoor/casdoor-go-sdk"

// Initialize SDK — pre-filled with ${app.displayName || app.name} credentials
func init() {
    casdoorsdk.InitConfig(
        "${endpoint}",              // JetAuth Endpoint
        "${clientId}",              // ClientId
        "${clientSecret}",          // ClientSecret
        "",                         // Certificate (optional)
        "${orgName}",               // Organization
        "${app.name}",              // Application
    )
}

// API middleware — check permission on every request
func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        userId := getUserFromJWT(r)
        allowed, _ := casdoorsdk.Enforce(
            "", "", "", "", "${orgName}",
            casdoorsdk.CasbinRequest{userId, r.URL.Path, r.Method},
        )
        if !allowed { http.Error(w, "Forbidden", 403); return }
        next.ServeHTTP(w, r)
    })
}`;

  const tsCode = `// After login, batch query current user's permissions
const resp = await fetch("${endpoint}/api/enforce?owner=${orgName}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Basic " + btoa("${clientId}:${clientSecret}"),
  },
  body: JSON.stringify([userId, resource, action]),
});
const { data } = await resp.json();
const allowed = data?.[0] ?? false;

// Frontend permission check (local, no latency)
function canDo(resource: string, action: string): boolean {
  return permissions.some(p =>
    matchResource(p.resource, resource) && p.actions.includes(action)
  );
}

// Button-level control
<Button disabled={!canDo("/orders", "DELETE")}>Delete Order</Button>

// Menu-level control
{canDo("/finance/reports", "GET") && <MenuItem>Financial Reports</MenuItem>}`;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border-l-[3px] border-l-accent border border-border bg-accent/[0.03] p-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-accent mb-2">{t("authz.integration.title")}</div>
        <p className="text-[12px] text-text-muted">{t("authz.integration.subtitle")}</p>
      </div>

      {/* Backend */}
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

      {/* Frontend */}
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
