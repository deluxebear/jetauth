import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Settings, RefreshCw } from "lucide-react";
import { useTranslation } from "../i18n";
import { useOrganization } from "../OrganizationContext";
import * as ApplicationBackend from "../backend/ApplicationBackend";
import * as PermissionBackend from "../backend/PermissionBackend";
import * as RoleBackend from "../backend/RoleBackend";
import type { Application } from "../backend/ApplicationBackend";
import type { Permission } from "../backend/PermissionBackend";
import type { Role } from "../backend/RoleBackend";

interface AppAuthStats {
  app: Application;
  roles: Role[];
  permissions: Permission[];
  userCount: number;
  resourceCount: number;
}

// Color palette for app icons
const ICON_GRADIENTS = [
  "from-indigo-500 to-purple-500",
  "from-cyan-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-emerald-500 to-green-500",
  "from-blue-500 to-sky-500",
  "from-violet-500 to-fuchsia-500",
  "from-lime-500 to-yellow-500",
];

function getGradient(index: number) {
  return ICON_GRADIENTS[index % ICON_GRADIENTS.length];
}

function getInitial(app: Application) {
  return (app.displayName || app.name).charAt(0).toUpperCase();
}

export default function AuthorizationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getRequestOwner, selectedOrg, isAll } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [appStats, setAppStats] = useState<AppAuthStats[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    const owner = getRequestOwner();

    // Fetch apps, roles, permissions in parallel
    const appsPromise = isAll
      ? ApplicationBackend.getApplications({ owner })
      : ApplicationBackend.getApplicationsByOrganization({ owner: "admin", organization: selectedOrg });

    Promise.all([
      appsPromise,
      RoleBackend.getRoles({ owner }),
      PermissionBackend.getPermissions({ owner }),
    ]).then(([appsRes, rolesRes, permsRes]) => {
      const apps = appsRes.status === "ok" && appsRes.data ? appsRes.data : [];
      const allRoles = rolesRes.status === "ok" && rolesRes.data ? rolesRes.data : [];
      const allPerms = permsRes.status === "ok" && permsRes.data ? permsRes.data : [];

      // Build stats per app
      const stats: AppAuthStats[] = apps.map((app) => {
        // Permissions referencing this app
        const appPerms = allPerms.filter((p) =>
          p.resources?.some((r) => r === app.name || r === "*")
        );

        // Roles referenced in those permissions
        const roleIds = new Set<string>();
        appPerms.forEach((p) => p.roles?.forEach((r) => roleIds.add(r)));
        // Also include roles directly matching app org
        const appRoles = allRoles.filter(
          (r) => r.owner === (app.organization || app.owner) || roleIds.has(`${r.owner}/${r.name}`)
        );

        // Unique users across roles
        const userSet = new Set<string>();
        appRoles.forEach((r) => r.users?.forEach((u) => userSet.add(u)));
        appPerms.forEach((p) => p.users?.forEach((u) => userSet.add(u)));

        // Resources
        const resSet = new Set<string>();
        appPerms.forEach((p) => p.resources?.forEach((r) => { if (r !== "*") resSet.add(r); }));

        return {
          app,
          roles: appRoles,
          permissions: appPerms,
          userCount: userSet.size,
          resourceCount: resSet.size,
        };
      });

      setAppStats(stats);
    }).finally(() => setLoading(false));
  }, [selectedOrg, isAll, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("authz.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("authz.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.3 }}
            onClick={() => setRefreshKey((k) => k + 1)}
            className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors"
            title={t("common.refresh")}
          >
            <RefreshCw size={15} />
          </motion.button>
          <Link
            to="/models"
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
          >
            <Settings size={14} />
            {t("authz.globalConfig" as any)}
          </Link>
        </div>
      </div>

      {/* App Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {appStats.map((stat, i) => (
          <AppCard key={`${stat.app.owner}/${stat.app.name}`} stat={stat} index={i} />
        ))}

        {/* Bind new app card */}
        <button
          onClick={() => navigate("/applications")}
          className="group flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-subtle p-8 min-h-[180px] hover:border-accent hover:bg-accent/5 transition-all"
        >
          <div className="rounded-full p-3 bg-surface-2 group-hover:bg-accent/10 transition-colors">
            <Plus size={20} className="text-text-muted group-hover:text-accent transition-colors" />
          </div>
          <span className="text-[13px] text-text-muted group-hover:text-accent font-medium transition-colors">
            {t("authz.bindApp" as any)}
          </span>
        </button>
      </div>
    </div>
  );
}

function AppCard({ stat, index }: { stat: AppAuthStats; index: number }) {
  const { t } = useTranslation();
  const hasConfig = stat.permissions.length > 0 || stat.roles.length > 0;

  return (
    <Link
      to={`/authorization/${stat.app.organization || stat.app.owner}/${stat.app.name}`}
      className="group block rounded-xl border border-border bg-surface-1 p-5 hover:border-accent hover:shadow-lg hover:shadow-accent/5 transition-all hover:-translate-y-0.5"
    >
      {/* Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getGradient(index)} flex items-center justify-center text-white font-bold text-base`}>
            {getInitial(stat.app)}
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-text-primary group-hover:text-accent transition-colors">
              {stat.app.displayName || stat.app.name}
            </h3>
            <p className="text-[11px] text-text-muted font-mono">
              {stat.app.organization || stat.app.owner} / {stat.app.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${hasConfig ? "bg-success shadow-[0_0_6px] shadow-success/50" : "bg-text-muted"}`} />
          <span className={`text-[10px] font-semibold ${hasConfig ? "text-success" : "text-text-muted"}`}>
            {hasConfig ? t("authz.configured" as any) : t("authz.notConfigured" as any)}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-border-subtle">
        {[
          { label: t("authz.metrics.roles" as any), value: stat.roles.length },
          { label: t("authz.metrics.permissions" as any), value: stat.permissions.length },
          { label: t("authz.metrics.users" as any), value: stat.userCount },
          { label: t("authz.metrics.resources" as any), value: stat.resourceCount },
        ].map((m) => (
          <div key={m.label} className="text-center">
            <div className="text-[17px] font-bold text-text-primary font-mono">{m.value}</div>
            <div className="text-[10px] text-text-muted mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>
    </Link>
  );
}
