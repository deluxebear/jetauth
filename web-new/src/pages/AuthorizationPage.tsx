import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Settings, RefreshCw, X, Loader2 } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useOrganization } from "../OrganizationContext";
import SimpleSelect from "../components/SimpleSelect";
import * as ApplicationBackend from "../backend/ApplicationBackend";
import * as PermissionBackend from "../backend/PermissionBackend";
import * as RoleBackend from "../backend/RoleBackend";
import * as ModelBackend from "../backend/ModelBackend";
import * as AdapterBackend from "../backend/AdapterBackend";
import * as EnforcerBackend from "../backend/EnforcerBackend";
import type { Application } from "../backend/ApplicationBackend";
import type { Permission } from "../backend/PermissionBackend";
import type { Role } from "../backend/RoleBackend";
import type { Model } from "../backend/ModelBackend";

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
  const modal = useModal();
  const { getRequestOwner, selectedOrg, isAll } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [appStats, setAppStats] = useState<AppAuthStats[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    setLoading(true);
    const owner = getRequestOwner();

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

      const stats: AppAuthStats[] = apps.map((app) => {
        const appPerms = allPerms.filter((p) =>
          p.resources?.some((r) => r === app.name || r === "*")
        );
        const roleIds = new Set<string>();
        appPerms.forEach((p) => p.roles?.forEach((r) => roleIds.add(r)));
        const appRoles = allRoles.filter(
          (r) => r.owner === (app.organization || app.owner) || roleIds.has(`${r.owner}/${r.name}`)
        );
        const userSet = new Set<string>();
        appRoles.forEach((r) => r.users?.forEach((u) => userSet.add(u)));
        appPerms.forEach((p) => p.users?.forEach((u) => userSet.add(u)));
        const resSet = new Set<string>();
        appPerms.forEach((p) => p.resources?.forEach((r) => { if (r !== "*") resSet.add(r); }));
        return { app, roles: appRoles, permissions: appPerms, userCount: userSet.size, resourceCount: resSet.size };
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

        {/* Create app card */}
        <button
          onClick={() => setShowWizard(true)}
          className="group flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-subtle p-8 min-h-[180px] hover:border-accent hover:bg-accent/5 transition-all"
        >
          <div className="rounded-full p-3 bg-surface-2 group-hover:bg-accent/10 transition-colors">
            <Plus size={20} className="text-text-muted group-hover:text-accent transition-colors" />
          </div>
          <span className="text-[13px] text-text-muted group-hover:text-accent font-medium transition-colors">
            {t("authz.createApp" as any)}
          </span>
        </button>
      </div>

      {/* Quick Create Wizard */}
      <QuickCreateWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={() => { setShowWizard(false); setRefreshKey((k) => k + 1); }}
      />
    </div>
  );
}

// ═══════ APP CARD ═══════
function AppCard({ stat, index }: { stat: AppAuthStats; index: number }) {
  const { t } = useTranslation();
  const hasConfig = stat.permissions.length > 0 || stat.roles.length > 0;

  return (
    <Link
      to={`/authorization/${stat.app.organization || stat.app.owner}/${stat.app.name}`}
      className="group block rounded-xl border border-border bg-surface-1 p-5 hover:border-accent hover:shadow-lg hover:shadow-accent/5 transition-all hover:-translate-y-0.5"
    >
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

// ═══════ QUICK CREATE WIZARD ═══════
function QuickCreateWizard({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const { t } = useTranslation();
  const modal = useModal();
  const navigate = useNavigate();
  const { getNewEntityOwner } = useOrganization();

  const [appName, setAppName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedModel, setSelectedModel] = useState("__default__");
  const [models, setModels] = useState<Model[]>([]);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState<{ label: string; done: boolean; error?: string }[]>([]);

  const orgName = getNewEntityOwner();

  useEffect(() => {
    if (!open) return;
    setAppName("");
    setDisplayName("");
    setSelectedModel("__default__");
    setStep(0);
    setProgress([]);
    // Load models from both org and built-in
    Promise.all([
      ModelBackend.getModels({ owner: orgName === "built-in" ? "admin" : orgName }).catch(() => ({ status: "ok" as const, data: [] as Model[] })),
      ModelBackend.getModels({ owner: "admin" }).catch(() => ({ status: "ok" as const, data: [] as Model[] })),
    ]).then(([orgRes, adminRes]) => {
      const orgModels = orgRes.status === "ok" && orgRes.data ? orgRes.data : [];
      const adminModels = adminRes.status === "ok" && adminRes.data ? adminRes.data : [];
      // Merge and deduplicate
      const seen = new Set<string>();
      const all: Model[] = [];
      [...orgModels, ...adminModels].forEach((m) => {
        const id = `${(m as any).owner}/${m.name}`;
        if (!seen.has(id)) { seen.add(id); all.push(m); }
      });
      setModels(all);
    });
  }, [open, orgName]);

  // Filter out incompatible models (6 fields where 6th != permissionId)
  const compatibleModels = models.filter((m) => {
    if (!m.modelText) return true;
    const match = m.modelText.match(/\[policy_definition\]\s*\n\s*p\s*=\s*(.+)/);
    if (!match) return true;
    const fields = match[1].split(",").map((f) => f.trim());
    if (fields.length === 6 && fields[5] !== "permissionId") return false;
    if (fields.length > 6) return false;
    return true;
  });

  const modelOptions = [
    { value: "__default__", label: t("authz.overview.defaultModel" as any) },
    ...compatibleModels.map((m) => ({ value: `${(m as any).owner}/${m.name}`, label: `${(m as any).owner}/${m.name}` })),
  ];

  const handleCreate = async () => {
    if (!appName.trim()) return;
    setCreating(true);
    setStep(1);

    const steps = [
      { label: t("authz.wizard.creatingApp" as any), done: false },
      { label: t("authz.wizard.creatingRole" as any), done: false },
      { label: t("authz.wizard.creatingAdapter" as any), done: false },
      { label: t("authz.wizard.creatingPermission" as any), done: false },
      { label: t("authz.wizard.creatingEnforcer" as any), done: false },
    ];
    setProgress([...steps]);

    const adapterId = `${orgName}/${appName}-adapter`;
    const adapterName = `${appName}-adapter`;

    try {
      // Pre-cleanup: delete any leftover entities from previous failed attempts (order matters: permission → role → adapter → enforcer → app)
      const cleanupPerm = { owner: orgName, name: `${appName}-access` } as any;
      const cleanupRole = { owner: orgName, name: `${appName}-admin` } as any;
      const cleanupAdapter = { owner: orgName, name: `${appName}-adapter` } as any;
      const cleanupEnforcer = { owner: orgName, name: `${appName}-enforcer` } as any;
      const cleanupApp = { owner: "admin", name: appName.trim() } as any;
      await Promise.all([
        PermissionBackend.deletePermission(cleanupPerm).catch(() => {}),
        EnforcerBackend.deleteEnforcer(cleanupEnforcer).catch(() => {}),
      ]);
      await RoleBackend.deleteRole(cleanupRole).catch(() => {});
      await Promise.all([
        AdapterBackend.deleteAdapter(cleanupAdapter).catch(() => {}),
        ApplicationBackend.deleteApplication(cleanupApp).catch(() => {}),
      ]);

      // Step 1: Create Application
      const app = ApplicationBackend.newApplication(orgName);
      app.name = appName.trim();
      app.displayName = displayName.trim() || appName.trim();
      const appRes = await ApplicationBackend.addApplication(app);
      if (appRes.status !== "ok") {
        steps[0].error = appRes.msg || t("common.addFailed" as any);
        setProgress([...steps]);
        setCreating(false);
        return;
      }
      steps[0].done = true;
      setProgress([...steps]);

      // Step 2: Create or update admin Role
      const role = RoleBackend.newRole(orgName);
      role.name = `${appName}-admin`;
      role.displayName = `${displayName || appName} Admin`;
      role.domains = [appName];
      const roleRes = await RoleBackend.addRole(role);
      if (roleRes.status !== "ok") {
        steps[1].error = roleRes.msg || t("common.addFailed" as any);
        setProgress([...steps]);
        setCreating(false);
        return;
      }
      steps[1].done = true;
      setProgress([...steps]);

      // Step 3: Create or update Adapter
      const adapter = AdapterBackend.newAdapter(orgName);
      adapter.name = adapterName;
      adapter.table = `${appName.replace(/-/g, "_")}_policy`;
      adapter.useSameDb = true;
      const adapterRes = await AdapterBackend.addAdapter(adapter);
      if (adapterRes.status !== "ok") {
        steps[2].error = adapterRes.msg || t("common.addFailed" as any);
        setProgress([...steps]);
        setCreating(false);
        return;
      }
      steps[2].done = true;
      setProgress([...steps]);

      // Step 4: Create or update default Permission
      // Create permission with empty users/roles/resources/actions first
      // so addPolicies generates zero policies (avoids model compatibility issues).
      // Users can fill in details via the edit page afterward.
      const perm = PermissionBackend.newPermission(orgName);
      perm.name = `${appName}-access`;
      perm.displayName = `${displayName || appName} Access`;
      perm.resourceType = "Application";
      perm.resources = [appName];
      perm.users = [];
      perm.roles = [`${orgName}/${appName}-admin`];
      perm.actions = ["Read", "Write", "Admin"];
      perm.effect = "Allow";
      perm.model = selectedModel === "__default__" ? "" : selectedModel;
      perm.adapter = adapterId;
      perm.state = "Approved";
      const permRes = await PermissionBackend.addPermission(perm);
      if (permRes.status !== "ok") {
        console.error("[wizard] Permission creation failed:", permRes.msg);
        steps[3].error = permRes.msg || t("common.addFailed" as any);
        setProgress([...steps]);
        setCreating(false);
        return;
      }
      steps[3].done = true;
      setProgress([...steps]);

      // Step 5: Create or update Enforcer
      const enforcer = EnforcerBackend.newEnforcer(orgName);
      enforcer.name = `${appName}-enforcer`;
      enforcer.displayName = `${displayName || appName} Enforcer`;
      enforcer.model = selectedModel === "__default__" ? "" : selectedModel;
      enforcer.adapter = adapterId;
      const enforcerRes = await EnforcerBackend.addEnforcer(enforcer);
      if (enforcerRes.status !== "ok") {
        steps[4].error = enforcerRes.msg || t("common.addFailed" as any);
        setProgress([...steps]);
        setCreating(false);
        return;
      }
      steps[4].done = true;
      setProgress([...steps]);

      // All done — short delay then navigate
      setTimeout(() => {
        modal.toast(t("authz.wizard.success" as any));
        onCreated();
        navigate(`/authorization/${orgName}/${appName}`);
      }, 600);
    } catch (e: any) {
      modal.toast(e.message || t("common.saveFailed" as any), "error");
      setCreating(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={!creating ? onClose : undefined}
            className="fixed inset-0 bg-black/40 z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-w-[92vw] bg-surface-1 border border-border rounded-2xl shadow-2xl z-[51] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-[16px] font-bold text-text-primary">{t("authz.wizard.title" as any)}</h2>
                <p className="text-[12px] text-text-muted mt-0.5">{t("authz.wizard.subtitle" as any)}</p>
              </div>
              {!creating && (
                <button onClick={onClose} className="rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>

            {step === 0 ? (
              /* ═══ Form Step ═══ */
              <div className="px-6 py-5 space-y-4">
                {/* App Name */}
                <div>
                  <label className="block text-[12px] font-semibold text-text-primary mb-1.5">
                    {t("authz.wizard.appName" as any)} <span className="text-danger">*</span>
                  </label>
                  <input
                    value={appName}
                    onChange={(e) => setAppName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                    placeholder="erp-system"
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] font-mono text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
                    autoFocus
                  />
                  <p className="text-[11px] text-text-muted mt-1">{t("authz.wizard.appNameHint" as any)}</p>
                </div>

                {/* Display Name */}
                <div>
                  <label className="block text-[12px] font-semibold text-text-primary mb-1.5">
                    {t("field.displayName" as any)}
                  </label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("authz.wizard.displayNamePlaceholder" as any)}
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
                  />
                </div>

                {/* Model */}
                <div>
                  <label className="block text-[12px] font-semibold text-text-primary mb-1.5">
                    {t("authz.overview.model" as any)}
                  </label>
                  <SimpleSelect
                    value={selectedModel}
                    options={modelOptions}
                    onChange={setSelectedModel}
                  />
                  <p className="text-[11px] text-text-muted mt-1">{t("authz.wizard.modelHint" as any)}</p>
                </div>

                {/* What will be created */}
                <div className="rounded-lg bg-surface-2 border border-border-subtle p-3">
                  <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">{t("authz.wizard.willCreate" as any)}</div>
                  <div className="space-y-1.5 text-[12px] text-text-secondary">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                      {t("authz.wizard.willCreateApp" as any)}: <span className="font-mono font-medium text-text-primary">{appName || "..."}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      {t("authz.wizard.willCreateRole" as any)}: <span className="font-mono font-medium text-text-primary">{appName ? `${appName}-admin` : "...-admin"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      {t("authz.wizard.willCreateAdapter" as any)}: <span className="font-mono font-medium text-text-primary">{appName ? `${appName}-adapter` : "...-adapter"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      {t("authz.wizard.willCreatePerm" as any)}: <span className="font-mono font-medium text-text-primary">{appName ? `${appName}-access` : "...-access"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                      {t("authz.wizard.willCreateEnforcer" as any)}: <span className="font-mono font-medium text-text-primary">{appName ? `${appName}-enforcer` : "...-enforcer"}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ═══ Progress Step ═══ */
              <div className="px-6 py-5 space-y-3">
                {progress.map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {p.error ? (
                      <div className="w-5 h-5 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                        <X size={12} className="text-danger" />
                      </div>
                    ) : p.done ? (
                      <div className="w-5 h-5 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-success"><path d="M20 6L9 17l-5-5"/></svg>
                      </div>
                    ) : (
                      <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        <Loader2 size={14} className="text-accent animate-spin" />
                      </div>
                    )}
                    <span className={`text-[13px] ${p.done ? "text-text-primary" : p.error ? "text-danger" : "text-text-muted"}`}>
                      {p.label}
                    </span>
                    {p.error && <span className="text-[11px] text-danger ml-auto truncate max-w-[200px]">{p.error}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-surface-0/50">
              {step === 0 ? (
                <>
                  <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!appName.trim()}
                    className="rounded-lg bg-accent px-5 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
                  >
                    {t("authz.wizard.create" as any)}
                  </button>
                </>
              ) : (
                !creating && progress.some((p) => p.error) && (
                  <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                    {t("common.cancel")}
                  </button>
                )
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
