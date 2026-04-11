import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, LogOut} from "lucide-react";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as SyncerBackend from "../backend/SyncerBackend";
import type { Syncer } from "../backend/SyncerBackend";
import { friendlyError } from "../utils/errorHelper";

const SYNCER_TYPES = ["Database", "Keycloak", "WeCom", "Azure AD", "Active Directory", "Google Workspace", "DingTalk", "Lark", "Okta", "SCIM", "AWS IAM"];
const DB_TYPES = [
  { id: "mysql", name: "MySQL" },
  { id: "postgres", name: "PostgreSQL" },
  { id: "mssql", name: "SQL Server" },
  { id: "oracle", name: "Oracle" },
  { id: "sqlite3", name: "Sqlite 3" },
];
const SSL_MODES = ["disable", "require", "verify-ca", "verify-full"];
const NON_DB_TYPES = ["WeCom", "Azure AD", "Active Directory", "Google Workspace", "DingTalk", "Lark", "Okta", "SCIM", "AWS IAM"];
const NO_PORT_TYPES = ["WeCom", "Azure AD", "Google Workspace", "DingTalk", "Lark", "Okta", "SCIM", "AWS IAM"];
const NO_HOST_TYPES = ["WeCom", "DingTalk", "Lark"];
const NO_USER_TYPES = ["Google Workspace"];
const NO_DB_TYPES = ["WeCom", "Azure AD", "Google Workspace", "DingTalk", "Lark", "Okta", "SCIM", "AWS IAM"];
const NO_TABLE_TYPES = ["WeCom", "Azure AD", "Google Workspace", "DingTalk", "Lark", "Okta", "SCIM", "AWS IAM"];

const selectClass = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all";

export default function SyncerEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [syncer, setSyncer] = useState<Syncer | null>(null);
  const [saving, setSaving] = useState(false);
  const [testDbLoading, setTestDbLoading] = useState(false);

  const { entity, loading, invalidate, invalidateList } = useEntityEdit<Syncer>({
    queryKey: "syncer",
    owner: owner,
    name: name,
    fetchFn: SyncerBackend.getSyncer,
  });

  useEffect(() => {
    if (entity) setSyncer(entity);
  }, [entity]);

  if (loading || !syncer) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setSyncer((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await SyncerBackend.updateSyncer(owner!, name!, syncer);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setIsAddMode(false);
        invalidateList();
        if (syncer.name !== name) {
          navigate(`/syncers/${syncer.name}`, { replace: true });
        }
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } finally {
      setSaving(false);
    }
  };
  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = await SyncerBackend.updateSyncer(owner!, name!, syncer);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/syncers");
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
      await SyncerBackend.deleteSyncer(syncer);
      invalidateList();
    }
    navigate("/syncers");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      const res = await SyncerBackend.deleteSyncer(syncer);
      if (res.status === "ok") { invalidateList(); navigate("/syncers"); }
      else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
    });
  };

  const handleTestDb = async () => {
    setTestDbLoading(true);
    try {
      const res = await SyncerBackend.testSyncerDb(syncer);
      if (res.status === "ok") {
        modal.toast(t("syncers.field.testSuccess" as any));
      } else {
        modal.toast(res.msg || t("syncers.field.testFailed" as any), "error");
      }
    } finally {
      setTestDbLoading(false);
    }
  };

  const isNonDb = NON_DB_TYPES.includes(syncer.type);
  const showPort = !NO_PORT_TYPES.includes(syncer.type);
  const showHost = !NO_HOST_TYPES.includes(syncer.type);
  const showUser = !NO_USER_TYPES.includes(syncer.type);
  const showDatabase = !NO_DB_TYPES.includes(syncer.type);
  const showTable = !NO_TABLE_TYPES.includes(syncer.type);
  const showSslMode = syncer.databaseType === "postgres" && !isNonDb;
  const needSshFields = syncer.type === "Database" && ["mysql", "mssql", "postgres"].includes(syncer.databaseType);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("syncers.title" as any)}</h1>
            <p className="text-[13px] text-text-muted font-mono mt-0.5">{owner}/{name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors"><Trash2 size={14} /> {t("common.delete")}</button>
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

      {/* Basic */}
      <FormSection title={t("syncers.section.basic" as any)}>
        <FormField label={t("col.organization" as any)}>
          <input value={syncer.organization} onChange={(e) => set("organization", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={syncer.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("col.type" as any)}>
          <select value={syncer.type} onChange={(e) => set("type", e.target.value)} className={selectClass}>
            {SYNCER_TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
          </select>
        </FormField>
        {!isNonDb && (
          <FormField label={t("syncers.field.databaseType" as any)}>
            <select value={syncer.databaseType} onChange={(e) => { set("databaseType", e.target.value); if (e.target.value === "postgres") set("sslMode", "disable"); else set("sslMode", ""); }} className={selectClass}>
              {DB_TYPES.map((db) => <option key={db.id} value={db.id}>{db.name}</option>)}
            </select>
          </FormField>
        )}
        {showSslMode && (
          <FormField label={t("syncers.field.sslMode" as any)}>
            <select value={syncer.sslMode} onChange={(e) => set("sslMode", e.target.value)} className={selectClass}>
              {SSL_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </FormField>
        )}
      </FormSection>

      {/* Connection */}
      <FormSection title={t("syncers.section.connection" as any)}>
        {showHost && (
          <FormField label={t("syncers.field.host" as any)}>
            <input value={syncer.host} onChange={(e) => set("host", e.target.value)} className={inputClass} />
          </FormField>
        )}
        {showPort && (
          <FormField label={t("syncers.field.port" as any)}>
            <input type="number" value={syncer.port} onChange={(e) => set("port", parseInt(e.target.value) || 0)} className={monoInputClass} />
          </FormField>
        )}
        {showUser && (
          <FormField label={t("col.user" as any)}>
            <input value={syncer.user} onChange={(e) => set("user", e.target.value)} className={inputClass} />
          </FormField>
        )}
        <FormField label={t("syncers.field.password" as any)}>
          <input type="password" value={syncer.password} onChange={(e) => set("password", e.target.value)} className={inputClass} />
        </FormField>
        {showDatabase && (
          <FormField label={t("syncers.field.database" as any)}>
            <input value={syncer.database} onChange={(e) => set("database", e.target.value)} className={inputClass} />
          </FormField>
        )}
        {showTable && (
          <FormField label={t("syncers.field.table" as any)}>
            <input value={syncer.table} onChange={(e) => set("table", e.target.value)} className={inputClass} />
          </FormField>
        )}
        <FormField label={t("syncers.field.testConnection" as any)} span="full">
          <button onClick={handleTestDb} disabled={testDbLoading} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {testDbLoading ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : null}
            {t("syncers.field.testConnection" as any)}
          </button>
        </FormField>
      </FormSection>

      {/* SSH */}
      {needSshFields && (
        <FormSection title={t("syncers.section.ssh" as any)}>
          <FormField label={t("syncers.field.sshType" as any)}>
            <select value={syncer.sshType} onChange={(e) => set("sshType", e.target.value)} className={selectClass}>
              <option value="">{t("common.none" as any)}</option>
              <option value="password">{t("syncers.field.password" as any)}</option>
              <option value="cert">{t("syncers.field.cert" as any)}</option>
            </select>
          </FormField>
          {syncer.sshType && (
            <>
              <FormField label={t("syncers.field.sshHost" as any)}>
                <input value={syncer.sshHost} onChange={(e) => set("sshHost", e.target.value)} className={inputClass} />
              </FormField>
              <FormField label={t("syncers.field.sshPort" as any)}>
                <input type="number" value={syncer.sshPort} onChange={(e) => set("sshPort", parseInt(e.target.value) || 0)} className={monoInputClass} />
              </FormField>
              <FormField label={t("syncers.field.sshUser" as any)}>
                <input value={syncer.sshUser} onChange={(e) => set("sshUser", e.target.value)} className={inputClass} />
              </FormField>
              {syncer.sshType === "password" ? (
                <FormField label={t("syncers.field.sshPassword" as any)}>
                  <input type="password" value={syncer.sshPassword} onChange={(e) => set("sshPassword", e.target.value)} className={inputClass} />
                </FormField>
              ) : (
                <FormField label={t("syncers.field.cert" as any)}>
                  <input value={syncer.cert} onChange={(e) => set("cert", e.target.value)} className={inputClass} />
                </FormField>
              )}
            </>
          )}
        </FormSection>
      )}

      {/* Table Columns (JSON editor - simplified) */}
      <FormSection title={t("syncers.section.tableColumns" as any)}>
        <FormField label={t("syncers.field.tableColumns" as any)} span="full">
          <textarea
            value={JSON.stringify(syncer.tableColumns ?? [], null, 2)}
            onChange={(e) => {
              try { set("tableColumns", JSON.parse(e.target.value)); } catch { /* ignore invalid JSON */ }
            }}
            rows={10}
            className={`${monoInputClass} text-[11px]`}
          />
        </FormField>
      </FormSection>

      {/* Sync Settings */}
      <FormSection title={t("syncers.section.syncSettings" as any)}>
        <FormField label={t("syncers.field.affiliationTable" as any)}>
          <input value={syncer.affiliationTable} onChange={(e) => set("affiliationTable", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("syncers.field.avatarBaseUrl" as any)}>
          <input value={syncer.avatarBaseUrl} onChange={(e) => set("avatarBaseUrl", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("syncers.field.syncInterval" as any)}>
          <input type="number" value={syncer.syncInterval} onChange={(e) => set("syncInterval", parseInt(e.target.value) || 0)} className={monoInputClass} />
        </FormField>
        <FormField label={t("syncers.field.errorText" as any)} span="full">
          <textarea value={syncer.errorText} readOnly rows={6} className={`${monoInputClass} text-[11px]`} />
        </FormField>
        <FormField label={t("syncers.field.isReadOnly" as any)}>
          <Switch checked={syncer.isReadOnly} onChange={(v) => set("isReadOnly", v)} />
        </FormField>
        <FormField label={t("col.isEnabled" as any)}>
          <Switch checked={syncer.isEnabled} onChange={(v) => set("isEnabled", v)} />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
