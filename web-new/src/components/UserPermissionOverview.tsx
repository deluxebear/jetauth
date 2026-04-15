import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "../i18n";
import * as ApplicationBackend from "../backend/ApplicationBackend";
import * as PermissionBackend from "../backend/PermissionBackend";
import * as RoleBackend from "../backend/RoleBackend";
import type { Application } from "../backend/ApplicationBackend";
import type { Permission } from "../backend/PermissionBackend";
import type { Role } from "../backend/RoleBackend";

// Color palette for app icons
const ICON_GRADIENTS = [
  "from-indigo-500 to-purple-500",
  "from-cyan-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-emerald-500 to-green-500",
  "from-blue-500 to-sky-500",
];

interface AppPermBlock {
  app: Application;
  roles: string[];
  permissions: { resource: string; allowed: string[]; denied: string[]; sourceRules: string[] }[];
}

interface Props {
  userOwner: string;
  userName: string;
}

export default function UserPermissionOverview({ userOwner, userName }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [blocks, setBlocks] = useState<AppPermBlock[]>([]);
  const userId = `${userOwner}/${userName}`;

  useEffect(() => {
    setLoading(true);

    Promise.all([
      ApplicationBackend.getApplicationsByOrganization({ owner: "admin", organization: userOwner }),
      PermissionBackend.getPermissions({ owner: userOwner }),
      RoleBackend.getRoles({ owner: userOwner }),
    ]).then(([appsRes, permsRes, rolesRes]) => {
      const apps = appsRes.status === "ok" && appsRes.data ? appsRes.data : [];
      const allPerms = permsRes.status === "ok" && permsRes.data ? permsRes.data : [];
      const allRoles = rolesRes.status === "ok" && rolesRes.data ? rolesRes.data : [];

      // Find roles this user belongs to
      const userRoleIds = new Set<string>();
      allRoles.forEach((r) => {
        if (r.users?.includes(userId) || r.users?.includes("*")) {
          userRoleIds.add(`${r.owner}/${r.name}`);
        }
      });

      // Build permission blocks per app
      const result: AppPermBlock[] = apps.map((app) => {
        // Permissions referencing this app
        const appPerms = allPerms.filter((p) =>
          p.isEnabled && p.state === "Approved" &&
          p.resources?.some((r) => r === app.name || r === "*")
        );

        // Roles this user has in this app context
        const appRoles: string[] = [];
        appPerms.forEach((p) => {
          p.roles?.forEach((r) => {
            if (userRoleIds.has(r) && !appRoles.includes(r)) appRoles.push(r);
          });
        });

        // Check if user is directly in any permission
        const userDirectPerms = appPerms.filter((p) =>
          p.users?.includes(userId) || p.users?.includes("*") ||
          p.roles?.some((r) => userRoleIds.has(r))
        );

        // Group by resource
        const resourceMap = new Map<string, { allowed: Set<string>; denied: Set<string>; rules: Set<string> }>();
        userDirectPerms.forEach((p) => {
          p.resources?.forEach((res) => {
            if (!resourceMap.has(res)) resourceMap.set(res, { allowed: new Set(), denied: new Set(), rules: new Set() });
            const entry = resourceMap.get(res)!;
            p.actions?.forEach((act) => {
              if (p.effect === "Allow") entry.allowed.add(act);
              else entry.denied.add(act);
            });
            entry.rules.add(p.name);
          });
        });

        const permissions = [...resourceMap.entries()].map(([resource, entry]) => ({
          resource,
          allowed: [...entry.allowed],
          denied: [...entry.denied],
          sourceRules: [...entry.rules],
        }));

        return { app, roles: appRoles, permissions };
      }).filter((b) => b.roles.length > 0 || b.permissions.length > 0);

      // Also include apps with no permissions (for completeness)
      const appsWithPerms = new Set(result.map((b) => b.app.name));
      const emptyApps = apps.filter((a) => !appsWithPerms.has(a.name)).map((app) => ({
        app,
        roles: [],
        permissions: [],
      }));

      setBlocks([...result, ...emptyApps]);
    }).finally(() => setLoading(false));
  }, [userOwner, userName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="py-12 text-center text-text-muted text-[13px]">{t("common.noData")}</div>
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        const hasAccess = block.roles.length > 0 || block.permissions.length > 0;
        return (
          <div key={block.app.name} className={`rounded-xl border border-border overflow-hidden ${!hasAccess ? "opacity-50" : ""}`}>
            {/* App header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-2 border-b border-border">
              <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${ICON_GRADIENTS[i % ICON_GRADIENTS.length]} flex items-center justify-center text-white font-bold text-[11px]`}>
                {(block.app.displayName || block.app.name).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <Link to={`/authorization/${block.app.organization || block.app.owner}/${block.app.name}`} className="text-[14px] font-semibold text-text-primary hover:text-accent transition-colors">
                  {block.app.displayName || block.app.name}
                </Link>
                <div className="text-[11px] text-text-muted font-mono">{block.app.organization || block.app.owner} / {block.app.name}</div>
              </div>
              <div className="flex gap-1">
                {block.roles.length > 0 ? block.roles.map((r) => (
                  <span key={r} className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-accent/10 text-accent">
                    {r.split("/").pop()}
                  </span>
                )) : (
                  <span className="text-[11px] text-text-muted">{t("authz.userPerms.noRole" as any)} · {t("authz.userPerms.noPermission" as any)}</span>
                )}
              </div>
            </div>

            {/* Permission table */}
            {block.permissions.length > 0 && (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.perms.col.resources" as any)}</th>
                    <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.userPerms.allowedActions" as any)}</th>
                    <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.userPerms.deniedActions" as any)}</th>
                    <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t("authz.userPerms.sourceRule" as any)}</th>
                  </tr>
                </thead>
                <tbody>
                  {block.permissions.map((perm) => (
                    <tr key={perm.resource} className="border-b border-border-subtle last:border-b-0">
                      <td className="px-4 py-2.5 font-mono text-[11px] text-text-secondary">{perm.resource}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {perm.allowed.map((a) => (
                            <span key={a} className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-success/10 text-success">{a}</span>
                          ))}
                          {perm.allowed.length === 0 && <span className="text-text-muted text-[11px]">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {perm.denied.map((a) => (
                            <span key={a} className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-danger/10 text-danger">{a}</span>
                          ))}
                          {perm.denied.length === 0 && <span className="text-text-muted text-[11px]">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-text-muted">{perm.sourceRules.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
