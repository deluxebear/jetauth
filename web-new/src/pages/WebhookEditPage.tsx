import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, Plus, X, LogOut} from "lucide-react";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as WebhookBackend from "../backend/WebhookBackend";
import type { Webhook, Header } from "../backend/WebhookBackend";
import { friendlyError } from "../utils/errorHelper";

const METHODS = ["POST", "GET", "PUT", "DELETE"];
const CONTENT_TYPES = ["application/json", "application/x-www-form-urlencoded"];
const EVENT_OPTIONS = [
  "signup", "login", "logout", "update-user", "delete-user",
  "add-application", "update-application", "delete-application",
  "add-organization", "update-organization", "delete-organization",
  "add-provider", "update-provider", "delete-provider",
];
const OBJECT_FIELD_OPTIONS = ["All", "owner", "name", "createdTime", "updatedTime", "deletedTime", "id", "displayName"];

const selectClass = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all";

export default function WebhookEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [webhook, setWebhook] = useState<Webhook | null>(null);
  const [saving, setSaving] = useState(false);

  const { entity, loading, invalidate, invalidateList } = useEntityEdit<Webhook>({
    queryKey: "webhook",
    owner: owner,
    name: name,
    fetchFn: WebhookBackend.getWebhook,
  });

  useEffect(() => {
    if (entity) setWebhook(entity);
  }, [entity]);

  if (loading || !webhook) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setWebhook((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await WebhookBackend.updateWebhook(owner!, name!, webhook);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setIsAddMode(false);
        invalidateList();
        if (webhook.name !== name) {
          navigate(`/webhooks/${webhook.name}`, { replace: true });
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
      const res = await WebhookBackend.updateWebhook(owner!, name!, webhook);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/webhooks");
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
      await WebhookBackend.deleteWebhook(webhook);
      invalidateList();
    }
    navigate("/webhooks");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      const res = await WebhookBackend.deleteWebhook(webhook);
      if (res.status === "ok") { invalidateList(); navigate("/webhooks"); }
      else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
    });
  };

  const addHeader = () => {
    set("headers", [...(webhook.headers ?? []), { name: "", value: "" }]);
  };

  const updateHeader = (index: number, field: keyof Header, value: string) => {
    const headers = [...(webhook.headers ?? [])];
    headers[index] = { ...headers[index], [field]: value };
    set("headers", headers);
  };

  const removeHeader = (index: number) => {
    const headers = [...(webhook.headers ?? [])];
    headers.splice(index, 1);
    set("headers", headers);
  };

  const toggleEvent = (event: string) => {
    const events = webhook.events ?? [];
    if (events.includes(event)) {
      set("events", events.filter((e) => e !== event));
    } else {
      set("events", [...events, event]);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("webhooks.title" as any)}</h1>
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
      <FormSection title={t("webhooks.section.basic" as any)}>
        <FormField label={t("col.organization" as any)}>
          <input value={webhook.organization} onChange={(e) => set("organization", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={webhook.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("webhooks.field.url" as any)} span="full">
          <input value={webhook.url} onChange={(e) => set("url", e.target.value)} className={inputClass} placeholder="https://example.com/callback" />
        </FormField>
        <FormField label={t("webhooks.field.method" as any)}>
          <select value={webhook.method} onChange={(e) => set("method", e.target.value)} className={selectClass}>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </FormField>
        <FormField label={t("webhooks.field.contentType" as any)}>
          <select value={webhook.contentType} onChange={(e) => set("contentType", e.target.value)} className={selectClass}>
            {CONTENT_TYPES.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
          </select>
        </FormField>
      </FormSection>

      {/* Headers */}
      <FormSection title={t("webhooks.field.headers" as any)}>
        <div className="col-span-2 space-y-2">
          {(webhook.headers ?? []).map((header, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input value={header.name} onChange={(e) => updateHeader(idx, "name", e.target.value)} placeholder={t("field.name")} className={`${inputClass} flex-1`} />
              <input value={header.value} onChange={(e) => updateHeader(idx, "value", e.target.value)} placeholder={t("webhooks.field.headerValue" as any)} className={`${inputClass} flex-1`} />
              <button onClick={() => removeHeader(idx)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"><X size={14} /></button>
            </div>
          ))}
          <button onClick={addHeader} className="flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"><Plus size={14} /> {t("webhooks.field.addHeader" as any)}</button>
        </div>
      </FormSection>

      {/* Events */}
      <FormSection title={t("webhooks.field.events" as any)}>
        <div className="col-span-2">
          <div className="flex flex-wrap gap-2">
            {EVENT_OPTIONS.map((event) => {
              const selected = (webhook.events ?? []).includes(event);
              return (
                <button
                  key={event}
                  onClick={() => toggleEvent(event)}
                  className={`rounded-full px-3 py-1 text-[12px] font-medium border transition-colors ${selected ? "bg-accent/10 border-accent text-accent" : "border-border text-text-muted hover:bg-surface-2"}`}
                >
                  {event}
                </button>
              );
            })}
          </div>
        </div>
      </FormSection>

      {/* Object Fields */}
      <FormSection title={t("webhooks.field.objectFields" as any)}>
        <FormField label={t("webhooks.field.objectFields" as any)} span="full">
          <div className="flex flex-wrap gap-2">
            {OBJECT_FIELD_OPTIONS.map((field) => {
              const selected = (webhook.objectFields ?? []).includes(field);
              return (
                <button
                  key={field}
                  onClick={() => {
                    const fields = webhook.objectFields ?? [];
                    if (field === "All") {
                      set("objectFields", fields.includes("All") ? [] : ["All"]);
                    } else {
                      if (selected) set("objectFields", fields.filter(f => f !== field));
                      else set("objectFields", [...fields.filter(f => f !== "All"), field]);
                    }
                  }}
                  className={`rounded-full px-3 py-1 text-[12px] font-medium border transition-colors ${selected ? "bg-accent/10 border-accent text-accent" : "border-border text-text-muted hover:bg-surface-2"}`}
                >
                  {field}
                </button>
              );
            })}
          </div>
        </FormField>
      </FormSection>

      {/* Extended User */}
      <FormSection title={t("webhooks.section.advanced" as any)}>
        <FormField label={t("webhooks.field.isUserExtended" as any)}>
          <Switch checked={webhook.isUserExtended} onChange={(v) => set("isUserExtended", v)} />
        </FormField>
        <FormField label={t("webhooks.field.extendedUserFields" as any)} span="full">
          <input
            value={(webhook.tokenFields ?? []).join(", ")}
            onChange={(e) => set("tokenFields", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
            className={inputClass}
            placeholder="Owner, Name, CreatedTime, ..."
          />
        </FormField>
        <FormField label={t("webhooks.field.singleOrgOnly" as any)}>
          <Switch checked={webhook.singleOrgOnly} onChange={(v) => set("singleOrgOnly", v)} />
        </FormField>
        <FormField label={t("col.isEnabled" as any)}>
          <Switch checked={webhook.isEnabled} onChange={(v) => set("isEnabled", v)} />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
