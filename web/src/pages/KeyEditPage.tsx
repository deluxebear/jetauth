import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, Eye, EyeOff, LogOut, Copy } from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as KeyBackend from "../backend/KeyBackend";
import * as OrganizationBackend from "../backend/OrganizationBackend";
import * as ApplicationBackend from "../backend/ApplicationBackend";
import * as UserBackend from "../backend/UserBackend";
import type { Key } from "../backend/KeyBackend";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";
import SingleSearchSelect from "../components/SingleSearchSelect";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";
import { getStoredAccount, isGlobalAdmin } from "../utils/auth";

const TYPE_VALUES = ["Organization", "Application", "User", "General"] as const;
const STATE_VALUES = ["Active", "Inactive"] as const;

const TYPE_LABEL_KEYS: Record<string, string> = {
  Organization: "keys.type.organization",
  Application: "keys.type.application",
  User: "keys.type.user",
  General: "keys.type.general",
};

const STATE_LABEL_KEYS: Record<string, string> = {
  Active: "keys.state.active",
  Inactive: "keys.state.inactive",
};

export default function KeyEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [key, setKey] = useState<Key | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  // Admin org dropdown
  const account = getStoredAccount();
  const isAdmin = isGlobalAdmin(account);
  const [orgOptions, setOrgOptions] = useState<{ value: string; label: string }[]>([]);

  // Application & User dropdowns
  const [appOptions, setAppOptions] = useState<{ value: string; label: string }[]>([]);
  const [userOptions, setUserOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    OrganizationBackend.getOrganizationNames("admin").then((res) => {
      if (res.status === "ok" && res.data) {
        setOrgOptions([
          { value: "admin", label: t("common.adminShared" as any) },
          ...res.data.map((o) => ({ value: o.name, label: o.displayName || o.name })),
        ]);
      }
    });
  }, [isAdmin]);

  // Load apps/users when key.organization changes
  useEffect(() => {
    if (!key?.organization) return;
    ApplicationBackend.getApplicationsByOrganization({ owner: "admin", organization: key.organization })
      .then((res) => {
        if (res.status === "ok" && res.data) {
          setAppOptions(res.data.map((a) => ({ value: a.name, label: (a as any).displayName || a.name })));
        }
      });
    UserBackend.getUsers({ owner: key.organization })
      .then((res) => {
        if (res.status === "ok" && res.data) {
          setUserOptions(res.data.map((u) => ({ value: u.name, label: (u as any).displayName || u.name })));
        }
      });
  }, [key?.organization]);

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Key>({
    queryKey: "key",
    owner,
    name,
    fetchFn: KeyBackend.getKey,
  });

  useEffect(() => {
    if (entity) { setKey(entity); setOriginalJson(JSON.stringify(entity)); }
  }, [entity]);

  const isDirty = !!key && originalJson !== "" && JSON.stringify(key) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !key) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (field: string, val: unknown) => {
    setKey((prev) => prev ? { ...prev, [field]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await KeyBackend.updateKey(owner!, name!, key);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(key));
        setIsAddMode(false);
        invalidateList();
        if (key.name !== name) {
          navigate(`/keys/${key.owner}/${key.name}`, { replace: true });
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
      const res = await KeyBackend.updateKey(owner!, name!, key);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/keys");
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
      await KeyBackend.deleteKey(key!);
      invalidateList();
    }
    navigate("/keys");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      const res = await KeyBackend.deleteKey(key);
      if (res.status === "ok") {
        invalidateList();
        navigate("/keys");
      } else {
        modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("keys.title" as any)}`}
        subtitle={`${owner}/${name}`}
        onBack={handleBack}
      >
        <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
          <Trash2 size={14} /> {t("common.delete")}
        </button>
        <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save")} />
        <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
          {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
          {t("common.saveAndExit" as any)}
        </button>
      </StickyEditHeader>

      {showBanner && <UnsavedBanner isAddMode={isAddMode} />}

      <FormSection title={t("keys.section.basic" as any)}>
        <FormField label={t("field.owner")}>
          {isAdmin ? (
            <SingleSearchSelect
              value={key.owner}
              options={orgOptions}
              onChange={(v) => { set("owner", v); set("organization", v); }}
              placeholder={t("common.search" as any)}
            />
          ) : (
            <input value={key.owner} disabled className={inputClass} />
          )}
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={key.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={key.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("field.type")} tooltip={t("keys.tooltip.type" as any)}>
          <SimpleSelect value={key.type} options={TYPE_VALUES.map((o) => ({ value: o, label: t(TYPE_LABEL_KEYS[o] as any) }))} onChange={(v) => { set("type", v); if (v !== "Application") set("application", ""); if (v !== "User") set("user", ""); }} />
        </FormField>
        {key.type === "Application" && (
          <FormField label={t("col.application" as any)} tooltip={t("keys.tooltip.application" as any)}>
            <SingleSearchSelect
              value={key.application}
              options={appOptions}
              onChange={(v) => set("application", v)}
              placeholder={t("common.search" as any)}
            />
          </FormField>
        )}
        {key.type === "User" && (
          <FormField label={t("field.user")} tooltip={t("keys.tooltip.user" as any)}>
            <SingleSearchSelect
              value={key.user}
              options={userOptions}
              onChange={(v) => set("user", v)}
              placeholder={t("common.search" as any)}
            />
          </FormField>
        )}
      </FormSection>

      <FormSection title={t("keys.section.credentials" as any)}>
        <FormField label={t("keys.field.accessKey" as any)} tooltip={t("keys.tooltip.accessKey" as any)}>
          <div className="relative">
            <input value={key.accessKey} disabled className={`${monoInputClass} pr-10`} />
            <button type="button" onClick={() => { navigator.clipboard.writeText(key.accessKey); modal.toast(t("common.copySuccess" as any)); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-secondary transition-colors" title={t("common.copy" as any)}>
              <Copy size={15} />
            </button>
          </div>
        </FormField>
        <FormField label={t("keys.field.accessSecret" as any)} tooltip={t("keys.tooltip.accessSecret" as any)}>
          <div className="relative">
            <input type={showSecret ? "text" : "password"} value={key.accessSecret} disabled className={`${monoInputClass} pr-16`} />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <button type="button" onClick={() => { navigator.clipboard.writeText(key.accessSecret); modal.toast(t("common.copySuccess" as any)); }} className="rounded p-1 text-text-muted hover:text-text-secondary transition-colors" title={t("common.copy" as any)}>
                <Copy size={15} />
              </button>
              <button type="button" onClick={() => setShowSecret(!showSecret)} className="rounded p-1 text-text-muted hover:text-text-secondary transition-colors">
                {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </FormField>
      </FormSection>

      <FormSection title={t("keys.section.state" as any)}>
        <FormField label={t("keys.field.expireTime" as any)} tooltip={t("keys.tooltip.expireTime" as any)}>
          <input type="datetime-local" value={key.expireTime ? key.expireTime.slice(0, 16) : ""} onChange={(e) => set("expireTime", e.target.value ? new Date(e.target.value).toISOString() : "")} className={inputClass} />
        </FormField>
        <FormField label={t("field.state")} tooltip={t("keys.tooltip.state" as any)}>
          <SimpleSelect value={key.state} options={STATE_VALUES.map((o) => ({ value: o, label: t(STATE_LABEL_KEYS[o] as any) }))} onChange={(v) => set("state", v)} />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
