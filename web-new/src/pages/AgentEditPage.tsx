import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, LogOut} from "lucide-react";
import { FormField, FormSection, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as AgentBackend from "../backend/AgentBackend";
import type { Agent } from "../backend/AgentBackend";
import { friendlyError } from "../utils/errorHelper";
import SaveButton from "../components/SaveButton";

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
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Agent>({
    queryKey: "agent",
    owner,
    name,
    fetchFn: AgentBackend.getAgent,
  });

  useEffect(() => {
    if (entity) setAgent(entity);
  }, [entity]);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await AgentBackend.updateAgent(owner!, name!, agent);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
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
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("agents.title" as any)}</h1>
            <p className="text-[13px] text-text-muted font-mono mt-0.5">{owner}/{name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
            <Trash2 size={14} /> {t("common.delete")}
          </button>
                    <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save")} />
          <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
            {t("common.saveAndExit" as any)}
          </button>
        </div>
      </div>

      {/* Basic Info */}
      <FormSection title={t("agents.section.basic" as any)}>
        <FormField label={t("field.owner")}>
          <input value={agent.owner} disabled className={inputClass} />
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
        <FormField label={t("agents.field.listeningUrl" as any)}>
          <input value={agent.url} onChange={(e) => set("url", e.target.value)} className={monoInputClass} placeholder="https://..." />
        </FormField>
        <FormField label={t("agents.field.accessToken" as any)}>
          <input type="password" value={agent.token} onChange={(e) => set("token", e.target.value)} className={monoInputClass} placeholder="***" />
        </FormField>
        <FormField label={t("col.application" as any)}>
          <input value={agent.application} onChange={(e) => set("application", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
