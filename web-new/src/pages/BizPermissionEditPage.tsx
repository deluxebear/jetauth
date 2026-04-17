import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Info, LogOut, Trash2, X } from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as BizBackend from "../backend/BizBackend";
import type { BizPermission } from "../backend/BizBackend";
import BizPermissionGranteeTable from "../components/BizPermissionGranteeTable";
import { friendlyError } from "../utils/errorHelper";

// The route is /authorization/:owner/:appName/permissions/:name.
// The new backend reads/updates permissions by numeric id, so on load we list permissions
// for the app and locate the row by name to obtain its id.
export default function BizPermissionEditPage() {
  const { owner, appName, name } = useParams<{ owner: string; appName: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !name || name === "new";
  const [isAddMode, setIsAddMode] = useState(isNew || (location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();

  const [perm, setPerm] = useState<BizPermission | null>(null);
  const [originalJson, setOriginalJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customAction, setCustomAction] = useState("");

  useEffect(() => { if (saved) { const timer = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(timer); } }, [saved]);

  useEffect(() => {
    if (!owner || !appName) return;
    setLoading(true);
    if (isNew) {
      const p = BizBackend.newBizPermission(owner, appName);
      setPerm(p);
      setOriginalJson(JSON.stringify(p));
      setLoading(false);
      return;
    }
    BizBackend.getBizPermissions(owner, appName).then((res) => {
      const list = (res.status === "ok" && res.data) ? res.data : [];
      const found = list.find((p) => p.name === name);
      if (found) {
        setPerm(found);
        setOriginalJson(JSON.stringify(found));
      } else {
        modal.toast((t("bizPerm.notFound") || "Permission not found: {name}").replace("{name}", name || ""), "error");
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [owner, appName, name, isNew]);

  const isDirty = !!perm && originalJson !== "" && JSON.stringify(perm) !== originalJson;
  const showBanner = !isAddMode && isDirty;

  if (loading || !perm) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setPerm((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const backPath = `/authorization/${owner}/${appName}`;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = isAddMode && isNew
        ? await BizBackend.addBizPermission(perm)
        : await BizBackend.updateBizPermission(perm.id!, perm);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess") || "Saved");
        setSaved(true);
        setOriginalJson(JSON.stringify(perm));
        setIsAddMode(false);
        if (isNew) navigate(`${backPath}/permissions/${perm.name}`, { replace: true });
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed") || "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = isAddMode && isNew
        ? await BizBackend.addBizPermission(perm)
        : await BizBackend.updateBizPermission(perm.id!, perm);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess") || "Saved");
        navigate(backPath);
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed") || "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => navigate(backPath);

  const handleDelete = () => {
    if (!perm.id) return;
    modal.showConfirm(t("common.confirmDelete") || "Confirm delete?", async () => {
      const res = await BizBackend.deleteBizPermission(perm.id!);
      if (res.status === "ok") navigate(backPath);
      else modal.toast(friendlyError(res.msg, t) || res.msg, "error");
    });
  };

  const addAction = (act: string) => {
    if (!perm.actions.includes(act)) set("actions", [...perm.actions, act]);
  };
  const removeAction = (act: string) => {
    set("actions", perm.actions.filter((a) => a !== act));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <StickyEditHeader
        title={`${isAddMode ? (t("common.add") || "Add") : (t("common.edit") || "Edit")} ${t("bizPerm.editTitle") || "Permission"}`}
        subtitle={`${appName} / ${isNew ? (t("common.add") || "new") : name}`}
        onBack={handleBack}
      >
        {!isNew && (
          <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
            <Trash2 size={14} /> {t("common.delete") || "Delete"}
          </button>
        )}
        <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save") || "Save"} />
        <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
          {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
          {t("common.saveAndExit") || "Save & exit"}
        </button>
      </StickyEditHeader>

      {showBanner && <UnsavedBanner isAddMode={isAddMode} />}

      {/* ── Basic info ── */}
      <FormSection title={t("bizPerm.section.basic") || "Basic info"}>
        <FormField label={t("field.name") || "Name"}>
          <input
            className={monoInputClass}
            value={perm.name}
            onChange={(e) => set("name", e.target.value)}
            disabled={!isAddMode}
          />
        </FormField>
        <FormField label={t("field.displayName") || "Display name"}>
          <input className={inputClass} value={perm.displayName} onChange={(e) => set("displayName", e.target.value)} />
        </FormField>
        <FormField label={t("field.description") || "Description"} span="full">
          <textarea className={`${inputClass} min-h-[72px] resize-y`} value={perm.description} onChange={(e) => set("description", e.target.value)} />
        </FormField>
        <FormField label={t("bizPerm.effect") || "Effect"}>
          <div className="flex rounded-lg bg-surface-2 p-0.5 gap-0.5">
            <button
              onClick={() => set("effect", "Allow")}
              className={`flex-1 py-2 px-4 rounded-md text-[13px] font-semibold transition-all ${perm.effect === "Allow" ? "bg-success text-white shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
            >
              {t("bizPerm.effectAllow") || "Allow"}
            </button>
            <button
              onClick={() => set("effect", "Deny")}
              className={`flex-1 py-2 px-4 rounded-md text-[13px] font-semibold transition-all ${perm.effect === "Deny" ? "bg-danger text-white shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
            >
              {t("bizPerm.effectDeny") || "Deny"}
            </button>
          </div>
        </FormField>
        <FormField label={t("field.isEnabled") || "Enabled"}>
          <div className="flex items-center justify-end">
            <Switch checked={perm.isEnabled} onChange={(v) => set("isEnabled", v)} />
          </div>
        </FormField>
      </FormSection>

      {/* ── Resources & actions ── (JSON arrays; still free-form tag inputs) */}
      <FormSection title={t("bizPerm.section.resourcesActions") || "Resources & actions"}>
        <FormField label={t("bizPerm.resources") || "Resources"} span="full"
          help={t("bizPerm.resourceHint") || "One resource pattern per line. Supports glob (e.g. /api/orders/*) and keyMatch syntax."}
        >
          <textarea
            className={`${monoInputClass} min-h-[88px] resize-y`}
            value={(perm.resources ?? []).join("\n")}
            onChange={(e) => set("resources", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
            placeholder="/api/orders/*&#10;/api/orders/:id"
          />
        </FormField>
        <FormField label={t("bizPerm.actions") || "Actions"} span="full">
          <div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(perm.actions ?? []).map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-md bg-surface-2 border border-border px-2.5 py-1 text-[12px] font-medium font-mono">
                  {a}
                  <button onClick={() => removeAction(a)} className="text-text-muted hover:text-danger transition-colors"><X size={12} /></button>
                </span>
              ))}
              {(perm.actions?.length ?? 0) === 0 && <span className="text-[13px] text-text-muted">{t("common.noData") || "No actions"}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => addAction("GET")} className="text-[12px] text-accent font-medium border-b border-dashed border-accent hover:opacity-70 transition-opacity">+ GET</button>
              <button onClick={() => { addAction("POST"); addAction("PUT"); }} className="text-[12px] text-accent font-medium border-b border-dashed border-accent hover:opacity-70 transition-opacity">+ POST/PUT</button>
              <button onClick={() => addAction(".*")} className="text-[12px] text-accent font-medium border-b border-dashed border-accent hover:opacity-70 transition-opacity">+ .*</button>
              <input
                className={`${monoInputClass} max-w-[140px]`}
                placeholder={t("bizPerm.customAction") || "Custom…"}
                value={customAction}
                onChange={(e) => setCustomAction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customAction.trim()) {
                    addAction(customAction.trim());
                    setCustomAction("");
                  }
                }}
              />
            </div>
            <p className="mt-2 flex items-center gap-1 text-[11px] text-text-muted">
              <Info size={12} />
              {t("bizPerm.actionHint") || "Actions are matched as regex against request.act."}
            </p>
          </div>
        </FormField>
      </FormSection>

      {/* ── Grantees ── */}
      {!(isAddMode && isNew) && perm.id && (
        <BizPermissionGranteeTable permissionId={perm.id} organization={perm.owner} appName={perm.appName} />
      )}
    </motion.div>
  );
}
