import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, LogOut} from "lucide-react";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as SiteBackend from "../backend/SiteBackend";
import type { Site } from "../backend/SiteBackend";
import { friendlyError } from "../utils/errorHelper";

const SSL_MODE_OPTIONS = [
  { id: "HTTP", name: "HTTP" },
  { id: "HTTPS and HTTP", name: "HTTPS and HTTP" },
  { id: "HTTPS Only", name: "HTTPS Only" },
  { id: "Static Folder", name: "Static Folder" },
];

const STATUS_OPTIONS = [
  { id: "Active", name: "Active" },
  { id: "Inactive", name: "Inactive" },
];

export default function SiteEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [site, setSite] = useState<Site | null>(null);
  const [saving, setSaving] = useState(false);

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Site>({
    queryKey: "site",
    owner,
    name,
    fetchFn: SiteBackend.getSite,
  });

  useEffect(() => {
    if (entity) setSite(entity);
  }, [entity]);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await SiteBackend.updateSite(owner!, name!, site);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setIsAddMode(false);
        invalidateList();
        if (site.name !== name) {
          navigate(`/sites/${site.owner}/${site.name}`, { replace: true });
        }
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
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
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/sites");
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
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
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  const parseTagList = (val: string): string[] =>
    val.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("sites.title" as any)}</h1>
            <p className="text-[13px] text-text-muted font-mono mt-0.5">{owner}/{name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
            <Trash2 size={14} /> {t("common.delete")}
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg border border-accent px-3 py-2 text-[13px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /> : <Save size={14} />}
            {t("common.save")}
          </button>
          <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
            {t("common.saveAndExit" as any)}
          </button>
        </div>
      </div>

      {/* Basic Info */}
      <FormSection title={t("sites.section.basic" as any)}>
        <FormField label={t("field.owner")}>
          <input value={site.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={site.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={site.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("col.tag" as any)}>
          <input value={site.tag ?? ""} onChange={(e) => set("tag", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Domain */}
      <FormSection title={t("sites.section.domain" as any)}>
        <FormField label={t("sites.field.domain" as any)}>
          <input value={site.domain} onChange={(e) => set("domain", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("sites.field.otherDomains" as any)} span="full">
          <input
            value={(site.otherDomains || []).join(", ")}
            onChange={(e) => set("otherDomains", parseTagList(e.target.value))}
            className={inputClass}
            placeholder={t("sites.field.otherDomainsPlaceholder" as any)}
          />
        </FormField>
        <FormField label={t("sites.field.needRedirect" as any)}>
          <Switch checked={site.needRedirect} onChange={(checked) => set("needRedirect", checked)} />
        </FormField>
        <FormField label={t("sites.field.disableVerbose" as any)}>
          <Switch checked={site.disableVerbose} onChange={(checked) => set("disableVerbose", checked)} />
        </FormField>
      </FormSection>

      {/* Rules */}
      <FormSection title={t("sites.field.rules" as any)}>
        <FormField label={t("sites.field.rules" as any)} span="full">
          <input
            value={(site.rules || []).join(", ")}
            onChange={(e) => set("rules", parseTagList(e.target.value))}
            className={inputClass}
          />
        </FormField>
      </FormSection>

      {/* Alert */}
      <FormSection title={t("sites.section.alert" as any)}>
        <FormField label={t("sites.field.enableAlert" as any)}>
          <Switch checked={site.enableAlert} onChange={(checked) => set("enableAlert", checked)} />
        </FormField>
        {site.enableAlert && (
          <>
            <FormField label={t("sites.field.alertInterval" as any)}>
              <input type="number" min={1} value={site.alertInterval} onChange={(e) => set("alertInterval", Number(e.target.value))} className={monoInputClass} />
            </FormField>
            <FormField label={t("sites.field.alertTryTimes" as any)}>
              <input type="number" min={1} value={site.alertTryTimes} onChange={(e) => set("alertTryTimes", Number(e.target.value))} className={monoInputClass} />
            </FormField>
            <FormField label={t("sites.field.alertProviders" as any)} span="full">
              <input
                value={(site.alertProviders || []).join(", ")}
                onChange={(e) => set("alertProviders", parseTagList(e.target.value))}
                className={inputClass}
              />
            </FormField>
          </>
        )}
      </FormSection>

      {/* Challenges */}
      <FormSection title={t("sites.field.challenges" as any)}>
        <FormField label={t("sites.field.challenges" as any)} span="full">
          <input
            value={(site.challenges || []).join(", ")}
            onChange={(e) => set("challenges", parseTagList(e.target.value))}
            className={inputClass}
          />
        </FormField>
      </FormSection>

      {/* Network */}
      <FormSection title={t("sites.section.network" as any)}>
        <FormField label={t("sites.field.host" as any)}>
          <input value={site.host} onChange={(e) => set("host", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("sites.field.port" as any)}>
          <input type="number" min={0} max={65535} value={site.port} onChange={(e) => set("port", Number(e.target.value))} className={monoInputClass} />
        </FormField>
        <FormField label={t("sites.field.hosts" as any)} span="full">
          <input
            value={(site.hosts || []).join(", ")}
            onChange={(e) => set("hosts", parseTagList(e.target.value))}
            className={inputClass}
          />
        </FormField>
        <FormField label={t("sites.field.publicIp" as any)}>
          <input value={site.publicIp ?? ""} disabled className={monoInputClass} />
        </FormField>
      </FormSection>

      {/* SSL */}
      <FormSection title={t("sites.section.ssl" as any)}>
        <FormField label={t("sites.field.sslMode" as any)}>
          <select value={site.sslMode} onChange={(e) => set("sslMode", e.target.value)} className={inputClass}>
            {SSL_MODE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </FormField>
        <FormField label={t("sites.field.sslCert" as any)}>
          <input value={site.sslCert ?? ""} disabled className={inputClass} />
        </FormField>
      </FormSection>

      {/* Application & Status */}
      <FormSection title={t("sites.section.status" as any)}>
        <FormField label={t("sites.field.casdoorApp" as any)}>
          <input value={site.casdoorApplication ?? ""} onChange={(e) => set("casdoorApplication", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("sites.field.status" as any)}>
          <select value={site.status ?? "Active"} onChange={(e) => set("status", e.target.value)} className={inputClass}>
            {STATUS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </FormField>
      </FormSection>
    </motion.div>
  );
}
