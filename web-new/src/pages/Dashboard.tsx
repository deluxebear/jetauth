import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users, AppWindow, ShieldCheck, KeyRound,
  ArrowUpRight, Clock, Globe, TrendingUp,
  UserPlus, CalendarDays, CalendarRange,
  LogIn, LogOut, UserCog, FilePen, Trash2, PlusCircle, Settings,
} from "lucide-react";
import { useTranslation } from "../i18n";
import { request } from "../backend/request";
import { useOrganization } from "../OrganizationContext";
import * as RecordBackend from "../backend/RecordBackend";
import type { Record as AuditRecord } from "../backend/RecordBackend";

interface DashboardData {
  organizationCounts: number[];
  userCounts: number[];
  providerCounts: number[];
  applicationCounts: number[];
  subscriptionCounts: number[];
  roleCounts: number[];
  groupCounts: number[];
  resourceCounts: number[];
  certCounts: number[];
  permissionCounts: number[];
  transactionCounts: number[];
  modelCounts: number[];
  adapterCounts: number[];
  enforcerCounts: number[];
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export default function Dashboard() {
  const { t } = useTranslation();
  const { selectedOrg } = useOrganization();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AuditRecord[]>([]);

  useEffect(() => {
    setLoading(true);
    setData(null);
    // Dashboard API expects "" for global, org name otherwise (same as original)
    const owner = selectedOrg === "All" ? "" : selectedOrg;
    request<DashboardData>("GET", `/api/get-dashboard?owner=${encodeURIComponent(owner)}`)
      .then((res) => {
        if (res.status === "ok" && res.data) {
          setData(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Fetch recent activity records
    const recordOwner = selectedOrg === "All" ? "" : selectedOrg;
    RecordBackend.getRecords({ owner: recordOwner, p: 1, pageSize: 10, sortField: "createdTime", sortOrder: "descend" })
      .then((res) => {
        if (res.status === "ok" && Array.isArray(res.data)) {
          setRecords(res.data);
        }
      })
      .catch(() => {});
  }, [selectedOrg]);

  // Array has 31 entries: index 0 = 30 days ago, index 30 = today
  const userTotal = data?.userCounts?.[30] ?? 0;
  const userDaily = data ? (data.userCounts[30] - data.userCounts[30 - 1]) : 0;
  const userWeekly = data ? (data.userCounts[30] - data.userCounts[30 - 7]) : 0;
  const userMonthly = data ? (data.userCounts[30] - data.userCounts[30 - 30]) : 0;

  const appTotal = data?.applicationCounts?.[30] ?? 0;
  const roleTotal = data?.roleCounts?.[30] ?? 0;
  const permTotal = data?.permissionCounts?.[30] ?? 0;

  const displayVal = (v: number) => loading ? "—" : v.toLocaleString();

  // Top row: user stats matching original (total, daily, weekly, monthly)
  const userStats = [
    {
      labelKey: "dashboard.stats.users" as const,
      value: displayVal(userTotal),
      icon: <Users size={18} />,
      color: "text-accent",
      bg: "bg-accent/10",
      growth: null as number | null,
    },
    {
      labelKey: "dashboard.growth.daily" as const,
      value: displayVal(userDaily),
      icon: <UserPlus size={18} />,
      color: "text-success",
      bg: "bg-success/10",
      growth: userDaily,
    },
    {
      labelKey: "dashboard.growth.weekly" as const,
      value: displayVal(userWeekly),
      icon: <CalendarDays size={18} />,
      color: "text-info",
      bg: "bg-info/10",
      growth: userWeekly,
    },
    {
      labelKey: "dashboard.growth.monthly" as const,
      value: displayVal(userMonthly),
      icon: <CalendarRange size={18} />,
      color: "text-warning",
      bg: "bg-warning/10",
      growth: userMonthly,
    },
  ];

  // Second row: other entity counts
  const entityStats = [
    { labelKey: "dashboard.stats.applications" as const, value: displayVal(appTotal), icon: <AppWindow size={18} />, color: "text-info", bg: "bg-info/10" },
    { labelKey: "dashboard.stats.roles" as const, value: displayVal(roleTotal), icon: <KeyRound size={18} />, color: "text-warning", bg: "bg-warning/10" },
    { labelKey: "dashboard.stats.permissions" as const, value: displayVal(permTotal), icon: <ShieldCheck size={18} />, color: "text-success", bg: "bg-success/10" },
  ];

  // Map record action to icon and display label
  const getActionInfo = (record: AuditRecord) => {
    const action = record.action || "";
    const method = record.method || "";

    if (action === "login") return { icon: <LogIn size={14} />, label: t("dashboard.activity.login" as any) };
    if (action === "logout") return { icon: <LogOut size={14} />, label: t("dashboard.activity.logout" as any) };
    if (method === "POST" && record.requestUri?.includes("/add-")) return { icon: <PlusCircle size={14} />, label: t("dashboard.activity.add" as any) };
    if (method === "POST" && record.requestUri?.includes("/delete-")) return { icon: <Trash2 size={14} />, label: t("dashboard.activity.delete" as any) };
    if (method === "POST" && record.requestUri?.includes("/update-")) return { icon: <FilePen size={14} />, label: t("dashboard.activity.update" as any) };
    if (method === "POST") return { icon: <Settings size={14} />, label: action || method };
    return { icon: <Globe size={14} />, label: action || `${method} ${record.requestUri || ""}` };
  };

  // Format relative time
  const formatRelativeTime = (timeStr: string) => {
    if (!timeStr) return "";
    const now = Date.now();
    const then = new Date(timeStr).getTime();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 60) return t("dashboard.activity.justNow" as any);
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} ${t("dashboard.activity.minutesAgo" as any)}`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ${t("dashboard.activity.hoursAgo" as any)}`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} ${t("dashboard.activity.daysAgo" as any)}`;
    return new Date(timeStr).toLocaleDateString();
  };

  const quickActions = [
    { labelKey: "dashboard.quickActions.addUser" as const, to: "/users", icon: <Users size={15} /> },
    { labelKey: "dashboard.quickActions.newApp" as const, to: "/applications", icon: <AppWindow size={15} /> },
    { labelKey: "dashboard.quickActions.configProvider" as const, to: "/providers", icon: <Globe size={15} /> },
    { labelKey: "dashboard.quickActions.manageRoles" as const, to: "/roles", icon: <KeyRound size={15} /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-[13px] text-text-muted mt-0.5">{t("dashboard.subtitle")}</p>
      </div>

      {/* User stats: total + growth (matches original top row) */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {userStats.map((s) => (
          <motion.div
            key={s.labelKey}
            variants={fadeUp}
            className="rounded-xl border border-border bg-surface-1 p-5 hover:border-border/80 transition-colors group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`rounded-lg ${s.bg} p-2 ${s.color}`}>{s.icon}</div>
              {s.growth !== null && !loading && s.growth > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-success/10 px-1.5 py-0.5 text-[11px] font-mono font-medium text-success">
                  <TrendingUp size={10} />+{s.growth}
                </span>
              )}
            </div>
            <div className="text-2xl font-bold tracking-tight text-text-primary font-mono">
              {s.growth !== null && !loading ? (
                <span className="flex items-center gap-1.5">
                  <ArrowUpRight size={20} className="text-success" />
                  {s.value}
                </span>
              ) : (
                s.value
              )}
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[12px] text-text-muted">{t(s.labelKey as any)}</span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Other entity stats */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {entityStats.map((s) => (
          <motion.div
            key={s.labelKey}
            variants={fadeUp}
            className="rounded-xl border border-border bg-surface-1 p-5 hover:border-border/80 transition-colors group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`rounded-lg ${s.bg} p-2 ${s.color}`}>{s.icon}</div>
              <ArrowUpRight size={14} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-text-primary font-mono">{s.value}</div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[12px] text-text-muted">{t(s.labelKey)}</span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity — real records from /api/get-records */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="lg:col-span-2 rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">{t("dashboard.activity")}</h2>
            <Link to="/records" className="text-[12px] text-accent hover:text-accent-hover transition-colors">{t("common.viewAll")}</Link>
          </div>
          <div className="space-y-1">
            {records.length > 0 ? records.map((record) => {
              const info = getActionInfo(record);
              return (
                <div key={record.id || record.name} className="flex items-center gap-3 rounded-lg p-3 hover:bg-surface-2/50 transition-colors">
                  <div className="rounded-lg bg-surface-3 p-2 text-text-muted">{info.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-text-primary">{info.label}</div>
                    <div className="text-[11px] text-text-muted font-mono">{record.user || record.organization || "—"}</div>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-text-muted whitespace-nowrap">
                    <Clock size={11} />
                    {formatRelativeTime(record.createdTime)}
                  </div>
                </div>
              );
            }) : (
              <div className="text-center py-8 text-[13px] text-text-muted">
                {t("dashboard.activity.empty")}
              </div>
            )}
          </div>
        </motion.div>

        {/* Quick actions + System */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="rounded-xl border border-border bg-surface-1 p-5">
          <h2 className="text-sm font-semibold mb-4">{t("dashboard.quickActions")}</h2>
          <div className="space-y-2">
            {quickActions.map((a) => (
              <a
                key={a.labelKey}
                href={a.to}
                className="flex items-center gap-3 rounded-lg border border-border-subtle px-3 py-2.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary hover:border-border transition-all"
              >
                <span className="text-text-muted">{a.icon}</span>
                {t(a.labelKey)}
              </a>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-border-subtle">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">
              {t("dashboard.system")}
            </h3>
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-text-muted">{t("dashboard.system.version")}</span>
                <span className="font-mono text-text-secondary">v2.400.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">{t("dashboard.system.database")}</span>
                <span className="font-mono text-text-secondary">SQLite</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
