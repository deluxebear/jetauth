import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, LogOut, ArrowLeft, Trash2, Send, X } from "lucide-react";
import { FormField, FormSection, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as TicketBackend from "../backend/TicketBackend";
import type { Ticket, TicketMessage } from "../backend/TicketBackend";
import { friendlyError } from "../utils/errorHelper";

const selectClass = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all";
const STATES = ["Open", "In Progress", "Resolved", "Closed"];

export default function TicketEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const modal = useModal();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [saving, setSaving] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  // Detect if this is a new ticket being created (navigated from Add button)
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");

  const { entity, loading, invalidate, invalidateList } = useEntityEdit<Ticket>({
    queryKey: "ticket",
    owner: owner,
    name: name,
    fetchFn: TicketBackend.getTicket,
  });

  useEffect(() => {
    if (entity) {
      setTicket({ ...entity, messages: entity.messages ?? [] });
    }
  }, [entity]);

  if (loading || !ticket) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setTicket((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  // Save only (stay on page) — matches original "Save" button
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await TicketBackend.updateTicket(owner!, name!, ticket);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setIsAddMode(false);
        invalidateList();
        invalidate();
        if (ticket.name !== name) {
          navigate(`/tickets/${ticket.owner}/${ticket.name}`, { replace: true });
        }
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };

  // Save & Exit — matches original "Save & Exit" button
  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = await TicketBackend.updateTicket(owner!, name!, ticket);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/tickets");
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };

  // Cancel (add mode) — delete the newly created ticket and go back
  const handleCancel = async () => {
    const res = await TicketBackend.deleteTicket(ticket);
    if (res.status === "ok") {
      invalidateList();
      navigate("/tickets");
    } else {
      modal.toast(res.msg || t("common.deleteFailed" as any), "error");
    }
  };

  // Delete (edit mode) — confirm then delete
  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      const res = await TicketBackend.deleteTicket(ticket);
      if (res.status === "ok") navigate("/tickets");
      else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
    });
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) {
      modal.toast(t("tickets.field.enterMessage" as any), "error");
      return;
    }
    setSending(true);
    try {
      const message: TicketMessage = {
        author: "admin",
        text: messageText,
        timestamp: new Date().toISOString(),
        isAdmin: true,
      };
      const res = await TicketBackend.addTicketMessage(owner!, name!, message);
      if (res.status === "ok") {
        modal.toast(t("common.sendSuccess" as any));
        setMessageText("");
        invalidate();
      } else {
        modal.toast(res.msg || t("common.sendFailed" as any), "error");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => isAddMode ? handleCancel() : navigate("/tickets")} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {isAddMode ? t("tickets.newTicket" as any) : `${t("common.edit")} ${t("tickets.title" as any)}`}
            </h1>
            <p className="text-[13px] text-text-muted font-mono mt-0.5">{owner}/{name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAddMode ? (
            // Add mode: Cancel + Save + Save & Exit
            <>
              <button onClick={handleCancel} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                <X size={14} /> {t("common.cancel")}
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg border border-accent px-3 py-2 text-[13px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-50 transition-colors">
                {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /> : <Save size={14} />}
                {t("common.save")}
              </button>
              <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
                {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
                {t("common.saveAndExit" as any)}
              </button>
            </>
          ) : (
            // Edit mode: Delete + Save + Save & Exit
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Basic Info */}
      <FormSection title={t("tickets.section.basic" as any)}>
        <FormField label={t("col.organization" as any)}>
          <input value={ticket.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={ticket.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("col.displayName" as any)}>
          <input value={ticket.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("col.created" as any)}>
          <input value={ticket.createdTime} disabled className={monoInputClass} />
        </FormField>
        <FormField label={t("col.updated" as any)}>
          <input value={ticket.updatedTime} disabled className={monoInputClass} />
        </FormField>
        <FormField label={t("tickets.field.title" as any)}>
          <input value={ticket.title} onChange={(e) => set("title", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("tickets.field.content" as any)} span="full">
          <textarea value={ticket.content} onChange={(e) => set("content", e.target.value)} rows={4} className={inputClass} />
        </FormField>
        <FormField label={t("col.user" as any)}>
          <input value={ticket.user} disabled className={inputClass} />
        </FormField>
        <FormField label={t("tickets.field.state" as any)}>
          <select value={ticket.state} onChange={(e) => set("state", e.target.value)} className={selectClass}>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>
      </FormSection>

      {/* Messages */}
      <FormSection title={t("tickets.section.messages" as any)}>
        <div className="col-span-2 space-y-3">
          {(ticket.messages ?? []).length === 0 && (
            <p className="text-[13px] text-text-muted">{t("common.noData")}</p>
          )}
          {(ticket.messages ?? []).map((msg, idx) => (
            <div key={idx} className="flex gap-3 p-3 rounded-lg bg-surface-2/50">
              <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white ${msg.isAdmin ? "bg-accent" : "bg-green-500"}`}>
                {(msg.author || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{msg.author}</span>
                  {msg.isAdmin && <span className="inline-flex items-center rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">{t("tickets.field.admin" as any)}</span>}
                  <span className="text-[11px] text-text-muted">{msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ""}</span>
                </div>
                <p className="text-[13px] text-text-secondary mt-1 whitespace-pre-wrap break-words">{msg.text}</p>
              </div>
            </div>
          ))}

          {/* Message input */}
          <div className="border-t border-border-subtle pt-3 mt-3">
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={t("tickets.field.typeMessage" as any)}
              rows={3}
              className={inputClass}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSendMessage();
              }}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-text-muted">{t("tickets.field.ctrlEnterToSend" as any)}</span>
              <button
                onClick={handleSendMessage}
                disabled={sending}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {sending ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Send size={14} />}
                {t("common.send" as any)}
              </button>
            </div>
          </div>
        </div>
      </FormSection>
    </motion.div>
  );
}
