import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, LogOut} from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as AdapterBackend from "../backend/AdapterBackend";
import type { Adapter } from "../backend/AdapterBackend";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";

const DATABASE_TYPE_OPTIONS = [
  { id: "mysql", name: "MySQL" },
  { id: "postgres", name: "PostgreSQL" },
  { id: "mssql", name: "SQL Server" },
  { id: "oracle", name: "Oracle" },
  { id: "sqlite3", name: "Sqlite 3" },
];

export default function AdapterEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [adapter, setAdapter] = useState<Adapter | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Adapter>({
    queryKey: "adapter",
    owner,
    name,
    fetchFn: AdapterBackend.getAdapter,
  });

  useEffect(() => {
    if (entity) { setAdapter(entity); setOriginalJson(JSON.stringify(entity)); }
  }, [entity]);

  const isDirty = !!adapter && originalJson !== "" && JSON.stringify(adapter) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !adapter) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setAdapter((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleUseSameDbChange = (checked: boolean) => {
    set("useSameDb", checked);
    if (checked) {
      set("type", "");
      set("databaseType", "");
      set("host", "");
      set("port", 0);
      set("user", "");
      set("password", "");
      set("database", "");
    } else {
      set("type", "Database");
      set("databaseType", "mysql");
      set("host", "localhost");
      set("port", 3306);
      set("user", "root");
      set("password", "123456");
      set("database", "dbName");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await AdapterBackend.updateAdapter(owner!, name!, adapter);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess"));
        setSaved(true);
        setOriginalJson(JSON.stringify(adapter));
        setIsAddMode(false);
        invalidateList();
        if (adapter.name !== name) {
          navigate(`/adapters/${adapter.owner}/${adapter.name}`, { replace: true });
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

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await AdapterBackend.deleteAdapter(adapter);
        if (res.status === "ok") {
          invalidateList();
          navigate("/adapters");
        } else {
          modal.toast(res.msg || t("common.deleteFailed"), "error");
        }
      } catch (e) {
        console.error(e);
      }
    });
  };
  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = await AdapterBackend.updateAdapter(owner!, name!, adapter);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess"));
        invalidateList();
        navigate("/adapters");
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
      await AdapterBackend.deleteAdapter(adapter);
      invalidateList();
    }
    navigate("/adapters");
  };

  const handleTestConnection = async () => {
    try {
      const res = await AdapterBackend.getPolicies("", "", `${adapter.owner}/${adapter.name}`);
      if (res.status === "ok") {
        modal.toast(t("adapters.testSuccess"));
      } else {
        modal.toast(res.msg || t("adapters.testFailed"), "error");
      }
    } catch (e) {
      console.error(e);
      modal.toast(t("adapters.testFailed"), "error");
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("adapters.title")}`}
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

      {/* Basic Info */}
      <FormSection title={t("adapters.section.basic")}>
        <FormField label={t("field.owner")}>
          <input value={adapter.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={adapter.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("adapters.field.table")}>
          <input value={adapter.table} onChange={(e) => set("table", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("adapters.field.useSameDb")}>
          <Switch checked={adapter.useSameDb} onChange={handleUseSameDbChange} />
        </FormField>
      </FormSection>

      {/* Database Connection (only when not using same DB) */}
      {!adapter.useSameDb && (
        <FormSection title={t("adapters.section.database")}>
          <FormField label={t("col.type")}>
            <SimpleSelect value={adapter.type} options={[
              { value: "Database", label: "Database" },
            ]} onChange={(v) => set("type", v)} />
          </FormField>
          <FormField label={t("adapters.field.databaseType")}>
            <SimpleSelect value={adapter.databaseType} options={DATABASE_TYPE_OPTIONS.map((o) => ({ value: o.id, label: o.name }))} onChange={(v) => set("databaseType", v)} />
          </FormField>
          <FormField label={t("adapters.field.host")}>
            <input value={adapter.host} onChange={(e) => set("host", e.target.value)} className={inputClass} />
          </FormField>
          <FormField label={t("adapters.field.port")}>
            <input type="number" value={adapter.port} min={0} max={65535} onChange={(e) => set("port", Number(e.target.value))} className={monoInputClass} />
          </FormField>
          <FormField label={t("adapters.field.user")}>
            <input value={adapter.user} onChange={(e) => set("user", e.target.value)} className={inputClass} />
          </FormField>
          <FormField label={t("adapters.field.password")}>
            <input type="password" value={adapter.password} onChange={(e) => set("password", e.target.value)} className={inputClass} />
          </FormField>
          <FormField label={t("adapters.field.database")}>
            <input value={adapter.database} onChange={(e) => set("database", e.target.value)} className={inputClass} />
          </FormField>
        </FormSection>
      )}

      {/* Test Connection */}
      <FormSection title={t("adapters.section.test")}>
        <FormField label={t("adapters.field.testConnection")}>
          <button onClick={handleTestConnection} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors">
            {t("adapters.testConnection")}
          </button>
        </FormField>
      </FormSection>
    </motion.div>
  );
}
