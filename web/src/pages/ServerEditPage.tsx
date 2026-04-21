import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, RefreshCw, X, LogOut, Copy, Check } from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as ServerBackend from "../backend/ServerBackend";
import * as OrganizationBackend from "../backend/OrganizationBackend";
import * as ApplicationBackend from "../backend/ApplicationBackend";
import type { Server, Tool } from "../backend/ServerBackend";
import { friendlyError } from "../utils/errorHelper";
import SingleSearchSelect from "../components/SingleSearchSelect";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";
import { getStoredAccount, isGlobalAdmin } from "../utils/auth";

export default function ServerEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [server, setServer] = useState<Server | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const timer = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(timer); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (copied) { const timer = setTimeout(() => setCopied(false), 1500); return () => clearTimeout(timer); } }, [copied]);

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

  // Load apps when server.owner changes
  useEffect(() => {
    if (!server?.owner) return;
    ApplicationBackend.getApplicationsByOrganization({ owner: "admin", organization: server.owner })
      .then((res) => {
        if (res.status === "ok" && res.data) {
          setAppOptions(res.data.map((a) => ({ value: a.name, label: (a as any).displayName || a.name })));
        }
      }).catch(() => {});
  }, [server?.owner]);

  const { entity, loading, invalidate, invalidateList } = useEntityEdit<Server>({
    queryKey: "server",
    owner,
    name,
    fetchFn: ServerBackend.getServer,
  });

  useEffect(() => {
    if (entity) { setServer(entity); setOriginalJson(JSON.stringify(entity)); }
  }, [entity]);

  const isDirty = !!server && originalJson !== "" && JSON.stringify(server) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !server) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setServer((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleOwnerChange = (val: string) => {
    setServer((prev) => prev ? { ...prev, owner: val, application: "" } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await ServerBackend.updateServer(owner!, name!, server);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(server));
        setIsAddMode(false);
        invalidateList();
        if (server.name !== name) {
          navigate(`/servers/${server.owner}/${server.name}`, { replace: true });
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
      const res = await ServerBackend.updateServer(owner!, name!, server);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/servers");
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
      await ServerBackend.deleteServer(server);
      invalidateList();
    }
    navigate("/servers");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await ServerBackend.deleteServer(server);
        if (res.status === "ok") {
          invalidateList();
          navigate("/servers");
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  const handleSyncTools = async () => {
    setSyncing(true);
    try {
      const res = await ServerBackend.syncMcpTool(owner!, name!, server);
      if (res.status === "ok") {
        modal.toast(t("servers.syncSuccess" as any));
        invalidate();
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearTools = async () => {
    try {
      const res = await ServerBackend.syncMcpTool(owner!, name!, server, true);
      if (res.status === "ok") {
        modal.toast(t("servers.clearSuccess" as any));
        invalidate();
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleTool = (index: number, allowed: boolean) => {
    const tools = [...(server.tools || [])];
    tools[index] = { ...tools[index], isAllowed: allowed };
    set("tools", tools);
  };

  const baseUrl = `${window.location.origin}/api/server/${server.owner}/${server.name}`;

  const handleCopyBaseUrl = () => {
    navigator.clipboard.writeText(baseUrl);
    setCopied(true);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("servers.title" as any)}`}
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
      <FormSection title={t("servers.section.basic" as any)}>
        <FormField label={t("field.owner")} tooltip={t("servers.tooltip.organization" as any)}>
          {isAdmin ? (
            <SingleSearchSelect
              value={server.owner}
              options={orgOptions}
              onChange={(v) => handleOwnerChange(v)}
              placeholder={t("common.search" as any)}
            />
          ) : (
            <input value={server.owner} disabled className={inputClass} />
          )}
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={server.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={server.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Connection */}
      <FormSection title={t("servers.section.connection" as any)}>
        <FormField label={t("col.url" as any)} tooltip={t("servers.tooltip.url" as any)}>
          <input value={server.url} onChange={(e) => set("url", e.target.value)} className={monoInputClass} placeholder="https://..." />
        </FormField>
        <FormField label={t("servers.field.accessToken" as any)} tooltip={t("servers.tooltip.accessToken" as any)}>
          <input type="password" value={server.token} onChange={(e) => set("token", e.target.value)} className={monoInputClass} placeholder="***" />
        </FormField>
        <FormField label={t("col.application" as any)} tooltip={t("servers.tooltip.application" as any)}>
          <SingleSearchSelect
            value={server.application}
            options={appOptions}
            onChange={(v) => set("application", v)}
            placeholder={t("common.search" as any)}
          />
        </FormField>
      </FormSection>

      {/* Tools */}
      <FormSection
        title={t("servers.section.tools" as any)}
        action={
          !isAddMode ? (
            <div className="flex items-center gap-2">
              <button onClick={handleSyncTools} disabled={syncing} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
                {syncing ? <div className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <RefreshCw size={13} />}
                {t("servers.syncTools" as any)}
              </button>
              <button onClick={handleClearTools} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                <X size={13} /> {t("servers.clearTools" as any)}
              </button>
            </div>
          ) : undefined
        }
      >
        {(server.tools || []).length === 0 ? (
          <p className="col-span-full text-[13px] text-text-muted">{t("common.noData")}</p>
        ) : (
          <div className="col-span-full overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-1">
                  <th className="px-3 py-2 text-left font-medium text-text-secondary w-[260px]">{t("col.name" as any)}</th>
                  <th className="px-3 py-2 text-left font-medium text-text-secondary">{t("col.description" as any)}</th>
                  <th className="px-3 py-2 text-center font-medium text-text-secondary w-[100px]">{t("servers.field.isAllowed" as any)}</th>
                </tr>
              </thead>
              <tbody>
                {(server.tools || []).map((tool: Tool, i: number) => (
                  <tr key={tool.name || i} className="border-b border-border last:border-b-0 hover:bg-surface-1/50 transition-colors">
                    <td className="px-3 py-2 font-mono font-medium">{tool.name}</td>
                    <td className="px-3 py-2 text-text-muted">{tool.description || "\u2014"}</td>
                    <td className="px-3 py-2 text-center">
                      <Switch checked={tool.isAllowed} onChange={(checked) => handleToggleTool(i, checked)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FormSection>

      {/* Base URL */}
      <FormSection title={t("servers.section.baseUrl" as any)}>
        <FormField label={t("servers.field.baseUrl" as any)} tooltip={t("servers.tooltip.baseUrl" as any)} span="full">
          <div className="flex gap-2">
            <input value={baseUrl} readOnly className={`${monoInputClass} flex-1`} />
            <button
              onClick={handleCopyBaseUrl}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors shrink-0"
              title={t("common.copy" as any)}
            >
              {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            </button>
          </div>
        </FormField>
      </FormSection>
    </motion.div>
  );
}
