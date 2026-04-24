import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { bizKeys } from "../backend/bizQueryKeys";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Play, Copy, Check, X, RefreshCw, RotateCcw, Pencil, Trash2, LayoutDashboard, Crown, ShieldCheck, FlaskConical, Code, Target, Eye } from "lucide-react";
import DataTable, { type Column, useTablePrefs, ColumnsMenu } from "../components/DataTable";
import BizAppResourceTab from "../components/BizAppResourceTab";
import BizSchemaEditor from "../components/BizSchemaEditor";
import BizTupleManager from "../components/BizTupleManager";
import BizReBACTester from "../components/BizReBACTester";
import BizReBACBrowser from "../components/BizReBACBrowser";
import BizIntegrationTab from "../components/BizIntegrationTab";
import BizReBACOverview from "../components/BizReBACOverview";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as BizBackend from "../backend/BizBackend";
import type { BizAppConfig, BizRole, BizPermission, PoliciesExport } from "../backend/BizBackend";
import { pickAppIcon } from "../utils/appIcon";

// Casbin-lane tabs are unchanged. ReBAC-lane tabs are rendered only when
// the app's modelType is "rebac" (spec §8.2). Since "overview" and
// "integration" are common to both, TabKey is the union — the visible
// tab list is filtered at render time.
type TabKey =
  | "overview"
  | "roles"
  | "permissions"
  | "resources"
  | "test"
  | "integration"
  | "schema"
  | "tuples"
  | "browser"
  | "tester";

// Shared helper for RolesTab + PermissionsTab: turns a bulk-delete API
// response into the appropriate toast (all-success / all-failed / partial).
// The first failure's translated error is surfaced so the admin sees the
// concrete reason (e.g. "inherited by role X") without hunting.
function showBulkDeleteToast(
  modal: { toast: (msg: string, type?: "success" | "error" | "info") => void },
  t: (k: any) => string,
  res: { status: string; msg?: string; data?: { succeeded: number; failed: number; results: { ok: boolean; error?: string }[] } | null },
) {
  if (res.status !== "ok" || !res.data) {
    modal.toast(res.msg || t("common.error"), "error");
    return;
  }
  const { succeeded, failed, results } = res.data;
  const deleted = t("common.bulk.deleted" as any) || "deleted";
  if (failed === 0) {
    modal.toast(`${succeeded} ${deleted}`, "success");
    return;
  }
  const firstErr = results.find((r) => !r.ok)?.error || t("common.error");
  if (succeeded === 0) {
    modal.toast(firstErr, "error");
    return;
  }
  const failedLabel = t("common.failed" as any) || "failed";
  modal.toast(`${succeeded} ${deleted}, ${failed} ${failedLabel} — ${firstErr}`, "error");
}

const CASBIN_TABS: TabKey[] = ["overview", "roles", "permissions", "resources", "test", "integration"];
const REBAC_TABS: TabKey[] = ["overview", "schema", "tuples", "browser", "tester", "integration"];

// Local relative-time helper — mirrors the one in AuthorizationPage. Kept
// here to avoid a cross-page import cycle; both functions are short.
function formatRelativeTimeLocal(iso: string, t: (k: any) => string): string {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return t("common.justNow" as any) || "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${t("common.minAgo" as any) || "min ago"}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${t("common.hrAgo" as any) || "hr ago"}`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} ${t("common.dayAgo" as any) || "d ago"}`;
  return new Date(iso).toLocaleDateString();
}

function parseTab(raw: string | null, modelType: "casbin" | "rebac" | undefined): TabKey {
  const valid = modelType === "rebac" ? REBAC_TABS : CASBIN_TABS;
  return (valid as string[]).includes(raw ?? "") ? (raw as TabKey) : "overview";
}

export default function AppAuthorizationPage() {
  const { owner, appName } = useParams<{ owner: string; appName: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const modal = useModal();

  // Tab persists in the URL so edit pages can deep-link back to the right
  // tab and browser refresh preserves the user's position. parseTab needs
  // the app's modelType to know which valid-tab set applies — hoisted
  // below the configQuery.
  const setActiveTab = useCallback((tab: TabKey) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "overview") next.delete("tab");
      else next.set("tab", tab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const queryClient = useQueryClient();
  const appId = owner && appName ? `${owner}/${appName}` : "";

  // Main app data — split into 4 parallel queries so a slow "app metadata"
  // fetch doesn't block the overview, and so children can invalidate just
  // the slice they changed. staleTime of 30s covers the typical edit-save-
  // return cycle without hammering the server.
  const configQuery = useQuery({
    enabled: !!appId,
    queryKey: bizKeys.app(owner, appName),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await BizBackend.getBizAppConfig(appId);
      return res.status === "ok" && res.data ? res.data : null;
    },
  });

  const rolesQuery = useQuery({
    enabled: !!owner && !!appName,
    queryKey: bizKeys.roles(owner, appName),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await BizBackend.getBizRoles(owner!, appName!);
      return res.status === "ok" && res.data ? res.data : [];
    },
  });

  const permissionsQuery = useQuery({
    enabled: !!owner && !!appName,
    queryKey: bizKeys.permissions(owner, appName),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await BizBackend.getBizPermissions(owner!, appName!);
      return res.status === "ok" && res.data ? res.data : [];
    },
  });

  const appMetaQuery = useQuery({
    enabled: !!appName,
    queryKey: bizKeys.appMeta(appName),
    // App metadata (favicon / logo) rarely changes — long stale window.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const mod = await import("../backend/ApplicationBackend");
      const res = await mod.getApplication("admin", appName!);
      return res.status === "ok" && res.data ? res.data : null;
    },
  });

  const config = configQuery.data ?? null;
  const roles = rolesQuery.data ?? [];
  const permissions = permissionsQuery.data ?? [];
  const loading = configQuery.isLoading || rolesQuery.isLoading || permissionsQuery.isLoading;

  // ReBAC-mode tabs (spec §8.2) are rendered only when modelType is
  // explicitly "rebac". Legacy apps and unset values default to the
  // Casbin tab set — zero behaviour change for the existing UI.
  const isReBAC = config?.modelType === "rebac";
  const activeTab = parseTab(searchParams.get("tab"), config?.modelType);

  const [testerPrefill, setTesterPrefill] = useState<
    { object: string; relation: string; user: string } | null
  >(null);

  const appIcon = useMemo(() => {
    const app = appMetaQuery.data as any;
    return app ? pickAppIcon(app) : "";
  }, [appMetaQuery.data]);
  // If the picked URL later fails to load (404, blocked), the detail-page
  // header flips to the letter avatar instead of rendering a broken image.
  const [appIconFailed, setAppIconFailed] = useState(false);
  useEffect(() => { setAppIconFailed(false); }, [appIcon]);

  // Children (edit pages, table cells, modals) invalidate via this callback
  // after a mutation so the overview refetches without each child needing to
  // know the query key shape.
  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: bizKeys.app(owner, appName) });
    queryClient.invalidateQueries({ queryKey: bizKeys.roles(owner, appName) });
    queryClient.invalidateQueries({ queryKey: bizKeys.permissions(owner, appName) });
  }, [queryClient, owner, appName]);

  const [syncing, setSyncing] = useState(false);
  const handleSyncPolicies = async () => {
    if (!owner || !appName) return;
    setSyncing(true);
    try {
      const res = await BizBackend.bizSyncPolicies(`${owner}/${appName}`);
      if (res.status === "ok" && res.data) {
        modal.toast(`${t("authz.overview.syncSuccess" as any)} — ${res.data.policyCount} policies, ${res.data.roleCount} roles`, "success");
        refreshData();
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

  // Stats — member counts now live in biz_role_member / biz_permission_grantee tables,
  // so we no longer aggregate users from role/permission rows. The unique-user count
  // would require a separate endpoint; show 0 here until that's wired up (non-blocking).
  const allowCount = permissions.filter((p) => p.effect === "Allow").length;
  const denyCount = permissions.filter((p) => p.effect === "Deny").length;

  const casbinTabs: { key: TabKey; label: string; count?: number; icon: React.ReactNode }[] = [
    { key: "overview", label: t("authz.tab.overview" as any), icon: <LayoutDashboard size={14} /> },
    { key: "roles", label: t("authz.tab.roles" as any), count: roles.length, icon: <Crown size={14} /> },
    { key: "permissions", label: t("authz.tab.permissions" as any), count: permissions.length, icon: <ShieldCheck size={14} /> },
    { key: "resources", label: t("authz.tab.resources" as any) || "资源目录", icon: <Target size={14} /> },
    { key: "test", label: t("authz.tab.test" as any), icon: <FlaskConical size={14} /> },
    { key: "integration", label: t("authz.tab.integration" as any), icon: <Code size={14} /> },
  ];
  const rebacTabs: { key: TabKey; label: string; count?: number; icon: React.ReactNode }[] = [
    { key: "overview", label: t("rebac.tab.overview"), icon: <LayoutDashboard size={14} /> },
    { key: "schema", label: t("rebac.tab.schema"), icon: <ShieldCheck size={14} /> },
    { key: "tuples", label: t("rebac.tab.tuples"), icon: <Target size={14} /> },
    { key: "browser", label: t("rebac.tab.browser"), icon: <Eye size={14} /> },
    { key: "tester", label: t("rebac.tab.tester"), icon: <FlaskConical size={14} /> },
    { key: "integration", label: t("rebac.tab.integration"), icon: <Code size={14} /> },
  ];
  const tabs = isReBAC ? rebacTabs : casbinTabs;

  return (
    <div className="space-y-0">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 px-6 bg-surface-0/80 backdrop-blur-md border-b border-border-subtle">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/authorization")} className="rounded-lg p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors">
              <ArrowLeft size={18} />
            </button>
            {appIcon && !appIconFailed ? (
              <img
                src={appIcon}
                alt=""
                loading="lazy"
                onError={() => setAppIconFailed(true)}
                className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-surface-2"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
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
              onClick={refreshData}
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
        {/* ReBAC tabs — spec §8.2. Each Tab is a stub in this commit; the
            Task 4-9 commits fill in the real editors, manager, tester,
            and integration panels. */}
        {isReBAC && activeTab === "overview" && (
          <RebacOverviewTab appId={appId} t={t} />
        )}
        {isReBAC && activeTab === "schema" && (
          <RebacSchemaTab appId={appId} t={t} />
        )}
        {isReBAC && activeTab === "tuples" && (
          <RebacTuplesTab appId={appId} t={t} />
        )}
        {isReBAC && activeTab === "browser" && (
          <BizReBACBrowser
            appId={appId}
            onInvestigate={(tuple) => {
              setTesterPrefill(tuple);
              setActiveTab("tester");
            }}
          />
        )}
        {isReBAC && activeTab === "tester" && (
          <RebacTesterTab appId={appId} t={t} initialRequest={testerPrefill ?? undefined} />
        )}
        {isReBAC && activeTab === "integration" && (
          <RebacIntegrationTab appId={appId} t={t} />
        )}

        {!isReBAC && activeTab === "overview" && (
          <OverviewTab
            config={config}
            roles={roles}
            permissions={permissions}
            allowCount={allowCount}
            denyCount={denyCount}
            onRefresh={refreshData}
            onJumpTab={setActiveTab}
            t={t}
            modal={modal}
          />
        )}
        {!isReBAC && activeTab === "roles" && (
          <RolesTab
            roles={roles}
            permissions={permissions}
            onRefresh={refreshData}
            appOwner={owner!}
            appName={appName!}
            t={t}
            modal={modal}
            navigate={navigate}
          />
        )}
        {!isReBAC && activeTab === "permissions" && (
          <PermissionsTab
            permissions={permissions}
            onRefresh={refreshData}
            appOwner={owner!}
            appName={appName!}
            supportsDeny={config?.supportsDeny !== false}
            t={t}
            modal={modal}
            navigate={navigate}
          />
        )}
        {!isReBAC && activeTab === "resources" && (
          <BizAppResourceTab owner={owner!} appName={appName!} />
        )}
        {!isReBAC && activeTab === "test" && (
          <TestTab
            appOwner={owner!}
            appName={appName!}
            config={config}
            roles={roles}
            permissions={permissions}
            t={t}
          />
        )}
        {!isReBAC && activeTab === "integration" && (
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
function OverviewTab({ config, roles, permissions, allowCount, denyCount, onRefresh, onJumpTab, t, modal }: {
  config: BizAppConfig; roles: BizRole[]; permissions: BizPermission[];
  allowCount: number; denyCount: number;
  onRefresh: () => void;
  onJumpTab: (tab: TabKey) => void;
  t: (key: any) => string; modal: any;
}) {
  const [editingModel, setEditingModel] = useState(false);
  const [modelDraft, setModelDraft] = useState(config.modelText);
  const [savingConfig, setSavingConfig] = useState(false);
  // Casbin model text is long and rarely consulted day-to-day. Keep it
  // collapsed by default; admins who actually need to read or edit it
  // expand on demand.
  const [modelExpanded, setModelExpanded] = useState(false);

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

  const doToggleEnabled = async () => {
    const updated = { ...config, isEnabled: !config.isEnabled };
    const res = await BizBackend.updateBizAppConfig(`${config.owner}/${config.appName}`, updated);
    if (res.status === "ok") {
      onRefresh();
    } else {
      modal.toast(res.msg || t("common.saveFailed" as any), "error");
    }
  };

  const handleToggleEnabled = () => {
    // Enabling is harmless; disabling stops enforce for every integrated SDK
    // on the spot. Confirm only on the destructive direction so the happy
    // path stays one click.
    if (config.isEnabled) {
      modal.showConfirm(
        t("authz.overview.disableConfirm" as any)
          || "Disable this app? All Enforce calls will stop returning allow until you re-enable.",
        doToggleEnabled,
      );
    } else {
      doToggleEnabled();
    }
  };

  const updatedAbsolute = config.updatedTime
    ? new Date(config.updatedTime).toLocaleString()
    : "";
  const updatedRelative = formatRelativeTimeLocal(config.updatedTime, t);

  return (
    <div className="space-y-5">
      {/* Stat cards — roles/permissions are clickable and jump straight to
          their tab, which removes an extra click for the most common
          drill-down path. The third card shows the last-updated timestamp
          because "user count" was always 0 and actively misled admins; the
          real aggregation would need a dedicated backend endpoint. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => onJumpTab("roles")}
          className="text-left rounded-xl border border-border bg-surface-1 p-4 hover:border-accent hover:shadow-sm hover:-translate-y-0.5 transition-all"
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">{t("authz.metrics.roles")}</div>
          <div className="text-[28px] font-bold text-text-primary font-mono tracking-tight">{roles.length}</div>
          <div className="text-[11px] text-text-muted mt-0.5">{roles.filter((r) => r.isEnabled).length} {t("common.enabled" as any)}</div>
        </button>
        <button
          type="button"
          onClick={() => onJumpTab("permissions")}
          className="text-left rounded-xl border border-border bg-surface-1 p-4 hover:border-accent hover:shadow-sm hover:-translate-y-0.5 transition-all"
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">{t("authz.metrics.permissions")}</div>
          <div className="text-[28px] font-bold text-text-primary font-mono tracking-tight">{permissions.length}</div>
          <div className="text-[11px] text-text-muted mt-0.5">{allowCount} {t("authz.overview.allowRules")} · {denyCount} {t("authz.overview.denyRules")}</div>
        </button>
        <div
          className="rounded-xl border border-border bg-surface-1 p-4"
          title={updatedAbsolute}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
            {t("authz.overview.lastUpdated" as any) || "Last updated"}
          </div>
          <div className="text-[18px] font-semibold text-text-primary tracking-tight leading-tight">
            {updatedRelative || "—"}
          </div>
          <div className="text-[11px] text-text-muted mt-1 font-mono truncate">{updatedAbsolute || "—"}</div>
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
            ) : (() => {
              const lineCount = config.modelText ? config.modelText.split("\n").length : 0;
              const collapsible = lineCount > 4;
              return (
                <div>
                  {/* Gradient fade and pre are in their own wrapper so the
                      fade anchors to the bottom of the code block only —
                      anchoring it to the outer container would paint over
                      the toggle button sitting just below. */}
                  <div className="relative">
                    <pre className={`rounded-lg border border-border bg-surface-2 px-4 py-3 text-[12px] font-mono leading-relaxed text-text-secondary overflow-x-auto whitespace-pre-wrap ${modelExpanded || !collapsible ? "max-h-[480px] overflow-y-auto" : "max-h-[96px] overflow-hidden"}`}>
                      {config.modelText || "—"}
                    </pre>
                    {collapsible && !modelExpanded && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-lg bg-gradient-to-t from-surface-2 to-transparent" />
                    )}
                  </div>
                  {collapsible && (
                    // Pill-shaped button matches the "编辑" action above the
                    // code block so the two model-section controls feel like
                    // siblings instead of one muted link floating alone.
                    <button
                      type="button"
                      onClick={() => setModelExpanded((v) => !v)}
                      className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-surface-1 px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 hover:border-accent/40 hover:text-accent transition-colors"
                    >
                      {modelExpanded
                        ? (t("authz.overview.collapseModel" as any) || "Collapse")
                        : `${t("authz.overview.expandModel" as any) || "Expand"} (${lineCount} ${t("authz.overview.lines" as any) || "lines"})`}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════ ROLES TAB ═══════
// After the id-based refactor, role rows no longer carry embedded user/sub-role arrays
// (those live in biz_role_member and biz_role_inheritance). Table includes
// selection, multi-filter, sorting, and column visibility, all persisted.

function RolesTab({ roles, onRefresh, appOwner, appName, t, modal, navigate }: {
  roles: BizRole[]; permissions: BizPermission[]; onRefresh: () => void;
  appOwner: string; appName: string;
  t: (key: any) => string; modal: any; navigate: any;
}) {
  // Cross-column filters stay OUTSIDE the DataTable — scope is multi-select
  // and status is a radio, neither of which fits the per-column FilterPopover.
  // The role-name text filter IS a column-level filter (fires via onFilter),
  // tracked here so the filter pipeline can honor it.
  const [scopeSel, setScopeSel] = useState<Set<"app" | "org">>(new Set());
  const [statusSel, setStatusSel] = useState<"all" | "enabled" | "disabled">("all");
  const [nameFilter, setNameFilter] = useState("");

  // Sort + column visibility are lifted out of DataTable so the "Columns"
  // dropdown can render in the page header next to the primary CTA instead
  // of inside the table.
  const tablePrefs = useTablePrefs({
    persistKey: `biz-role-table:${appOwner}/${appName}`,
    defaultSort: { field: "updatedTime", order: "descend" },
  });

  const handleAddRole = () => {
    navigate(`/authorization/${appOwner}/${appName}/roles/new`, { state: { mode: "add" } });
  };

  const handleDeleteRole = useCallback((role: BizRole) => {
    if (!role.id) return;
    modal.showConfirm(`${t("common.confirmDelete")} [${role.displayName || role.name}]`, async () => {
      const res = await BizBackend.deleteBizRole(role.id!);
      if (res.status === "ok") onRefresh();
      else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
    });
  }, [modal, t, onRefresh]);

  const bulkSetEnabled = async (targets: BizRole[], enabled: boolean, clear: () => void) => {
    if (targets.length === 0) return;
    const results = await Promise.all(
      targets.map((r) => BizBackend.updateBizRole(r.id!, { ...r, isEnabled: enabled })),
    );
    const failed = results.filter((r) => r.status !== "ok");
    if (failed.length > 0) {
      modal.toast(`${failed.length} / ${targets.length} ${t("common.failed" as any) || "failed"}`, "error");
    } else {
      modal.toast(`${targets.length} ${t("common.bulk.updated" as any) || "updated"}`, "success");
    }
    clear();
    onRefresh();
  };

  const bulkDelete = (targets: BizRole[], clear: () => void) => {
    const ids = targets.map((r) => r.id).filter((id): id is number => typeof id === "number");
    if (ids.length === 0) return;
    modal.showConfirm(
      `${t("common.confirmDelete")} ${ids.length} ${t("authz.roles.bulk.roles" as any) || "roles"}?`,
      async () => {
        const res = await BizBackend.bulkDeleteBizRoles(ids);
        showBulkDeleteToast(modal, t, res);
        clear();
        onRefresh();
      },
    );
  };

  const appScopeCount = roles.filter((r) => r.scopeKind === "app").length;
  const orgScopeCount = roles.filter((r) => r.scopeKind === "org").length;

  const filteredRoles = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    return roles.filter((r) => {
      if (scopeSel.size > 0 && !scopeSel.has(r.scopeKind as "app" | "org")) return false;
      if (statusSel === "enabled" && !r.isEnabled) return false;
      if (statusSel === "disabled" && r.isEnabled) return false;
      if (q) {
        // Match either displayName or raw name so admins searching by either
        // convention find what they expect.
        const hay = `${r.displayName || ""} ${r.name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [roles, scopeSel, statusSel, nameFilter]);

  const toggleScope = (s: "app" | "org") => {
    setScopeSel((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const editUrl = useCallback(
    (name: string) => `/authorization/${appOwner}/${appName}/roles/${encodeURIComponent(name)}`,
    [appOwner, appName],
  );

  const columns = useMemo<Column<BizRole>[]>(() => [
    {
      key: "role",
      title: t("authz.roles.col.name"),
      sortable: true,
      filterable: true,
      hideable: false,
      width: "240px",
      sortFn: (a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name),
      render: (_, r) => (
        <Link to={editUrl(r.name)} className="flex flex-col group/link" onClick={(e) => e.stopPropagation()}>
          <span className="font-semibold text-text-primary group-hover/link:text-accent transition-colors">{r.displayName || r.name}</span>
          <span className="font-mono text-[11px] text-text-muted">{r.name}</span>
        </Link>
      ),
    },
    {
      key: "scopeKind",
      title: t("bizRole.col.scope") || "Scope",
      sortable: true,
      width: "120px",
      sortFn: (a, b) => (a.scopeKind || "").localeCompare(b.scopeKind || ""),
      render: (_, r) => r.scopeKind === "org" ? (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-500/10 text-purple-500">
          {t("bizRole.scope.org") || "组织共享"}
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-500">
          {t("bizRole.scope.app") || "仅本应用"}
        </span>
      ),
    },
    {
      key: "memberCount",
      title: t("authz.roles.col.members" as any) || "成员",
      sortable: true,
      width: "90px",
      sortFn: (a, b) => (a.memberCount || 0) - (b.memberCount || 0),
      render: (_, r) => (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`${editUrl(r.name)}#members`); }}
          title={t("authz.roles.col.members" as any) || "成员"}
          className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums transition-colors ${
            (r.memberCount || 0) > 0 ? "bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20" : "bg-surface-2 text-text-muted hover:bg-surface-3"
          }`}
        >
          {r.memberCount || 0}
        </button>
      ),
    },
    {
      key: "permissionCount",
      title: t("authz.roles.col.permissions" as any) || "权限",
      sortable: true,
      width: "90px",
      sortFn: (a, b) => (a.permissionCount || 0) - (b.permissionCount || 0),
      render: (_, r) => (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`${editUrl(r.name)}#permissions`); }}
          title={t("authz.roles.col.permissions" as any) || "权限"}
          className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums transition-colors ${
            (r.permissionCount || 0) > 0 ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20" : "bg-surface-2 text-text-muted hover:bg-surface-3"
          }`}
        >
          {r.permissionCount || 0}
        </button>
      ),
    },
    {
      key: "parentNames",
      title: t("authz.roles.col.inherits" as any) || "继承自",
      width: "200px",
      render: (_, r) => (
        r.parentNames && r.parentNames.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {r.parentNames.map((n) => (
              <button
                key={n}
                onClick={(e) => { e.stopPropagation(); navigate(editUrl(n)); }}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-secondary hover:bg-accent/10 hover:text-accent transition-colors"
              >
                <span className="text-text-muted">←</span>
                <span className="font-mono">{n}</span>
              </button>
            ))}
          </div>
        ) : (
          <span className="text-text-muted">—</span>
        )
      ),
    },
    {
      key: "isEnabled",
      title: t("authz.roles.col.status" as any),
      sortable: true,
      width: "100px",
      sortFn: (a, b) => Number(a.isEnabled) - Number(b.isEnabled),
      render: (_, r) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.isEnabled ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {r.isEnabled ? t("common.enabled" as any) : t("common.disabled" as any)}
        </span>
      ),
    },
    {
      key: "updatedTime",
      title: t("authz.roles.col.updated" as any) || "最后修改",
      sortable: true,
      width: "130px",
      sortFn: (a, b) => {
        const ta = a.updatedTime || a.createdTime || "";
        const tb = b.updatedTime || b.createdTime || "";
        return ta.localeCompare(tb);
      },
      render: (_, r) => (
        <span className="text-[12px] text-text-muted tabular-nums">
          {formatRelativeTimeLocal(r.updatedTime || r.createdTime || "", t) || "—"}
        </span>
      ),
    },
    {
      key: "__actions",
      title: t("common.action" as any),
      fixed: "right" as const,
      hideable: false,
      width: "100px",
      render: (_, r) => (
        <div className="flex items-center justify-end gap-0.5">
          <Link
            to={editUrl(r.name)}
            className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors"
            title={t("common.edit")}
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil size={14} />
          </Link>
          <button
            onClick={(e) => { e.stopPropagation(); handleDeleteRole(r); }}
            className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            title={t("common.delete")}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ], [t, editUrl, navigate, handleDeleteRole]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-[14px] font-semibold text-text-primary">{t("authz.roles.title")}</h3>
          <span className="text-[11px] text-text-muted">({roles.length})</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-muted">{t("bizRole.col.scope") || "作用域"}:</span>
            <FilterChip
              label={t("bizRole.scope.app") || "本应用"}
              count={appScopeCount}
              active={scopeSel.has("app")}
              onClick={() => toggleScope("app")}
            />
            <FilterChip
              label={t("bizRole.scope.org") || "组织共享"}
              count={orgScopeCount}
              active={scopeSel.has("org")}
              onClick={() => toggleScope("org")}
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-text-muted">{t("authz.roles.col.status" as any)}:</span>
            {(["all", "enabled", "disabled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusSel(s)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  statusSel === s ? "bg-accent/15 text-accent" : "bg-surface-2 text-text-muted hover:text-text-secondary"
                }`}
              >
                {s === "all" ? (t("bizRole.filter.all") || "全部") : s === "enabled" ? (t("common.enabled" as any)) : (t("common.disabled" as any))}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ColumnsMenu
            columns={columns}
            hidden={tablePrefs.hidden}
            onToggle={tablePrefs.toggleHidden}
            onResetWidths={tablePrefs.resetWidths}
          />
          <button onClick={handleAddRole} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover transition-colors">
            <Plus size={14} /> {t("authz.roles.add")}
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredRoles}
        rowKey={(r) => r.name}
        emptyText={t("common.noData")}
        selectable
        clientSort
        clientPagination
        pageSize={tablePrefs.pageSize}
        onPageSizeChange={tablePrefs.setPageSize}
        sort={tablePrefs.sort}
        onSortChange={tablePrefs.setSort}
        hidden={tablePrefs.hidden}
        resizable
        widths={tablePrefs.widths}
        onWidthChange={tablePrefs.setWidth}
        onFilter={(f) => {
          // Column-level text filter on the role name (FilterPopover).
          if (f.field === "role") setNameFilter(f.value);
        }}
        bulkActions={({ selected, clear }) => (
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-text-primary">
              {selected.length} {t("common.bulk.selected" as any) || "已选"}
            </span>
            <button onClick={() => bulkSetEnabled(selected, true, clear)} className="rounded-lg border border-border bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              {t("common.bulk.enable" as any) || "启用"}
            </button>
            <button onClick={() => bulkSetEnabled(selected, false, clear)} className="rounded-lg border border-border bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              {t("common.bulk.disable" as any) || "停用"}
            </button>
            <button onClick={() => bulkDelete(selected, clear)} className="rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-danger/10 transition-colors">
              {t("common.delete")}
            </button>
            <button onClick={clear} className="text-[11px] text-text-muted hover:text-text-secondary ml-1">
              {t("common.cancel")}
            </button>
          </div>
        )}
      />
    </div>
  );
}

// Small shared chip used by cross-column filters above the table (scope,
// status, etc.). Stays outside DataTable since these are multi-select and
// don't match the column-level FilterPopover model.
function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
        active ? "bg-accent/15 text-accent ring-1 ring-accent/30" : "bg-surface-2 text-text-muted hover:text-text-secondary"
      }`}
    >
      {label} <span className="opacity-60">({count})</span>
    </button>
  );
}

// ═══════ PERMISSIONS TAB ═══════
function PermissionsTab({ permissions, onRefresh, appOwner, appName, supportsDeny, t, modal, navigate }: {
  permissions: BizPermission[]; onRefresh: () => void;
  appOwner: string; appName: string;
  supportsDeny: boolean;
  t: (key: any) => string; modal: any; navigate: any;
}) {
  const [effectSel, setEffectSel] = useState<Set<"Allow" | "Deny">>(new Set());
  const [stateSel, setStateSel] = useState<"all" | "Approved" | "Pending" | "Rejected">("all");
  const [statusSel, setStatusSel] = useState<"all" | "enabled" | "disabled">("all");
  const [nameFilter, setNameFilter] = useState("");

  const tablePrefs = useTablePrefs({
    persistKey: `biz-permission-table:${appOwner}/${appName}`,
    defaultSort: { field: "updatedTime", order: "descend" },
  });

  const handleAddPermission = () => {
    navigate(`/authorization/${appOwner}/${appName}/permissions/new`, { state: { mode: "add" } });
  };

  const handleDeletePermission = useCallback((perm: BizPermission) => {
    if (!perm.id) return;
    modal.showConfirm(`${t("common.confirmDelete")} [${perm.displayName || perm.name}]`, async () => {
      const res = await BizBackend.deleteBizPermission(perm.id!);
      if (res.status === "ok") onRefresh();
      else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
    });
  }, [modal, t, onRefresh]);

  const bulkSetEnabled = async (targets: BizPermission[], enabled: boolean, clear: () => void) => {
    if (targets.length === 0) return;
    const results = await Promise.all(
      targets.map((p) => BizBackend.updateBizPermission(p.id!, { ...p, isEnabled: enabled })),
    );
    const failed = results.filter((r) => r.status !== "ok");
    if (failed.length > 0) {
      modal.toast(`${failed.length} / ${targets.length} ${t("common.failed" as any) || "failed"}`, "error");
    } else {
      modal.toast(`${targets.length} ${t("common.bulk.updated" as any) || "updated"}`, "success");
    }
    clear();
    onRefresh();
  };

  const bulkDelete = (targets: BizPermission[], clear: () => void) => {
    const ids = targets.map((p) => p.id).filter((id): id is number => typeof id === "number");
    if (ids.length === 0) return;
    modal.showConfirm(
      `${t("common.confirmDelete")} ${ids.length} ${t("authz.perms.bulk.permissions" as any) || "permissions"}?`,
      async () => {
        const res = await BizBackend.bulkDeleteBizPermissions(ids);
        showBulkDeleteToast(modal, t, res);
        clear();
        onRefresh();
      },
    );
  };

  const allowCount = permissions.filter((p) => p.effect === "Allow").length;
  const denyCount = permissions.filter((p) => p.effect === "Deny").length;

  const filteredPermissions = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    return permissions.filter((p) => {
      if (effectSel.size > 0 && !effectSel.has(p.effect)) return false;
      if (stateSel !== "all" && (p.state || "Approved") !== stateSel) return false;
      if (statusSel === "enabled" && !p.isEnabled) return false;
      if (statusSel === "disabled" && p.isEnabled) return false;
      if (q) {
        const hay = `${p.displayName || ""} ${p.name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [permissions, effectSel, stateSel, statusSel, nameFilter]);

  const toggleEffect = (e: "Allow" | "Deny") => {
    setEffectSel((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e); else next.add(e);
      return next;
    });
  };

  const editUrl = useCallback(
    (name: string) => `/authorization/${appOwner}/${appName}/permissions/${encodeURIComponent(name)}`,
    [appOwner, appName],
  );

  const columns = useMemo<Column<BizPermission>[]>(() => [
    {
      key: "permission",
      title: t("authz.perms.col.name"),
      sortable: true,
      filterable: true,
      hideable: false,
      width: "240px",
      sortFn: (a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name),
      render: (_, p) => (
        <Link to={editUrl(p.name)} className="flex flex-col group/link" onClick={(e) => e.stopPropagation()}>
          <span className="font-semibold text-text-primary group-hover/link:text-accent transition-colors">{p.displayName || p.name}</span>
          <span className="font-mono text-[11px] text-text-muted">{p.name}</span>
        </Link>
      ),
    },
    {
      key: "effect",
      title: t("authz.perms.col.effect"),
      sortable: true,
      width: "110px",
      sortFn: (a, b) => (a.effect || "").localeCompare(b.effect || ""),
      render: (_, p) => {
        // Deny on a model that doesn't honor it is a silent no-op at
        // enforce time — flag with a warning chip + tooltip.
        const denyInert = p.effect === "Deny" && !supportsDeny;
        return (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              denyInert ? "bg-warning/15 text-warning" :
              p.effect === "Allow" ? "bg-success/10 text-success" :
              "bg-danger/10 text-danger"
            }`}
            title={denyInert ? (t("bizPerm.denyInertHint" as any) || "This app's model does not honor Deny — this permission has no enforcement effect.") : undefined}
          >
            {p.effect === "Allow" ? t("permissions.effectAllow" as any) : t("permissions.effectDeny" as any)}
            {denyInert && <span className="text-[9px]">⚠</span>}
          </span>
        );
      },
    },
    {
      key: "resources",
      title: t("authz.perms.col.resources"),
      width: "240px",
      render: (_, p) => (
        <span className="font-mono text-[11px] text-text-secondary line-clamp-2 break-all">
          {p.resources?.join(", ") || "—"}
        </span>
      ),
    },
    {
      key: "actions",
      title: t("authz.perms.col.actions"),
      width: "160px",
      render: (_, p) => (
        <div className="flex flex-wrap gap-1">
          {p.actions?.length
            ? p.actions.map((a) => <span key={a} className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-cyan-500/10 text-cyan-400">{a}</span>)
            : <span className="text-text-muted">—</span>}
        </div>
      ),
    },
    {
      key: "granteeCount",
      title: t("authz.perms.col.grantees" as any) || "授权对象",
      sortable: true,
      width: "100px",
      sortFn: (a, b) => (a.granteeCount || 0) - (b.granteeCount || 0),
      render: (_, p) => (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`${editUrl(p.name)}#grantees`); }}
          title={t("authz.perms.col.grantees" as any) || "授权对象"}
          className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums transition-colors ${
            (p.granteeCount || 0) > 0 ? "bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20" : "bg-surface-2 text-text-muted hover:bg-surface-3"
          }`}
        >
          {p.granteeCount || 0}
        </button>
      ),
    },
    {
      key: "state",
      title: t("authz.perms.col.approval" as any),
      sortable: true,
      width: "110px",
      sortFn: (a, b) => (a.state || "").localeCompare(b.state || ""),
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
      key: "isEnabled",
      title: t("authz.roles.col.status" as any),
      sortable: true,
      width: "100px",
      sortFn: (a, b) => Number(a.isEnabled) - Number(b.isEnabled),
      render: (_, p) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.isEnabled ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {p.isEnabled ? t("common.enabled" as any) : t("common.disabled" as any)}
        </span>
      ),
    },
    {
      key: "updatedTime",
      title: t("authz.roles.col.updated" as any) || "最后修改",
      sortable: true,
      width: "130px",
      sortFn: (a, b) => {
        const ta = a.updatedTime || a.createdTime || "";
        const tb = b.updatedTime || b.createdTime || "";
        return ta.localeCompare(tb);
      },
      render: (_, p) => (
        <span className="text-[12px] text-text-muted tabular-nums">
          {formatRelativeTimeLocal(p.updatedTime || p.createdTime || "", t) || "—"}
        </span>
      ),
    },
    {
      key: "__actions",
      title: t("common.action" as any),
      fixed: "right" as const,
      hideable: false,
      width: "100px",
      render: (_, p) => (
        <div className="flex items-center justify-end gap-0.5">
          <Link
            to={editUrl(p.name)}
            className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors"
            title={t("common.edit")}
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil size={14} />
          </Link>
          <button
            onClick={(e) => { e.stopPropagation(); handleDeletePermission(p); }}
            className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            title={t("common.delete")}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ], [t, editUrl, navigate, handleDeletePermission, supportsDeny]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-[14px] font-semibold text-text-primary">{t("authz.perms.title")}</h3>
          <span className="text-[11px] text-text-muted">({permissions.length})</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-muted">{t("authz.perms.col.effect")}:</span>
            <FilterChip label={t("permissions.effectAllow" as any) || "Allow"} count={allowCount} active={effectSel.has("Allow")} onClick={() => toggleEffect("Allow")} />
            <FilterChip label={t("permissions.effectDeny" as any) || "Deny"} count={denyCount} active={effectSel.has("Deny")} onClick={() => toggleEffect("Deny")} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-text-muted">{t("authz.perms.col.approval" as any)}:</span>
            {(["all", "Approved", "Pending", "Rejected"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStateSel(s)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  stateSel === s ? "bg-accent/15 text-accent" : "bg-surface-2 text-text-muted hover:text-text-secondary"
                }`}
              >
                {s === "all" ? (t("bizRole.filter.all") || "全部") : (t(`authz.perms.state.${s}` as any) || s)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-text-muted">{t("authz.roles.col.status" as any)}:</span>
            {(["all", "enabled", "disabled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusSel(s)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  statusSel === s ? "bg-accent/15 text-accent" : "bg-surface-2 text-text-muted hover:text-text-secondary"
                }`}
              >
                {s === "all" ? (t("bizRole.filter.all") || "全部") : s === "enabled" ? (t("common.enabled" as any)) : (t("common.disabled" as any))}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ColumnsMenu
            columns={columns}
            hidden={tablePrefs.hidden}
            onToggle={tablePrefs.toggleHidden}
            onResetWidths={tablePrefs.resetWidths}
          />
          <button onClick={handleAddPermission} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover transition-colors">
            <Plus size={14} /> {t("authz.perms.add")}
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredPermissions}
        rowKey={(p) => p.name}
        emptyText={t("common.noData")}
        selectable
        clientSort
        clientPagination
        pageSize={tablePrefs.pageSize}
        onPageSizeChange={tablePrefs.setPageSize}
        sort={tablePrefs.sort}
        onSortChange={tablePrefs.setSort}
        hidden={tablePrefs.hidden}
        resizable
        widths={tablePrefs.widths}
        onWidthChange={tablePrefs.setWidth}
        onFilter={(f) => {
          if (f.field === "permission") setNameFilter(f.value);
        }}
        bulkActions={({ selected, clear }) => (
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-text-primary">
              {selected.length} {t("common.bulk.selected" as any) || "已选"}
            </span>
            <button onClick={() => bulkSetEnabled(selected, true, clear)} className="rounded-lg border border-border bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              {t("common.bulk.enable" as any) || "启用"}
            </button>
            <button onClick={() => bulkSetEnabled(selected, false, clear)} className="rounded-lg border border-border bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              {t("common.bulk.disable" as any) || "停用"}
            </button>
            <button onClick={() => bulkDelete(selected, clear)} className="rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-danger/10 transition-colors">
              {t("common.delete")}
            </button>
            <button onClick={clear} className="text-[11px] text-text-muted hover:text-text-secondary ml-1">
              {t("common.cancel")}
            </button>
          </div>
        )}
      />
    </div>
  );
}

// ═══════ TEST TAB ═══════
// Candidate subject: a concrete subject you can pick from a dropdown. Users
// and groups carry displayName so admins see something human; role/free-form
// entries fall back to id/name.
type SubjectCandidate = {
  id: string;
  displayName: string;
  kind: "user" | "group" | "role";
};

// Persisted test-run entry. We snapshot the result + the full request so a
// click-to-replay re-runs with exactly the same inputs.
type TestHistoryEntry = {
  id: string;
  time: number;
  sub: string;
  dom?: string;
  obj: string;
  act: string;
  allowed: boolean;
  reason: string;
};

const TEST_HISTORY_MAX = 10;

function testHistoryKey(owner: string, appName: string) {
  return `biz-test-history:${owner}/${appName}`;
}

function loadTestHistory(owner: string, appName: string): TestHistoryEntry[] {
  try {
    const raw = localStorage.getItem(testHistoryKey(owner, appName));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, TEST_HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function saveTestHistory(owner: string, appName: string, entries: TestHistoryEntry[]) {
  try {
    localStorage.setItem(testHistoryKey(owner, appName), JSON.stringify(entries.slice(0, TEST_HISTORY_MAX)));
  } catch { /* quota — not fatal */ }
}

function TestTab({ appOwner, appName, config, roles, permissions, t }: {
  appOwner: string; appName: string;
  config: BizAppConfig | null; roles: BizRole[]; permissions: BizPermission[];
  t: (key: any) => string;
}) {
  const [sub, setSub] = useState("");
  const [obj, setObj] = useState("");
  const [act, setAct] = useState("");
  const [dom, setDom] = useState("");
  const [result, setResult] = useState<BizBackend.EnforceTraceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [history, setHistory] = useState<TestHistoryEntry[]>(() => loadTestHistory(appOwner, appName));

  // Detect if model uses domain by checking request_definition field count (4+ = has domain)
  const hasDomain = useMemo(() => {
    if (!config?.modelText) return false;
    for (const line of config.modelText.split("\n")) {
      const match = line.trim().match(/^r\s*=\s*(.+)/);
      if (match) {
        const fields = match[1].split(",").map((f) => f.trim());
        return fields.length >= 4;
      }
    }
    return false;
  }, [config?.modelText]);

  // Role candidates are always eager — roles are bounded by app size (small).
  // Users and groups are fetched by SubjectPicker on demand via useQuery so
  // large tenants don't pay for a full dump on page open.
  const roleCandidates = useMemo<SubjectCandidate[]>(
    () => roles.map((r) => ({
      id: r.name,
      displayName: r.displayName || r.name,
      kind: "role" as const,
    })),
    [roles],
  );

  const suggestions = useMemo(() => {
    const resources = new Set<string>();
    const actions = new Set<string>();
    permissions.forEach((p) => {
      (p.resources ?? []).forEach((r) => resources.add(r));
      (p.actions ?? []).forEach((a) => actions.add(a));
    });
    return {
      resources: [...resources].sort(),
      actions: [...actions].sort(),
    };
  }, [permissions]);

  const handleTest = useCallback(async () => {
    if (!sub || !obj || !act) return;
    if (hasDomain && !dom) return;
    setTesting(true);
    setError(null);
    try {
      const appId = `${appOwner}/${appName}`;
      const request = hasDomain ? [sub, dom, obj, act] : [sub, obj, act];
      const res = await BizBackend.bizEnforceEx(appId, request);
      if (res.status === "ok" && res.data) {
        const data = res.data;
        setResult(data);
        setHistory((h) => {
          const next: TestHistoryEntry[] = [
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              time: Date.now(),
              sub,
              dom: hasDomain ? dom : undefined,
              obj,
              act,
              allowed: data.allowed,
              reason: data.reason || "",
            },
            ...h,
          ].slice(0, TEST_HISTORY_MAX);
          saveTestHistory(appOwner, appName, next);
          return next;
        });
      } else {
        setResult(null);
        setError(res.msg || "Error");
      }
    } catch (e: any) {
      setResult(null);
      setError(e?.message || "Error");
    } finally {
      setTesting(false);
    }
  }, [sub, obj, act, dom, hasDomain, appOwner, appName]);

  // Cmd/Ctrl+Enter from anywhere inside the form triggers a run. Placed on
  // the form container via onKeyDown; individual inputs don't need their
  // own Enter handlers.
  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleTest();
    }
  };

  const replayEntry = useCallback((entry: TestHistoryEntry) => {
    setSub(entry.sub);
    setObj(entry.obj);
    setAct(entry.act);
    if (entry.dom !== undefined) setDom(entry.dom);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveTestHistory(appOwner, appName, []);
  }, [appOwner, appName]);

  const inputCls = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] font-mono text-text-primary outline-none focus:border-accent placeholder:text-text-muted h-[36px]";
  const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5";

  // Preset chips: since users are now lazy-loaded by the picker, we only offer
  // role-based quickfills here. Users can still pick via the subject dropdown.
  const presets = useMemo(() => {
    const out: { label: string; sub?: string; obj?: string; act?: string }[] = [];
    const firstRole = roles[0];
    const firstPerm = permissions[0];
    const firstRes = firstPerm?.resources?.[0];
    const firstAct = firstPerm?.actions?.[0];
    if (firstRole && firstRes && firstAct) {
      out.push({ label: `${firstRole.displayName || firstRole.name} → ${firstRes} · ${firstAct}`, sub: firstRole.name, obj: firstRes, act: firstAct });
    }
    return out;
  }, [roles, permissions]);

  const applyPreset = (p: { sub?: string; obj?: string; act?: string }) => {
    if (p.sub !== undefined) setSub(p.sub);
    if (p.obj !== undefined) setObj(p.obj);
    if (p.act !== undefined) setAct(p.act);
  };

  return (
    <div className="grid gap-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5 min-w-0">
        {/* Playground */}
        <div className="rounded-xl border border-border bg-surface-1 p-5" onKeyDown={handleFormKeyDown}>
          <h4 className="text-[14px] font-semibold text-text-primary mb-1 flex items-center gap-2">
            <Play size={16} className="text-accent" />
            {t("authz.test.title")}
          </h4>
          <p className="text-[12px] text-text-muted mb-4">
            {t("authz.test.subtitle")}
            <span className="ml-1 text-text-muted/70">({t("authz.test.shortcutHint" as any) || "Cmd/Ctrl + Enter to run"})</span>
          </p>

          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              <span className="text-[11px] text-text-muted mr-1">{t("authz.test.presets" as any) || "Quick fill:"}</span>
              {presets.map((p, i) => (
                <button key={i} onClick={() => applyPreset(p)}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-text-secondary hover:border-accent hover:text-accent transition-colors">
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div className={`grid grid-cols-1 gap-3 items-end ${hasDomain ? "md:grid-cols-[1fr_1fr_1fr_1fr_auto]" : "md:grid-cols-[1fr_1fr_1fr_auto]"}`}>
            <div>
              <label className={labelCls}>{t("authz.test.subject")}</label>
              <SubjectPicker
                value={sub}
                onChange={setSub}
                owner={appOwner}
                roleCandidates={roleCandidates}
                placeholder={`${appOwner}/alice`}
                inputCls={inputCls}
                t={t}
              />
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
              <SuggestPicker
                value={obj}
                onChange={setObj}
                suggestions={suggestions.resources}
                placeholder="/orders/list"
                inputCls={inputCls}
                t={t}
              />
            </div>
            <div>
              <label className={labelCls}>{t("authz.test.action")}</label>
              <SuggestPicker
                value={act}
                onChange={setAct}
                suggestions={suggestions.actions}
                placeholder="GET"
                inputCls={inputCls}
                t={t}
              />
            </div>
            <button onClick={handleTest} disabled={testing || !sub || !obj || !act || (hasDomain && !dom)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors h-[36px] min-w-[100px]">
              {testing ? <div className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Play size={13} />}
              {t("authz.test.run")}
            </button>
          </div>
        </div>

        {/* Result — reserved surface so the page doesn't jump on first run */}
        <TestResultPanel result={result} error={error} testing={testing} t={t} />
      </div>

      {/* History sidebar */}
      <div className="rounded-xl border border-border bg-surface-1 p-4 h-fit lg:sticky lg:top-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-semibold text-text-primary">
            {t("authz.test.history")}
            <span className="ml-1.5 text-text-muted font-normal">({history.length})</span>
          </h3>
          {history.length > 0 && (
            <button onClick={clearHistory} className="text-[11px] text-text-muted hover:text-danger transition-colors">
              {t("common.clear" as any) || "Clear"}
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-[12px] text-text-muted py-8 text-center">{t("authz.test.historyEmpty" as any) || "No runs yet."}</p>
        ) : (
          <div className="space-y-1.5">
            {history.map((h) => (
              <button key={h.id} onClick={() => replayEntry(h)}
                className="block w-full text-left rounded-lg border border-border-subtle bg-surface-2/40 p-2 hover:border-accent/40 hover:bg-surface-2 transition-colors">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-mono text-[11px] text-text-secondary truncate">{h.sub}</span>
                  <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold flex-shrink-0 ml-2 ${
                    h.allowed ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                  }`}>
                    {h.allowed ? (t("authz.test.result.allow" as any) || "ALLOW") : (t("authz.test.result.deny" as any) || "DENY")}
                  </span>
                </div>
                <div className="font-mono text-[10px] text-text-muted truncate">
                  {h.obj} · {h.act}{h.dom ? ` · ${h.dom}` : ""}
                </div>
                <div className="text-[10px] text-text-muted mt-0.5">
                  {new Date(h.time).toLocaleTimeString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════ SUBJECT PICKER ═══════
// Adaptive combobox. Users and groups are fetched lazily via TanStack Query:
//   - `pageSize=200` on every request → small tenants get everything in one
//     shot (still fast, cached by query key)
//   - `data2 > 200` → UI hints the user to keep typing to narrow the result;
//     the search is also server-side (`field=name&value=q`), so large tenants
//     never pay for a full dump
//   - 250ms debounce between keystrokes and the actual network call
// Roles are always eager (bounded by app size) and come in from props.
// Free-form input is preserved when the user types something off-list.
const SUBJECT_PAGE_SIZE = 200;
const SUBJECT_DEBOUNCE_MS = 250;

function SubjectPicker({ value, onChange, owner, roleCandidates, placeholder, inputCls, t }: {
  value: string;
  onChange: (v: string) => void;
  owner: string;
  roleCandidates: SubjectCandidate[];
  placeholder: string;
  inputCls: string;
  t: (key: any) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [debouncedQuery, setDebouncedQuery] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const h = setTimeout(() => setDebouncedQuery(query), SUBJECT_DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Whether we already have the full set for this query. The server returns
  // `data2` (total rows matching the filter); if it exceeds pageSize we tell
  // the user to narrow down rather than silently serving only a prefix.
  const usersQuery = useQuery({
    enabled: open && !!owner,
    queryKey: bizKeys.testSubjects("users", owner, debouncedQuery.trim()),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const mod = await import("../backend/UserBackend");
      const q = debouncedQuery.trim();
      const res = await mod.getUsers({
        owner,
        p: 1,
        pageSize: SUBJECT_PAGE_SIZE,
        ...(q ? { field: "name", value: q } : {}),
      });
      if (res.status !== "ok") return { items: [] as SubjectCandidate[], total: 0 };
      const items: SubjectCandidate[] = (res.data as any[] ?? []).map((u) => ({
        id: `${u.owner}/${u.name}`,
        displayName: u.displayName || u.name,
        kind: "user" as const,
      }));
      const total = typeof (res as any).data2 === "number" ? (res as any).data2 : items.length;
      return { items, total };
    },
  });

  const groupsQuery = useQuery({
    enabled: open && !!owner,
    queryKey: bizKeys.testSubjects("groups", owner, debouncedQuery.trim()),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const mod = await import("../backend/GroupBackend");
      const q = debouncedQuery.trim();
      const res = await mod.getGroups({
        owner,
        p: 1,
        pageSize: SUBJECT_PAGE_SIZE,
        ...(q ? { field: "name", value: q } : {}),
      });
      if (res.status !== "ok") return { items: [] as SubjectCandidate[], total: 0 };
      const items: SubjectCandidate[] = (res.data as any[] ?? []).map((g) => ({
        id: `${g.owner}/${g.name}`,
        displayName: g.displayName || g.name,
        kind: "group" as const,
      }));
      const total = typeof (res as any).data2 === "number" ? (res as any).data2 : items.length;
      return { items, total };
    },
  });

  const filteredRoles = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return roleCandidates;
    return roleCandidates.filter((r) => r.id.toLowerCase().includes(q) || r.displayName.toLowerCase().includes(q));
  }, [roleCandidates, debouncedQuery]);

  const userItems = usersQuery.data?.items ?? [];
  const groupItems = groupsQuery.data?.items ?? [];
  const userTotal = usersQuery.data?.total ?? 0;
  const groupTotal = groupsQuery.data?.total ?? 0;

  const items = useMemo(() => [...userItems, ...groupItems, ...filteredRoles], [userItems, groupItems, filteredRoles]);
  const loading = usersQuery.isFetching || groupsQuery.isFetching;
  const truncated =
    (userTotal > userItems.length) ||
    (groupTotal > groupItems.length);

  const commit = (c: SubjectCandidate) => {
    onChange(c.id);
    setQuery(c.id);
    setOpen(false);
  };

  const kindLabel = (k: SubjectCandidate["kind"]) => k === "user" ? "U" : k === "group" ? "G" : "R";
  const kindCls = (k: SubjectCandidate["kind"]) =>
    k === "user" ? "bg-info/10 text-info" :
    k === "group" ? "bg-emerald-500/10 text-emerald-500" :
    "bg-amber-500/10 text-amber-500";

  return (
    <div ref={rootRef} className="relative">
      <input
        value={query}
        placeholder={placeholder}
        className={inputCls}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-surface-1 shadow-[var(--shadow-elevated)] max-h-[280px] overflow-y-auto">
          {loading && items.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-text-muted">
              <div className="h-3 w-3 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
              {t("common.loading" as any) || "Loading…"}
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-text-muted">{t("common.noData" as any) || "No results"}</div>
          )}
          {items.map((c) => (
            <button key={`${c.kind}:${c.id}`} onClick={() => commit(c)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2 transition-colors">
              <span className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold ${kindCls(c.kind)}`}>
                {kindLabel(c.kind)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[12px] text-text-primary">{c.displayName}</span>
                <span className="block truncate font-mono text-[10px] text-text-muted">{c.id}</span>
              </span>
            </button>
          ))}
          {truncated && (
            <div className="sticky bottom-0 border-t border-border-subtle bg-surface-2/80 backdrop-blur px-3 py-1.5 text-[11px] text-text-muted">
              {(t("authz.test.pickerTruncated" as any) || "{shown} of {total} shown — keep typing to narrow results")
                .replace("{shown}", String(userItems.length + groupItems.length))
                .replace("{total}", String(userTotal + groupTotal))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════ SUGGEST PICKER ═══════
// Plain-string counterpart of SubjectPicker. Data is in-memory (resources /
// actions extracted from permissions), so no network path is needed. We do
// cap the rendered rows because a permission-heavy app could still hit
// hundreds of resources — rendering them all would jank the dropdown on
// every keystroke; the cap keeps it O(1).
const SUGGEST_RENDER_CAP = 50;

function SuggestPicker({ value, onChange, suggestions, placeholder, inputCls, t }: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder: string;
  inputCls: string;
  t: (key: any) => string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => s.toLowerCase().includes(q));
  }, [suggestions, value]);

  const visible = filtered.slice(0, SUGGEST_RENDER_CAP);
  const hidden = Math.max(0, filtered.length - visible.length);

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        value={value}
        placeholder={placeholder}
        className={inputCls}
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
      />
      {open && visible.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-surface-1 shadow-[var(--shadow-elevated)] max-h-[260px] overflow-y-auto">
          {visible.map((s) => (
            <button key={s} onClick={() => commit(s)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2 transition-colors">
              <span className="font-mono text-[12px] text-text-primary truncate">{s}</span>
            </button>
          ))}
          {hidden > 0 && (
            <div className="sticky bottom-0 border-t border-border-subtle bg-surface-2/80 backdrop-blur px-3 py-1.5 text-[11px] text-text-muted">
              {(t("authz.test.pickerTruncated" as any) || "{shown} of {total} shown — keep typing to narrow results")
                .replace("{shown}", String(visible.length))
                .replace("{total}", String(filtered.length))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════ TEST RESULT PANEL ═══════
// Renders the outcome of BizEnforceEx. Always takes up the same vertical
// footprint so running a test doesn't cause layout shift (CLS). An empty
// state explains what will appear; aria-live announces changes for SR users.
function TestResultPanel({ result, error, testing, t }: {
  result: BizBackend.EnforceTraceResult | null;
  error: string | null;
  testing: boolean;
  t: (key: any) => string;
}) {
  return (
    <div
      aria-live="polite"
      role="status"
      className="rounded-xl border border-border bg-surface-1 p-5 min-h-[180px]"
    >
      {!result && !error && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="mb-2 rounded-full bg-surface-2 p-3">
            <Play size={18} className="text-text-muted" />
          </div>
          <p className="text-[13px] font-medium text-text-secondary">
            {t("authz.test.resultEmptyTitle" as any) || "Result will appear here"}
          </p>
          <p className="text-[11px] text-text-muted mt-1">
            {t("authz.test.resultEmptyHint" as any) || "Fill subject, object and action, then run."}
          </p>
        </div>
      )}
      {testing && !result && (
        <div className="flex items-center gap-2 text-[12px] text-text-muted">
          <div className="h-3 w-3 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
          {t("common.loading" as any) || "Running…"}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-[12px] text-danger">
          <strong>{t("common.error" as any) || "Error"}:</strong> {error}
        </div>
      )}
      {result && (
        <div className="space-y-4">
          {/* Verdict */}
          <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-[14px] border-l-4 ${
            result.allowed
              ? "bg-success/5 text-success border-success"
              : "bg-danger/5 text-danger border-danger"
          }`}>
            {result.allowed ? <Check size={18} /> : <X size={18} />}
            <span>{result.allowed ? (t("authz.test.result.allow" as any) || "ALLOW") : (t("authz.test.result.deny" as any) || "DENY")}</span>
            <span className="ml-auto text-[11px] font-normal opacity-80">
              {/* Backend already localized this via i18n.Translate using the
                  request's Accept-Language header. */}
              {result.reason}
            </span>
          </div>

          {/* Matched policy */}
          {result.matchedPolicy && result.matchedPolicy.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                {t("authz.test.matchedPolicy" as any) || "Matched policy"}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.matchedPolicy.map((part, i) => (
                  <span key={i} className="inline-block rounded bg-surface-2 border border-border px-2 py-0.5 font-mono text-[11px] text-text-primary">
                    {part || '""'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Role chain */}
          {result.subjectRoles && result.subjectRoles.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                {t("authz.test.roleChain" as any) || "Subject roles (transitive)"}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.subjectRoles.map((r) => (
                  <span key={r} className="inline-block rounded-full bg-accent/10 text-accent px-2 py-0.5 font-mono text-[11px]">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
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

// ── ReBAC Tabs — thin wrappers over the per-feature components ──────────
// The dispatch logic lives in the page body; these functions exist so
// the tab names line up with their Casbin siblings in a single switch.

function RebacOverviewTab({ appId, t: _t }: { appId: string; t: (k: any) => string }) {
  return <BizReBACOverview appId={appId} />;
}

function RebacSchemaTab({ appId, t: _t }: { appId: string; t: (k: any) => string }) {
  // BizSchemaEditor owns the shared AST and the DSL↔Visual sync.
  return <BizSchemaEditor appId={appId} />;
}

function RebacTuplesTab({ appId, t: _t }: { appId: string; t: (k: any) => string }) {
  return <BizTupleManager appId={appId} />;
}

function RebacTesterTab({ appId, t: _t, initialRequest }: { appId: string; t: (k: any) => string; initialRequest?: { object: string; relation: string; user: string } }) {
  return <BizReBACTester appId={appId} initialRequest={initialRequest} />;
}

function RebacIntegrationTab({ appId, t: _t }: { appId: string; t: (k: any) => string }) {
  return <BizIntegrationTab appId={appId} />;
}
