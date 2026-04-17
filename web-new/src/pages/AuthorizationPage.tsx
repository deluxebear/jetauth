import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, RefreshCw, X, Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useOrganization } from "../OrganizationContext";
import * as BizBackend from "../backend/BizBackend";
import * as ApplicationBackend from "../backend/ApplicationBackend";
import type { BizAppConfig } from "../backend/BizBackend";
import { DEFAULT_RBAC_MODEL, MODEL_PRESETS } from "../backend/BizBackend";
import type { ModelPreset } from "../backend/BizBackend";
import type { Application } from "../backend/ApplicationBackend";

interface BizAppCardData {
  config: BizAppConfig;
  roleCount: number;
  permissionCount: number;
  userCount: number;
  icon: string; // favicon from Application module
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

function getInitial(config: BizAppConfig) {
  return (config.displayName || config.appName).charAt(0).toUpperCase();
}

export default function AuthorizationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const modal = useModal();
  const { getRequestOwner, selectedOrg, isAll } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [cardData, setCardData] = useState<BizAppCardData[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    setLoading(true);
    const owner = getRequestOwner();

    // Fetch configs + all applications in parallel
    Promise.all([
      BizBackend.getBizAppConfigs(owner),
      ApplicationBackend.getApplications({ owner: "admin" }).catch(() => ({ status: "ok" as const, data: [] as Application[] })),
    ]).then(async ([configsRes, appsRes]) => {
      const configs = configsRes.status === "ok" && configsRes.data ? configsRes.data : [];

      // Build appName → favicon map from applications
      const apps = appsRes.status === "ok" && appsRes.data ? appsRes.data : [];
      const faviconMap = new Map<string, string>();
      for (const app of apps) {
        const favicon = app.favicon && app.favicon !== "/img/favicon.png" ? app.favicon : (app.logo && app.logo !== "/img/logo.png" ? app.logo : "");
        if (favicon) faviconMap.set(app.name, favicon);
      }

      // For each config, fetch roles and permissions to get counts
      const data: BizAppCardData[] = await Promise.all(
        configs.map(async (config) => {
          const [rolesRes, permsRes] = await Promise.all([
            BizBackend.getBizRoles(config.owner, config.appName).catch(() => ({ status: "ok" as const, data: [] as BizBackend.BizRole[] })),
            BizBackend.getBizPermissions(config.owner, config.appName).catch(() => ({ status: "ok" as const, data: [] as BizBackend.BizPermission[] })),
          ]);
          const roles = rolesRes.status === "ok" && rolesRes.data ? rolesRes.data : [];
          const perms = permsRes.status === "ok" && permsRes.data ? permsRes.data : [];

          // User aggregation across roles/permissions moved to biz_role_member /
          // biz_permission_grantee tables — unique count is no longer available from the
          // role/permission list alone and would need a dedicated backend aggregation.
          // Surface 0 for now; this is cosmetic on the app-card overview.
          const userCount = 0;

          return {
            config,
            roleCount: roles.length,
            permissionCount: perms.length,
            userCount,
            icon: faviconMap.get(config.appName) || "",
          };
        })
      );

      setCardData(data);
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
        </div>
      </div>

      {/* App Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cardData.map((data, i) => (
          <AppCard key={`${data.config.owner}/${data.config.appName}`} data={data} index={i} />
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
        existingAppNames={cardData.map((c) => c.config.appName)}
      />
    </div>
  );
}

// ═══════ APP CARD ═══════
function AppCard({ data, index }: { data: BizAppCardData; index: number }) {
  const { t } = useTranslation();

  return (
    <Link
      to={`/authorization/${data.config.owner}/${data.config.appName}`}
      className="group block rounded-xl border border-border bg-surface-1 p-5 hover:border-accent hover:shadow-lg hover:shadow-accent/5 transition-all hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {data.icon ? (
            <img src={data.icon} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getGradient(index)} flex items-center justify-center text-white font-bold text-base`}>
              {getInitial(data.config)}
            </div>
          )}
          <div>
            <h3 className="text-[14px] font-semibold text-text-primary group-hover:text-accent transition-colors">
              {data.config.displayName || data.config.appName}
            </h3>
            <p className="text-[11px] text-text-muted font-mono">
              {data.config.owner} / {data.config.appName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${data.config.isEnabled ? "bg-success shadow-[0_0_6px] shadow-success/50" : "bg-text-muted"}`} />
          <span className={`text-[10px] font-semibold ${data.config.isEnabled ? "text-success" : "text-text-muted"}`}>
            {data.config.isEnabled ? t("authz.configured" as any) : t("authz.notConfigured" as any)}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-border-subtle">
        {[
          { label: t("authz.metrics.roles" as any), value: data.roleCount },
          { label: t("authz.metrics.permissions" as any), value: data.permissionCount },
          { label: t("authz.metrics.policies" as any) || "Policies", value: "-" },
          { label: t("authz.metrics.users" as any), value: data.userCount },
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
function QuickCreateWizard({ open, onClose, onCreated, existingAppNames }: {
  open: boolean; onClose: () => void; onCreated: () => void; existingAppNames: string[];
}) {
  const { t } = useTranslation();
  const modal = useModal();
  const navigate = useNavigate();
  const { selectedOrg, isAll } = useOrganization();
  const { getNewEntityOwner } = useOrganization();

  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);

  // Step 0: Select application
  const [apps, setApps] = useState<Application[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);

  // Step 1: Model selection
  const [selectedPreset, setSelectedPreset] = useState<string>("rbac-api");
  const [modelText, setModelText] = useState(DEFAULT_RBAC_MODEL);
  const [showCustomEditor, setShowCustomEditor] = useState(false);

  // Step 2: Policy table name
  const [policyTable, setPolicyTable] = useState("");

  const orgName = getNewEntityOwner();

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSelectedApp(null);
    setSelectedPreset("rbac-api");
    setModelText(DEFAULT_RBAC_MODEL);
    setShowCustomEditor(false);
    setPolicyTable("");
    setCreating(false);

    // Load applications — use org-specific endpoint when a specific org is selected
    setLoadingApps(true);
    const appsPromise = isAll
      ? ApplicationBackend.getApplications({ owner: "admin" })
      : ApplicationBackend.getApplicationsByOrganization({ owner: "admin", organization: selectedOrg });
    appsPromise
      .then((res) => {
        const appList = res.status === "ok" && res.data ? res.data : [];
        // Filter out apps that already have biz config
        const configured = new Set(existingAppNames);
        setApps(appList.filter((app) => !configured.has(app.name)));
      })
      .finally(() => setLoadingApps(false));
  }, [open, orgName]);

  // Auto-generate policy table name when app is selected
  useEffect(() => {
    if (selectedApp) {
      setPolicyTable(`biz_${selectedApp.name.replace(/-/g, "_")}_policy`);
    }
  }, [selectedApp]);

  const handleCreate = async () => {
    if (!selectedApp) return;
    setCreating(true);

    try {
      const config: BizAppConfig = {
        owner: orgName,
        appName: selectedApp.name,
        createdTime: new Date().toISOString(),
        updatedTime: new Date().toISOString(),
        displayName: selectedApp.displayName || selectedApp.name,
        description: "",
        modelText,
        policyTable: policyTable || `biz_${selectedApp.name.replace(/-/g, "_")}_policy`,
        isEnabled: true,
      };

      const res = await BizBackend.addBizAppConfig(config);
      if (res.status !== "ok") {
        modal.toast(res.msg || t("common.addFailed" as any), "error");
        setCreating(false);
        return;
      }

      modal.toast(t("authz.wizard.bizSuccess" as any));
      onCreated();
      navigate(`/authorization/${orgName}/${selectedApp.name}`);
    } catch (e: any) {
      modal.toast(e.message || t("common.saveFailed" as any), "error");
      setCreating(false);
    }
  };

  const canProceed = () => {
    if (step === 0) return !!selectedApp;
    if (step === 1) return !!modelText.trim();
    if (step === 2) return !!policyTable.trim();
    return false;
  };

  const handleNext = () => {
    if (step < 2) setStep(step + 1);
    else handleCreate();
  };

  const stepLabels = [
    t("authz.wizard.selectApp" as any),
    t("authz.wizard.modelText" as any),
    t("authz.wizard.policyTableName" as any),
  ];

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
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-w-[92vw] bg-surface-1 border border-border rounded-2xl shadow-2xl z-[51] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-[16px] font-bold text-text-primary">{t("authz.wizard.bizTitle" as any)}</h2>
                <p className="text-[12px] text-text-muted mt-0.5">{t("authz.wizard.bizSubtitle" as any)}</p>
              </div>
              {!creating && (
                <button onClick={onClose} className="rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Step indicator */}
            <div className="px-6 pt-4 pb-2 flex items-center gap-2">
              {stepLabels.map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 ${i <= step ? "text-accent" : "text-text-muted"}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      i < step ? "bg-accent text-white" : i === step ? "border-2 border-accent text-accent" : "border border-border text-text-muted"
                    }`}>
                      {i + 1}
                    </div>
                    <span className="text-[11px] font-medium">{label}</span>
                  </div>
                  {i < stepLabels.length - 1 && (
                    <div className={`w-6 h-px ${i < step ? "bg-accent" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Step content */}
            <div className="px-6 py-5 min-h-[240px]">
              {step === 0 && (
                /* ═══ Step 0: Select Application ═══ */
                <div className="space-y-3">
                  <label className="block text-[12px] font-semibold text-text-primary mb-1.5">
                    {t("authz.wizard.selectApp" as any)} <span className="text-danger">*</span>
                  </label>
                  {loadingApps ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={20} className="text-accent animate-spin" />
                    </div>
                  ) : apps.length === 0 ? (
                    <div className="text-center py-8 text-[13px] text-text-muted">
                      {t("common.noData" as any) || "No applications found"}
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                      {apps.map((app) => (
                        <button
                          key={`${app.owner}/${app.name}`}
                          onClick={() => setSelectedApp(app)}
                          className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                            selectedApp?.name === app.name
                              ? "border-accent bg-accent/5"
                              : "border-border hover:border-accent/50 hover:bg-surface-2"
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-md bg-gradient-to-br ${getGradient(apps.indexOf(app))} flex items-center justify-center text-white font-bold text-sm`}>
                            {(app.displayName || app.name).charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-text-primary truncate">
                              {app.displayName || app.name}
                            </div>
                            <div className="text-[11px] text-text-muted font-mono truncate">
                              {app.organization || app.owner} / {app.name}
                            </div>
                          </div>
                          {selectedApp?.name === app.name && (
                            <div className="w-4 h-4 rounded-full bg-accent flex items-center justify-center shrink-0">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-white"><path d="M20 6L9 17l-5-5"/></svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 1 && (
                /* ═══ Step 1: Model Selection ═══ */
                <div className="space-y-3">
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {MODEL_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setSelectedPreset(preset.id);
                          if (preset.id === "custom") {
                            setShowCustomEditor(true);
                            if (!modelText || MODEL_PRESETS.some((p) => p.id !== "custom" && p.modelText === modelText)) {
                              setModelText(DEFAULT_RBAC_MODEL);
                            }
                          } else {
                            setShowCustomEditor(false);
                            setModelText(preset.modelText);
                          }
                        }}
                        className={`w-full text-left rounded-lg border px-4 py-3 transition-all ${
                          selectedPreset === preset.id
                            ? "border-accent bg-accent/5 ring-1 ring-accent/20"
                            : "border-border hover:border-accent/40 hover:bg-surface-2"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13px] font-semibold text-text-primary">{t(preset.labelKey as any)}</span>
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide ${
                            preset.recommended ? "bg-accent/15 text-accent" : "bg-surface-3 text-text-muted"
                          }`}>
                            {preset.badge}
                          </span>
                          {preset.recommended && (
                            <span className="inline-block rounded-full px-2 py-0.5 text-[9px] font-bold bg-success/10 text-success">
                              {t("authz.preset.recommended" as any)}
                            </span>
                          )}
                          {selectedPreset === preset.id && (
                            <div className="ml-auto w-4 h-4 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-white"><path d="M20 6L9 17l-5-5"/></svg>
                            </div>
                          )}
                        </div>
                        <p className="text-[12px] text-text-secondary leading-relaxed">{t(preset.descKey as any)}</p>
                        <p className="text-[11px] text-text-muted mt-1">
                          {t("authz.preset.scenario" as any)}{t(preset.scenarioKey as any)}
                        </p>
                      </button>
                    ))}
                  </div>

                  {/* Custom model editor */}
                  {showCustomEditor && (
                    <div className="mt-2">
                      <textarea
                        value={modelText}
                        onChange={(e) => setModelText(e.target.value)}
                        rows={10}
                        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[11px] font-mono text-text-primary outline-none focus:border-accent placeholder:text-text-muted resize-y leading-relaxed"
                        spellCheck={false}
                      />
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                /* ═══ Step 2: Policy Table Name ═══ */
                <div className="space-y-4">
                  <div>
                    <label className="block text-[12px] font-semibold text-text-primary mb-1.5">
                      {t("authz.wizard.policyTableName" as any)}
                    </label>
                    <input
                      value={policyTable}
                      onChange={(e) => setPolicyTable(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] font-mono text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
                    />
                    <p className="text-[11px] text-text-muted mt-1">
                      {t("authz.wizard.policyTableHint" as any)}
                    </p>
                  </div>

                  {/* Summary */}
                  <div className="rounded-lg bg-surface-2 border border-border-subtle p-3">
                    <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">{t("authz.wizard.willCreate" as any)}</div>
                    <div className="space-y-1.5 text-[12px] text-text-secondary">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                        <span>{t("general.application" as any) || "Application"}:</span>
                        <span className="font-mono font-medium text-text-primary">{selectedApp?.displayName || selectedApp?.name || "..."}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        <span>{t("authz.wizard.modelText" as any) || "Model"}:</span>
                        <span className="font-mono font-medium text-text-primary text-[11px]">RBAC ({modelText.split("\n").length} lines)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        <span>{t("authz.wizard.policyTableName" as any) || "Policy Table"}:</span>
                        <span className="font-mono font-medium text-text-primary">{policyTable || "..."}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface-0/50">
              <div>
                {step > 0 && !creating && (
                  <button
                    onClick={() => setStep(step - 1)}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
                  >
                    <ChevronLeft size={14} />
                    {t("common.back" as any)}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!creating && (
                  <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                    {t("common.cancel")}
                  </button>
                )}
                {!creating && (
                  <button
                    onClick={handleNext}
                    disabled={!canProceed()}
                    className="flex items-center gap-1 rounded-lg bg-accent px-5 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
                  >
                    {step < 2 ? (
                      <>
                        {t("common.next" as any)}
                        <ChevronRight size={14} />
                      </>
                    ) : creating ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      t("authz.wizard.bizCreate" as any)
                    )}
                  </button>
                )}
                {creating && (
                  <div className="flex items-center gap-2 text-[12px] text-text-muted">
                    <Loader2 size={14} className="animate-spin text-accent" />
                    {t("common.saving" as any)}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
