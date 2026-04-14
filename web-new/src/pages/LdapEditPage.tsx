import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, RefreshCw, LogOut, Plus, X } from "lucide-react";
import { FormField, FormSection, Switch, inputClass, monoInputClass } from "../components/FormSection";
import SimpleSelect from "../components/SimpleSelect";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { friendlyError } from "../utils/errorHelper";
import * as LdapBackend from "../backend/LdapBackend";
import * as GroupBackend from "../backend/GroupBackend";
import type { Ldap } from "../backend/LdapBackend";

const FILTER_FIELDS = ["uid", "mail", "mobile", "sAMAccountName"];
const PASSWORD_TYPES = ["Plain", "SSHA", "MD5"];

export default function LdapEditPage() {
  const { owner, id } = useParams<{ owner: string; id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const [ldap, setLdap] = useState<Ldap | null>(null);
  const [groups, setGroups] = useState<{ name: string; displayName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Custom attributes — use separate state to support empty rows during editing
  const [customAttrs, setCustomAttrsState] = useState<{ id: number; attrName: string; propName: string }[]>([]);
  const customAttrsInitRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!owner || !id) return;
    setLoading(true);
    try {
      const [ldapRes, groupRes] = await Promise.all([
        LdapBackend.getLdap(owner, id),
        GroupBackend.getGroups({ owner }),
      ]);
      if (ldapRes.status === "ok" && ldapRes.data) {
        setLdap(ldapRes.data);
      } else {
        modal.showError(ldapRes.msg || t("ldap.error.loadFailed" as any));
        navigate(-1);
      }
      if (groupRes.status === "ok" && groupRes.data) {
        setGroups(groupRes.data as any);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [owner, id, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (ldap && !customAttrsInitRef.current) {
      customAttrsInitRef.current = true;
      setCustomAttrsState(
        Object.entries(ldap.customAttributes ?? {}).map(([k, v], i) => ({ id: i, attrName: k, propName: v }))
      );
    }
  }, [ldap]);

  if (loading || !ldap) {
    return <div className="flex items-center justify-center py-24"><div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /></div>;
  }

  const set = (key: string, val: unknown) =>
    setLdap((prev) => prev ? { ...prev, [key]: val } : prev);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await LdapBackend.updateLdap(ldap);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = await LdapBackend.updateLdap(ldap);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        navigate(`/organizations/admin/${owner}`);
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleFilterField = (field: string) => {
    const current = ldap.filterFields ?? [];
    set("filterFields", current.includes(field)
      ? current.filter((f) => f !== field)
      : [...current, field]);
  };

  const syncCustomAttrs = (attrs: { id: number; attrName: string; propName: string }[]) => {
    setCustomAttrsState(attrs);
    const obj: Record<string, string> = {};
    attrs.forEach((a) => { if (a.attrName.trim()) obj[a.attrName.trim()] = a.propName; });
    set("customAttributes", obj);
  };
  const addCustomAttr = () => {
    setCustomAttrsState((prev) => [...prev, { id: Date.now(), attrName: "", propName: "" }]);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t("common.edit")} {t("ldap.title" as any)}</h1>
            <p className="text-[13px] text-text-muted font-mono mt-0.5">{owner}/{id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/ldap/sync/${owner}/${id}`)} className="flex items-center gap-1.5 rounded-lg border border-accent px-3 py-2 text-[13px] font-medium text-accent hover:bg-accent/10 transition-colors">
            <RefreshCw size={14} /> {t("ldap.syncLdap" as any)}
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg border border-accent px-3 py-2 text-[13px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /> : <Save size={14} />}
            {t("common.save")}
          </button>
          <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
            {t("common.saveAndExit")}
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-5">
        <FormSection title={t("ldap.section.connection" as any)}>
          <FormField label={t("ldap.field.organization" as any)}>
            <input value={ldap.owner} disabled className={`${inputClass} opacity-60`} />
          </FormField>
          <FormField label={t("ldap.field.id" as any)}>
            <input value={ldap.id} disabled className={`${monoInputClass} opacity-60`} />
          </FormField>
          <FormField label={t("ldap.field.serverName" as any)} help={t("ldap.help.serverName" as any)}>
            <input value={ldap.serverName} onChange={(e) => set("serverName", e.target.value)} className={inputClass} />
          </FormField>
          <FormField label={t("ldap.field.host" as any)} help={t("ldap.help.host" as any)}>
            <input value={ldap.host} onChange={(e) => set("host", e.target.value)} className={inputClass} />
          </FormField>
          <FormField label={t("ldap.field.port" as any)} help={t("ldap.help.port" as any)}>
            <input type="number" value={ldap.port} onChange={(e) => set("port", Math.max(0, Math.min(65535, Number(e.target.value))))} min={0} max={65535} className={monoInputClass} />
          </FormField>
          <FormField label={t("ldap.field.enableSsl" as any)} help={t("ldap.help.enableSsl" as any)}>
            <Switch checked={ldap.enableSsl} onChange={(v) => set("enableSsl", v)} />
          </FormField>
          <FormField label={t("ldap.field.allowSelfSignedCert" as any)} help={t("ldap.help.allowSelfSignedCert" as any)}>
            <Switch checked={ldap.allowSelfSignedCert} onChange={(v) => set("allowSelfSignedCert", v)} />
          </FormField>
        </FormSection>

        <FormSection title={t("ldap.section.search" as any)}>
          <FormField label={t("ldap.field.baseDn" as any)} help={t("ldap.help.baseDn" as any)} span="full">
            <input value={ldap.baseDn} onChange={(e) => set("baseDn", e.target.value)} className={monoInputClass} />
          </FormField>
          <FormField label={t("ldap.field.filter" as any)} help={t("ldap.help.filter" as any)} span="full">
            <input value={ldap.filter ?? ""} onChange={(e) => set("filter", e.target.value)} className={monoInputClass} placeholder="(&(objectClass=*))" />
          </FormField>
          <FormField label={t("ldap.field.filterFields" as any)} help={t("ldap.help.filterFields" as any)} span="full">
            <div className="flex flex-wrap gap-2">
              {FILTER_FIELDS.map((f) => {
                const sel = (ldap.filterFields ?? []).includes(f);
                return (
                  <button key={f} type="button" onClick={() => toggleFilterField(f)}
                    className={`rounded-md border px-2.5 py-1 text-[12px] font-mono font-medium transition-colors ${sel ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface-2 text-text-muted hover:text-text-secondary"}`}>
                    {f}
                  </button>
                );
              })}
            </div>
          </FormField>
        </FormSection>

        <FormSection title={t("ldap.section.auth" as any)}>
          <FormField label={t("ldap.field.adminUser" as any)} help={t("ldap.help.adminUser" as any)} span="full">
            <input value={ldap.username} onChange={(e) => set("username", e.target.value)} className={monoInputClass} />
          </FormField>
          <FormField label={t("ldap.field.adminPassword" as any)} help={t("ldap.help.adminPassword" as any)}>
            <input type="password" value={ldap.password} onChange={(e) => set("password", e.target.value)} className={inputClass} />
          </FormField>
          <FormField label={t("ldap.field.passwordType" as any)} help={t("ldap.help.passwordType" as any)}>
            <SimpleSelect value={ldap.passwordType ?? "Plain"} options={PASSWORD_TYPES.map((p) => ({ value: p, label: p }))} onChange={(v) => set("passwordType", v)} />
          </FormField>
        </FormSection>

        <FormSection title={t("ldap.section.sync" as any)}>
          <FormField label={t("ldap.field.defaultGroup" as any)} help={t("ldap.help.defaultGroup" as any)}>
            <SimpleSelect value={ldap.defaultGroup ?? ""} options={[{ value: "", label: "—" }, ...groups.map((g: any) => ({ value: `${g.owner}/${g.name}`, label: g.displayName || g.name }))]} onChange={(v) => set("defaultGroup", v)} />
          </FormField>
          <FormField label={t("ldap.field.autoSync" as any)} help={t("ldap.field.autoSync.help" as any)}>
            <input type="number" value={ldap.autoSync ?? 0} onChange={(e) => set("autoSync", Math.max(0, Number(e.target.value)))} min={0} className={monoInputClass} />
          </FormField>
        </FormSection>

        <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-text-primary">{t("ldap.section.customAttrs" as any)}</h3>
            <button onClick={addCustomAttr}
              className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors">
              <Plus size={12} /> {t("common.add")}
            </button>
          </div>
          {customAttrs.length === 0 ? (
            <div className="px-5 py-6 text-center text-[13px] text-text-muted">{t("common.noData")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-surface-2/30">
                    <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{t("ldap.attr.ldapAttr" as any)}</th>
                    <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{t("ldap.attr.userProp" as any)}</th>
                    <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-16">{t("common.action" as any)}</th>
                  </tr>
                </thead>
                <tbody>
                  {customAttrs.map((attr, idx) => (
                    <tr key={attr.id} className="border-b border-border-subtle">
                      <td className="px-4 py-1.5">
                        <input value={attr.attrName} onChange={(e) => {
                          const next = [...customAttrs]; next[idx] = { ...next[idx], attrName: e.target.value }; syncCustomAttrs(next);
                        }} className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors" />
                      </td>
                      <td className="px-4 py-1.5">
                        <input value={attr.propName} onChange={(e) => {
                          const next = [...customAttrs]; next[idx] = { ...next[idx], propName: e.target.value }; syncCustomAttrs(next);
                        }} className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors" />
                      </td>
                      <td className="px-4 py-1.5">
                        <button onClick={() => syncCustomAttrs(customAttrs.filter((_, i) => i !== idx))}
                          className="rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors">
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
