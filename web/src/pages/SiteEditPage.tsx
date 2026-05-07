import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2, LogOut, X, ArrowRight, Users as UsersIcon, Globe, Server,
  Lock, ShieldAlert, KeyRound, ChevronDown, BellOff, ExternalLink,
  UserCircle2, Route, Boxes, ShieldCheck, Activity, Radio, Wrench,
} from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as SiteBackend from "../backend/SiteBackend";
import * as OrganizationBackend from "../backend/OrganizationBackend";
import * as ApplicationBackend from "../backend/ApplicationBackend";
import * as RuleBackend from "../backend/RuleBackend";
import * as CertBackend from "../backend/CertBackend";
import * as ProviderBackend from "../backend/ProviderBackend";
import type { Site } from "../backend/SiteBackend";
import MultiSearchSelect from "../components/MultiSearchSelect";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";
import SingleSearchSelect from "../components/SingleSearchSelect";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";
import { getStoredAccount, isGlobalAdmin } from "../utils/auth";

const SSL_MODE_OPTIONS = [
  { value: "HTTP", label: "HTTP" },
  { value: "HTTPS and HTTP", label: "HTTPS and HTTP" },
  { value: "HTTPS Only", label: "HTTPS Only" },
  { value: "Static Folder", label: "Static Folder" },
];

// Reusable tag input for string arrays (otherDomains, hosts, challenges, alertProviders)
function TagListInput({ values, onChange, placeholder }: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((v) => v !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      addTag(input);
    }
  };

  return (
    <div className="space-y-1.5">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="flex items-center gap-1 rounded-md bg-accent/10 text-accent px-2 py-0.5 text-[12px] font-medium">
              {v}
              <button onClick={() => removeTag(v)} className="hover:text-danger transition-colors"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`${monoInputClass} w-full`}
      />
    </div>
  );
}

export default function SiteEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [site, setSite] = useState<Site | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  useEffect(() => { if (saved) { const timer = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(timer); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");

  // Admin org dropdown
  const account = getStoredAccount();
  const isAdmin = isGlobalAdmin(account);
  const [orgOptions, setOrgOptions] = useState<{ value: string; label: string }[]>([]);

  // Dynamic options
  const [appOptions, setAppOptions] = useState<{ value: string; label: string }[]>([]);
  const [ruleOptions, setRuleOptions] = useState<{ value: string; label: string }[]>([]);
  const [certOptions, setCertOptions] = useState<{ value: string; label: string }[]>([]);
  const [notifyProviderOptions, setNotifyProviderOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    OrganizationBackend.getOrganizationNames("admin").then((res) => {
      if (res.status === "ok" && res.data) {
        setOrgOptions(res.data.map((o) => ({ value: o.name, label: o.displayName || o.name })));
      }
    }).catch(() => {});
  }, [isAdmin]);

  // Load apps, rules, certs, notification providers in parallel when site.owner changes
  useEffect(() => {
    if (!site?.owner) return;
    Promise.all([
      ApplicationBackend.getApplicationsByOrganization({ owner: "admin", organization: site.owner }),
      RuleBackend.getRules({ owner: site.owner }),
      CertBackend.getCerts({ owner: "admin" }),
      ProviderBackend.getProviders({ owner: site.owner, pageSize: -1 }),
    ]).then(([appRes, ruleRes, certRes, provRes]) => {
      if (appRes.status === "ok" && appRes.data) {
        setAppOptions(appRes.data.map((a) => ({ value: a.name, label: (a as any).displayName || a.name })));
      }
      if (ruleRes.status === "ok" && ruleRes.data) {
        setRuleOptions(ruleRes.data.map((r: any) => ({ value: `${r.owner}/${r.name}`, label: r.displayName || r.name })));
      }
      if (certRes.status === "ok" && certRes.data) {
        setCertOptions(certRes.data.map((c: any) => ({ value: c.name, label: c.displayName || c.name })));
      }
      if (provRes.status === "ok" && Array.isArray(provRes.data)) {
        setNotifyProviderOptions(
          provRes.data
            .filter((p) => p.category === "Notification")
            .map((p) => ({
              value: p.name,
              label: `${p.displayName || p.name}${p.type ? ` · ${p.type}` : ""}`,
            }))
        );
      }
    }).catch(() => {});
  }, [site?.owner]);

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Site>({
    queryKey: "site",
    owner,
    name,
    fetchFn: SiteBackend.getSite,
  });

  useEffect(() => {
    if (entity) { setSite(entity); setOriginalJson(JSON.stringify(entity)); }
  }, [entity]);

  const isDirty = !!site && originalJson !== "" && JSON.stringify(site) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !site) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setSite((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleOwnerChange = (val: string) => {
    setSite((prev) => prev ? { ...prev, owner: val, casdoorApplication: "" } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await SiteBackend.updateSite(owner!, name!, site);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess"));
        setSaved(true);
        setOriginalJson(JSON.stringify(site));
        setIsAddMode(false);
        invalidateList();
        if (site.name !== name) {
          navigate(`/sites/${site.owner}/${site.name}`, { replace: true });
        }
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed"), "error");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = await SiteBackend.updateSite(owner!, name!, site);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess"));
        invalidateList();
        navigate("/sites");
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed"), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = async () => {
    if (isAddMode) {
      await SiteBackend.deleteSite(site);
      invalidateList();
    }
    navigate("/sites");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await SiteBackend.deleteSite(site);
        if (res.status === "ok") {
          invalidateList();
          navigate("/sites");
        } else {
          modal.toast(res.msg || t("common.deleteFailed"), "error");
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  // Toggle a rule in the rules array
  const toggleRule = (ruleId: string) => {
    const current = site.rules || [];
    if (current.includes(ruleId)) {
      set("rules", current.filter((r) => r !== ruleId));
    } else {
      set("rules", [...current, ruleId]);
    }
  };

  const STATUS_OPTIONS = [
    { value: "Active", label: t("sites.status.active") },
    { value: "Inactive", label: t("sites.status.inactive") },
  ];

  const tlsOn = site.sslMode !== "HTTP";
  const hostsList = (site.hosts || []).filter(Boolean);
  const upstreamLabel = hostsList.length > 0
    ? hostsList[0]
    : site.host
      ? `${site.host}:${site.port || 0}`
      : site.port
        ? `:${site.port}`
        : "";
  const upstreamSubtitle = hostsList.length > 1
    ? t("sites.flow.upstreamMulti").replace("{count}", String(hostsList.length))
    : upstreamLabel
      ? t("sites.flow.upstream")
      : t("sites.flow.upstreamEmpty");

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("sites.title")}`}
        subtitle={`${owner}/${name}`}
        onBack={handleBack}
      >
        <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
          <Trash2 size={14} /> {t("common.delete")}
        </button>
        <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save")} />
        <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
          {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
          {t("common.saveAndExit")}
        </button>
      </StickyEditHeader>

      {showBanner && <UnsavedBanner isAddMode={isAddMode} />}

      {/* ── Traffic Flow Preview ────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* User */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-9 w-9 rounded-lg bg-info/10 text-info flex items-center justify-center">
              <UsersIcon size={16} />
            </div>
            <div className="leading-tight hidden sm:block">
              <div className="text-[12px] font-semibold text-text-primary">{t("sites.flow.user")}</div>
              <div className="text-[11px] text-text-muted">{t("sites.flow.userDesc")}</div>
            </div>
          </div>

          <ArrowRight size={14} className="text-text-muted shrink-0" />

          {/* Entry (domain + badges) */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
              <Globe size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-mono font-semibold text-text-primary truncate">
                {site.domain || <span className="text-text-muted font-sans italic">{t("sites.flow.entryEmpty")}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                {tlsOn ? (
                  <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-success/10 text-success">
                    <Lock size={9} /> {site.sslMode}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-warning/10 text-warning">
                    <ShieldAlert size={9} /> {t("sites.flow.tlsInsecure")}
                  </span>
                )}
                {tlsOn && !site.sslCert && (
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-info/10 text-info">
                    {t("sites.flow.autoCert")}
                  </span>
                )}
                {site.casdoorApplication && (
                  <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-accent/10 text-accent">
                    <KeyRound size={9} /> {t("sites.flow.ssoBadge")}: {site.casdoorApplication}
                  </span>
                )}
                {site.status === "Inactive" && (
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-danger/10 text-danger">
                    {t("sites.flow.inactive")}
                  </span>
                )}
              </div>
            </div>
          </div>

          <ArrowRight size={14} className="text-text-muted shrink-0" />

          {/* Upstream */}
          <div className="flex items-center gap-2 shrink-0 min-w-0 max-w-[40%]">
            <div className="h-9 w-9 rounded-lg bg-surface-3 text-text-secondary flex items-center justify-center shrink-0">
              <Server size={16} />
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-[12px] font-mono font-semibold text-text-primary truncate">
                {upstreamLabel || <span className="text-text-muted font-sans italic">{t("sites.flow.upstreamEmpty")}</span>}
              </div>
              <div className="text-[11px] text-text-muted truncate">{upstreamSubtitle}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 1. Identity ─────────────────────────────────────────── */}
      <FormSection
        title={t("sites.section.identity")}
        description={t("sites.section.identityDesc")}
        icon={<UserCircle2 size={16} />}
      >
        <FormField label={t("field.owner")} tooltip={t("sites.tooltip.owner")}>
          {isAdmin ? (
            <SingleSearchSelect
              value={site.owner}
              options={orgOptions}
              onChange={(v) => handleOwnerChange(v)}
              placeholder={t("common.search")}
            />
          ) : (
            <input value={site.owner} disabled className={inputClass} />
          )}
        </FormField>
        <FormField label={t("field.name")} required tooltip={t("sites.tooltip.name")} help={t("sites.helper.name")}>
          <input value={site.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")} tooltip={t("sites.tooltip.displayName")}>
          <input value={site.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("col.tag")} tooltip={t("sites.tooltip.tag")}>
          <input value={site.tag ?? ""} onChange={(e) => set("tag", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* ── 2. Traffic Entry (domain + SSL) ─────────────────────── */}
      <FormSection
        title={t("sites.section.traffic")}
        description={t("sites.section.trafficDesc")}
        icon={<Route size={16} />}
      >
        <FormField label={t("sites.field.domain")} tooltip={t("sites.tooltip.domain")} help={t("sites.helper.domain")}>
          <input value={site.domain} onChange={(e) => set("domain", e.target.value)} className={monoInputClass} placeholder="app.jetauth.com" />
        </FormField>
        <FormField label={t("sites.field.needRedirect")} tooltip={t("sites.tooltip.needRedirect")}>
          <Switch checked={site.needRedirect} onChange={(checked) => set("needRedirect", checked)} />
        </FormField>
        <FormField label={t("sites.field.otherDomains")} span="full" tooltip={t("sites.tooltip.otherDomains")}>
          <TagListInput
            values={site.otherDomains || []}
            onChange={(v) => set("otherDomains", v)}
            placeholder={t("sites.placeholder.otherDomains")}
          />
        </FormField>
        <FormField label={t("sites.field.sslMode")} tooltip={t("sites.tooltip.sslMode")}>
          <SimpleSelect value={site.sslMode} options={SSL_MODE_OPTIONS} onChange={(v) => set("sslMode", v)} />
        </FormField>
        <FormField label={t("sites.field.sslCert")} tooltip={t("sites.tooltip.sslCert")} help={!site.sslCert ? t("sites.helper.sslCert") : undefined}>
          <SingleSearchSelect
            value={site.sslCert ?? ""}
            options={certOptions}
            onChange={(v) => set("sslCert", v)}
            placeholder={t("common.search")}
          />
        </FormField>
      </FormSection>

      {/* ── 3. Upstream ─────────────────────────────────────────── */}
      <FormSection
        title={t("sites.section.upstream")}
        description={t("sites.section.upstreamDesc")}
        icon={<Boxes size={16} />}
      >
        <FormField label={t("sites.field.host")} tooltip={t("sites.tooltip.host")} help={t("sites.helper.host")}>
          <input value={site.host} onChange={(e) => set("host", e.target.value)} className={monoInputClass} placeholder="127.0.0.1" />
        </FormField>
        <FormField label={t("sites.field.port")} tooltip={t("sites.tooltip.port")}>
          <input type="number" min={0} max={65535} value={site.port} onChange={(e) => set("port", Number(e.target.value))} className={`${monoInputClass} w-32`} />
        </FormField>
        <FormField label={t("sites.field.hosts")} span="full" tooltip={t("sites.tooltip.hosts")} help={t("sites.helper.hosts")}>
          <TagListInput
            values={site.hosts || []}
            onChange={(v) => set("hosts", v)}
            placeholder={t("sites.placeholder.hosts")}
          />
        </FormField>
      </FormSection>

      {/* ── 4. Access Control (SSO + WAF Rules) ─────────────────── */}
      <FormSection
        title={t("sites.section.access")}
        description={t("sites.section.accessDesc")}
        icon={<ShieldCheck size={16} />}
      >
        <FormField label={t("sites.field.casdoorApp")} span="full" tooltip={t("sites.tooltip.casdoorApp")} help={!site.casdoorApplication ? t("sites.helper.casdoorApp") : undefined}>
          <SingleSearchSelect
            value={site.casdoorApplication ?? ""}
            options={appOptions}
            onChange={(v) => {
              // Clearing the application implicitly turns off URL authz so
              // the site can never persist an invalid state (backend would
              // reject it anyway — belt and suspenders).
              if (!v && site.enableBizAuthz) {
                set("enableBizAuthz", false);
              }
              set("casdoorApplication", v);
            }}
            placeholder={t("common.search")}
          />
        </FormField>

        {/* URL-level authorization sub-panel — only available once an
            application is bound, since the enforcer needs an identity source. */}
        {site.casdoorApplication && (
          <FormField label={t("sites.field.enableBizAuthz")} span="full" tooltip={t("sites.tooltip.enableBizAuthz")} help={t("sites.helper.enableBizAuthz")}>
            <Switch checked={!!site.enableBizAuthz} onChange={(checked) => set("enableBizAuthz", checked)} />
          </FormField>
        )}
        {site.casdoorApplication && site.enableBizAuthz && (
          <>
            <FormField label={t("sites.field.bizAuthzFailMode")} tooltip={t("sites.tooltip.bizAuthzFailMode")}>
              <SimpleSelect
                value={site.bizAuthzFailMode || "closed"}
                options={[
                  { value: "closed", label: t("sites.failMode.closed") },
                  { value: "open", label: t("sites.failMode.open") },
                ]}
                onChange={(v) => set("bizAuthzFailMode", v)}
              />
            </FormField>
            <FormField label={t("sites.field.bizAuthzBypass")} span="full" tooltip={t("sites.tooltip.bizAuthzBypass")} help={t("sites.helper.bizAuthzBypass")}>
              <TagListInput
                values={site.bizAuthzBypass || []}
                onChange={(v) => set("bizAuthzBypass", v)}
                placeholder={t("sites.placeholder.bizAuthzBypass")}
              />
            </FormField>
          </>
        )}

        <FormField label={t("sites.field.rules")} span="full" tooltip={t("sites.tooltip.rules")}>
          {ruleOptions.length > 0 ? (
            <div className="space-y-1.5">
              {(site.rules || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(site.rules || []).map((r) => (
                    <span key={r} className="flex items-center gap-1 rounded-md bg-accent/10 text-accent px-2 py-0.5 text-[12px] font-medium">
                      {r}
                      <button onClick={() => toggleRule(r)} className="hover:text-danger transition-colors"><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {ruleOptions.filter((r) => !(site.rules || []).includes(r.value)).map((r) => (
                  <button
                    key={r.value}
                    onClick={() => toggleRule(r.value)}
                    className="rounded-md border border-border bg-surface-1 px-2 py-0.5 text-[11px] text-text-muted hover:bg-surface-2 hover:text-text-secondary transition-colors"
                  >
                    + {r.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-text-muted">{t("sites.helper.rulesEmpty")}</p>
          )}
        </FormField>
      </FormSection>

      {/* ── 5. Health Monitoring ────────────────────────────────── */}
      <FormSection
        title={t("sites.section.health")}
        description={t("sites.section.healthDesc")}
        icon={<Activity size={16} />}
      >
        <FormField label={t("sites.field.enableAlert")} span="full" tooltip={t("sites.tooltip.enableAlert")}>
          <Switch checked={site.enableAlert} onChange={(checked) => set("enableAlert", checked)} />
        </FormField>
        {site.enableAlert && (
          <>
            <FormField label={t("sites.field.alertInterval")} tooltip={t("sites.tooltip.alertInterval")} help={t("sites.helper.alertInterval")}>
              <div className="flex items-center gap-2">
                <input type="number" min={1} value={site.alertInterval} onChange={(e) => set("alertInterval", Number(e.target.value))} className={`${monoInputClass} w-32`} />
                <span className="text-[12px] text-text-muted">{t("sites.field.seconds")}</span>
              </div>
            </FormField>
            <FormField label={t("sites.field.alertTryTimes")} tooltip={t("sites.tooltip.alertTryTimes")} help={t("sites.helper.alertTryTimes")}>
              <input type="number" min={1} value={site.alertTryTimes} onChange={(e) => set("alertTryTimes", Number(e.target.value))} className={`${monoInputClass} w-32`} />
            </FormField>
            <FormField label={t("sites.field.alertProviders")} span="full" tooltip={t("sites.tooltip.alertProviders")}>
              {notifyProviderOptions.length > 0 ? (
                <MultiSearchSelect
                  selected={site.alertProviders || []}
                  options={notifyProviderOptions}
                  onChange={(v) => set("alertProviders", v)}
                  placeholder={t("sites.placeholder.alertProvidersSelect")}
                />
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
                  <div className="flex items-start gap-2 min-w-0">
                    <BellOff size={14} className="shrink-0 mt-0.5 text-warning" />
                    <p className="text-[12px] text-text-secondary leading-snug">
                      {t("sites.alertProviders.empty")}
                    </p>
                  </div>
                  <Link
                    to="/providers"
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/5 px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent/10 transition-colors"
                  >
                    {t("sites.alertProviders.create")} <ExternalLink size={11} />
                  </Link>
                </div>
              )}
            </FormField>
          </>
        )}
      </FormSection>

      {/* ── 6. Runtime (status + public IP) ─────────────────────── */}
      <FormSection
        title={t("sites.section.runtime")}
        description={t("sites.section.runtimeDesc")}
        icon={<Radio size={16} />}
      >
        <FormField label={t("sites.field.status")} tooltip={t("sites.tooltip.status")}>
          <SimpleSelect value={site.status ?? "Active"} options={STATUS_OPTIONS} onChange={(v) => set("status", v)} />
        </FormField>
        <FormField label={t("sites.field.publicIp")} tooltip={t("sites.tooltip.publicIp")}>
          <input value={site.publicIp ?? ""} disabled className={monoInputClass} placeholder="—" />
        </FormField>
      </FormSection>

      {/* ── 7. Advanced (collapsible) ───────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="w-full flex items-center gap-2.5 px-5 py-3 hover:bg-surface-2/30 transition-colors text-left"
        >
          <Wrench size={16} className="text-text-muted shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-text-primary">{t("sites.section.advanced")}</div>
            <div className="text-[11px] text-text-muted mt-0.5">{t("sites.section.advancedDesc")}</div>
          </div>
          <motion.span animate={{ rotate: showAdvanced ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 text-text-muted">
            <ChevronDown size={16} />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-t border-border-subtle"
            >
              <div className="p-5">
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-[12px] text-warning">
                  <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                  <span>{t("sites.advanced.warn")}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <FormField label={t("sites.field.disableVerbose")} tooltip={t("sites.tooltip.disableVerbose")}>
                    <Switch checked={site.disableVerbose} onChange={(checked) => set("disableVerbose", checked)} />
                  </FormField>
                  <FormField label={t("sites.field.challenges")} span="full" tooltip={t("sites.tooltip.challenges")} help={t("sites.helper.challenges")}>
                    <TagListInput
                      values={site.challenges || []}
                      onChange={(v) => set("challenges", v)}
                      placeholder={t("sites.placeholder.challenges")}
                    />
                  </FormField>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
