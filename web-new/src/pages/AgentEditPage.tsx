import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, LogOut } from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as AgentBackend from "../backend/AgentBackend";
import * as OrganizationBackend from "../backend/OrganizationBackend";
import * as ApplicationBackend from "../backend/ApplicationBackend";
import type { Agent } from "../backend/AgentBackend";
import { friendlyError } from "../utils/errorHelper";
import SingleSearchSelect from "../components/SingleSearchSelect";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";
import { getStoredAccount, isGlobalAdmin } from "../utils/auth";

export default function AgentEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const timer = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(timer); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");

  // Admin org dropdown
  const account = getStoredAccount();
  const isAdmin = isGlobalAdmin(account);
  const [orgOptions, setOrgOptions] = useState<{ value: string; label: string }[]>([]);

  // Application dropdown
  const [appOptions, setAppOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    OrganizationBackend.getOrganizationNames("admin").then((res) => {
      if (res.status === "ok" && res.data) {
        setOrgOptions(res.data.map((o) => ({ value: o.name, label: o.displayName || o.name })));
      }
    }).catch(() => {});
  }, [isAdmin]);

  // Load apps when agent.owner changes
  useEffect(() => {
    if (!agent?.owner) return;
    ApplicationBackend.getApplicationsByOrganization({ owner: "admin", organization: agent.owner })
      .then((res) => {
        if (res.status === "ok" && res.data) {
          setAppOptions(res.data.map((a) => ({ value: a.name, label: (a as any).displayName || a.name })));
        }
      }).catch(() => {});
  }, [agent?.owner]);

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Agent>({
    queryKey: "agent",
    owner,
    name,
    fetchFn: AgentBackend.getAgent,
  });

  useEffect(() => {
    if (entity) { setAgent(entity); setOriginalJson(JSON.stringify(entity)); }
  }, [entity]);

  const isDirty = !!agent && originalJson !== "" && JSON.stringify(agent) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !agent) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setAgent((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleOwnerChange = (val: string) => {
    setAgent((prev) => prev ? { ...prev, owner: val, application: "" } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await AgentBackend.updateAgent(owner!, name!, agent);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(agent));
        setIsAddMode(false);
        invalidateList();
        if (agent.name !== name) {
          navigate(`/agents/${agent.owner}/${agent.name}`, { replace: true });
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
      const res = await AgentBackend.updateAgent(owner!, name!, agent);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/agents");
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
      await AgentBackend.deleteAgent(agent);
      invalidateList();
    }
    navigate("/agents");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await AgentBackend.deleteAgent(agent);
        if (res.status === "ok") {
          invalidateList();
          navigate("/agents");
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("agents.title" as any)}`}
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

      {/* Basic Info */}
      <FormSection title={t("agents.section.basic" as any)}>
        <FormField label={t("field.owner")} tooltip={t("agents.tooltip.organization" as any)}>
          {isAdmin ? (
            <SingleSearchSelect
              value={agent.owner}
              options={orgOptions}
              onChange={(v) => handleOwnerChange(v)}
              placeholder={t("common.search" as any)}
            />
          ) : (
            <input value={agent.owner} disabled className={inputClass} />
          )}
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={agent.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={agent.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Configuration */}
      <FormSection title={t("agents.section.config" as any)}>
        <FormField label={t("agents.field.listeningUrl" as any)} tooltip={t("agents.tooltip.listeningUrl" as any)}>
          <input value={agent.url} onChange={(e) => set("url", e.target.value)} className={monoInputClass} placeholder="https://..." />
        </FormField>
        <FormField label={t("agents.field.accessToken" as any)} tooltip={t("agents.tooltip.accessToken" as any)}>
          <input type="password" value={agent.token} onChange={(e) => set("token", e.target.value)} className={monoInputClass} placeholder="***" />
        </FormField>
        <FormField label={t("col.application" as any)} tooltip={t("agents.tooltip.application" as any)}>
          <SingleSearchSelect
            value={agent.application}
            options={appOptions}
            onChange={(v) => set("application", v)}
            placeholder={t("common.search" as any)}
          />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
