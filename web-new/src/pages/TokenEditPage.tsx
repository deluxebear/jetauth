import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, Copy, LogOut} from "lucide-react";
import { FormField, FormSection, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as TokenBackend from "../backend/TokenBackend";
import type { Token } from "../backend/TokenBackend";
import { friendlyError } from "../utils/errorHelper";

function parseAccessToken(accessToken: string): string {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) return "Invalid JWT format";
    const header = JSON.parse(atob(parts[0]));
    const payload = JSON.parse(atob(parts[1]));
    return JSON.stringify(header, null, 2) + "\n.\n" + JSON.stringify(payload, null, 2);
  } catch (error) {
    return error instanceof Error ? error.message : "Failed to parse token";
  }
}

export default function TokenEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [token, setToken] = useState<Token | null>(null);
  const [saving, setSaving] = useState(false);

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Token>({
    queryKey: "token",
    owner: owner,
    name: name,
    fetchFn: TokenBackend.getToken,
  });

  useEffect(() => {
    if (entity) setToken(entity);
  }, [entity]);

  if (loading || !token) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setToken((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await TokenBackend.updateToken(token.owner, name!, token);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setIsAddMode(false);
        invalidateList();
        if (token.name !== name) {
          navigate(`/tokens/${token.name}`, { replace: true });
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
      const res = await TokenBackend.updateToken(token.owner, name!, token);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/tokens");
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
      await TokenBackend.deleteToken(token);
      invalidateList();
    }
    navigate("/tokens");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await TokenBackend.deleteToken(token);
        if (res.status === "ok") {
          invalidateList();
          navigate("/tokens");
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    modal.toast(t("common.copySuccess" as any));
  };

  const parsedResult = parseAccessToken(token.accessToken);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("tokens.title" as any)}</h1>
            <p className="text-[13px] text-text-muted font-mono mt-0.5">{token.owner}/{name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Basic Info */}
      <FormSection title={t("tokens.section.basic" as any)}>
        <FormField label={t("field.name")} required>
          <input value={token.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("col.application" as any)}>
          <input value={token.application} onChange={(e) => set("application", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("col.organization" as any)}>
          <input value={token.organization} onChange={(e) => set("organization", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("col.user" as any)}>
          <input value={token.user} onChange={(e) => set("user", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Token Details */}
      <FormSection title={t("tokens.section.details" as any)}>
        <FormField label={t("tokens.field.authorizationCode" as any)}>
          <input value={token.code} onChange={(e) => set("code", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("tokens.field.expiresIn" as any)}>
          <input type="number" value={token.expiresIn} onChange={(e) => set("expiresIn", parseInt(e.target.value) || 0)} className={monoInputClass} />
        </FormField>
        <FormField label={t("col.scope" as any)}>
          <input value={token.scope} onChange={(e) => set("scope", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("tokens.field.tokenType" as any)}>
          <input value={token.tokenType} onChange={(e) => set("tokenType", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Access Token */}
      <FormSection title={t("tokens.field.accessToken" as any)}>
        <FormField label={t("tokens.field.accessToken" as any)} span="full">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => copyToClipboard(token.accessToken)}
              disabled={!token.accessToken}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors disabled:opacity-30"
            >
              <Copy size={12} /> {t("tokens.copyAccessToken" as any)}
            </button>
          </div>
          <textarea
            value={token.accessToken}
            onChange={(e) => set("accessToken", e.target.value)}
            rows={10}
            className={`${monoInputClass} text-[11px]`}
          />
        </FormField>
        <FormField label={t("tokens.parsedResult" as any)} span="full">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => copyToClipboard(parsedResult)}
              disabled={!parsedResult.includes('"alg"')}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors disabled:opacity-30"
            >
              <Copy size={12} /> {t("tokens.copyParsedResult" as any)}
            </button>
          </div>
          <textarea
            value={parsedResult}
            readOnly
            rows={10}
            className={`${monoInputClass} text-[11px] bg-surface-2`}
          />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
