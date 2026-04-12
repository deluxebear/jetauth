import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, LogOut} from "lucide-react";
import { FormField, FormSection, Switch, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as ProvBackend from "../backend/ProviderBackend";
import type { Provider } from "../backend/ProviderBackend";
import { friendlyError } from "../utils/errorHelper";

const CATEGORIES = ["OAuth", "Email", "SMS", "Storage", "Payment", "Captcha", "Notification", "AI", "SAML", "Web3", "MFA"];

const TYPE_BY_CATEGORY: Record<string, string[]> = {
  OAuth: ["Google", "GitHub", "Facebook", "Twitter", "LinkedIn", "WeChat", "DingTalk", "Lark", "Apple", "Custom"],
  Email: ["Default", "SUBMAIL", "Mailtrap", "Azure ACS"],
  SMS: ["Twilio", "Vonage", "Aliyun SMS", "Tencent Cloud SMS", "Amazon SNS", "SUBMAIL", "Custom HTTP"],
  Storage: ["Local File System", "AWS S3", "Aliyun OSS", "Tencent Cloud COS", "Azure Blob", "MinIO", "Google Cloud Storage"],
  Payment: ["Alipay", "WeChat Pay", "Stripe", "PayPal", "GC", "Balance"],
  Captcha: ["Default", "reCAPTCHA", "hCaptcha", "Cloudflare Turnstile", "Aliyun Captcha"],
  Notification: ["Telegram", "Slack", "Discord", "Lark", "DingTalk", "WeChat", "Email", "SMS", "Custom HTTP"],
  AI: ["OpenAI", "Claude", "Gemini", "Custom"],
  SAML: ["Keycloak", "Custom"],
  Web3: ["MetaMask"],
  MFA: ["TOTP", "SMS", "Email"],
};

export default function ProviderEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const isNew = !name || name === "new";
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const queryClient = useQueryClient();
  const [prov, setProv] = useState<Record<string, unknown>>({
    owner: "admin",
    category: "OAuth",
    type: "Google",
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ["providers"] });

  const fetchData = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const res = await ProvBackend.getProvider(owner!, name!);
      if (res.status === "ok" && res.data) setProv(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [owner, name, isNew]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const set = (key: string, val: unknown) => setProv((p) => ({ ...p, [key]: val }));
  const category = String(prov.category ?? "OAuth");

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = isNew
        ? await ProvBackend.addProvider(prov as Provider)
        : await ProvBackend.updateProvider(owner!, name!, prov as Provider);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setIsAddMode(false);
        invalidateList();
        navigate("/providers");
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };
  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = await ProvBackend.updateProvider(owner!, name!, prov as Provider);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/providers");
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
      await ProvBackend.deleteProvider(prov as Provider);
      invalidateList();
    }
    navigate("/providers");
  };

  const handleDelete = async () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      await ProvBackend.deleteProvider(prov as Provider);
      invalidateList();
      navigate("/providers");
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /></div>;
  }

  // Category-specific fields
  const renderCategoryFields = () => {
    switch (category) {
      case "OAuth":
      case "SAML":
      case "Web3":
        return (
          <>
            <FormSection title={t("providers.section.credentials" as any)}>
              <FormField label={t("providers.field.clientId")}>
                <input value={String(prov.clientId ?? "")} onChange={(e) => set("clientId", e.target.value)} className={monoInputClass} />
              </FormField>
              <FormField label={t("providers.field.clientSecret")}>
                <input value={String(prov.clientSecret ?? "")} onChange={(e) => set("clientSecret", e.target.value)} type="password" className={monoInputClass} />
              </FormField>
              {category === "SAML" && (
                <>
                  <FormField label={t("providers.field.endpoint")} span="full">
                    <input value={String(prov.endpoint ?? "")} onChange={(e) => set("endpoint", e.target.value)} className={inputClass} placeholder={t("help.placeholder.samlEndpoint" as any)} />
                  </FormField>
                  <FormField label={t("providers.field.idpCert" as any)} span="full">
                    <textarea value={String(prov.idP ?? "")} onChange={(e) => set("idP", e.target.value)} rows={5} className={`${monoInputClass} text-[11px]`} />
                  </FormField>
                  <FormField label={t("providers.field.issuerUrl" as any)} span="full">
                    <input value={String(prov.issuerUrl ?? "")} onChange={(e) => set("issuerUrl", e.target.value)} className={inputClass} />
                  </FormField>
                </>
              )}
              <FormField label={t("providers.field.enableSignUp" as any)}>
                <Switch checked={!!prov.enableSignUp} onChange={(v) => set("enableSignUp", v)} />
              </FormField>
            </FormSection>
            {category === "OAuth" && (
              <FormSection title={t("providers.section.userMapping" as any)}>
                {(["id", "username", "displayName", "email", "avatarUrl", "phone"] as const).map((field) => (
                  <FormField key={field} label={t(`providers.mapping.${field}` as any)}>
                    <input
                      value={String((prov.userMapping as any)?.[field] ?? "")}
                      onChange={(e) => set("userMapping", { ...(prov.userMapping as any ?? {}), [field]: e.target.value })}
                      className={monoInputClass}
                      placeholder={field}
                    />
                  </FormField>
                ))}
              </FormSection>
            )}
          </>
        );

      case "Email":
        return (
          <FormSection title={t("providers.section.emailConfig" as any)}>
            <FormField label={t("providers.field.host")}>
              <input value={String(prov.host ?? "")} onChange={(e) => set("host", e.target.value)} className={inputClass} placeholder={t("help.placeholder.smtpHost" as any)} />
            </FormField>
            <FormField label={t("providers.field.port")}>
              <input type="number" value={String(prov.port ?? 587)} onChange={(e) => set("port", Number(e.target.value))} className={monoInputClass} />
            </FormField>
            <FormField label={t("providers.field.clientId")} help={t("help.smtpUsername" as any)}>
              <input value={String(prov.clientId ?? "")} onChange={(e) => set("clientId", e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t("providers.field.clientSecret")} help={t("help.smtpPassword" as any)}>
              <input value={String(prov.clientSecret ?? "")} onChange={(e) => set("clientSecret", e.target.value)} type="password" className={inputClass} />
            </FormField>
            <FormField label={t("providers.field.sslMode" as any)}>
              <select value={String(prov.sslMode ?? "")} onChange={(e) => set("sslMode", e.target.value)} className={inputClass}>
                <option value="">{t("providers.sslMode.none" as any)}</option>
                <option value="SSL">{t("providers.sslMode.ssl" as any)}</option>
                <option value="STARTTLS">{t("providers.sslMode.starttls" as any)}</option>
              </select>
            </FormField>
            <FormField label={t("providers.field.emailTitle" as any)}>
              <input value={String(prov.title ?? "")} onChange={(e) => set("title", e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t("providers.field.emailContent" as any)} span="full">
              <textarea value={String(prov.content ?? "")} onChange={(e) => set("content", e.target.value)} rows={4} className={inputClass} />
            </FormField>
          </FormSection>
        );

      case "SMS":
        return (
          <FormSection title={t("providers.section.smsConfig" as any)}>
            <FormField label={t("providers.field.clientId")} help={t("help.accessKeyApiKey" as any)}>
              <input value={String(prov.clientId ?? "")} onChange={(e) => set("clientId", e.target.value)} className={monoInputClass} />
            </FormField>
            <FormField label={t("providers.field.clientSecret")} help={t("help.secretKey" as any)}>
              <input value={String(prov.clientSecret ?? "")} onChange={(e) => set("clientSecret", e.target.value)} type="password" className={monoInputClass} />
            </FormField>
            <FormField label={t("providers.field.host")}>
              <input value={String(prov.host ?? "")} onChange={(e) => set("host", e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t("providers.field.signName" as any)}>
              <input value={String(prov.signName ?? "")} onChange={(e) => set("signName", e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t("providers.field.templateCode" as any)}>
              <input value={String(prov.templateCode ?? "")} onChange={(e) => set("templateCode", e.target.value)} className={monoInputClass} />
            </FormField>
          </FormSection>
        );

      case "Storage":
        return (
          <FormSection title={t("providers.section.storageConfig" as any)}>
            <FormField label={t("providers.field.clientId")} help={t("help.accessKey" as any)}>
              <input value={String(prov.clientId ?? "")} onChange={(e) => set("clientId", e.target.value)} className={monoInputClass} />
            </FormField>
            <FormField label={t("providers.field.clientSecret")} help={t("help.secretKey" as any)}>
              <input value={String(prov.clientSecret ?? "")} onChange={(e) => set("clientSecret", e.target.value)} type="password" className={monoInputClass} />
            </FormField>
            <FormField label={t("providers.field.endpoint")}>
              <input value={String(prov.endpoint ?? "")} onChange={(e) => set("endpoint", e.target.value)} className={inputClass} placeholder={t("help.placeholder.s3Endpoint" as any)} />
            </FormField>
            <FormField label={t("providers.field.bucket")}>
              <input value={String(prov.bucket ?? "")} onChange={(e) => set("bucket", e.target.value)} className={monoInputClass} />
            </FormField>
            <FormField label={t("providers.field.region")}>
              <input value={String(prov.region ?? "")} onChange={(e) => set("region", e.target.value)} className={monoInputClass} placeholder={t("help.placeholder.s3Region" as any)} />
            </FormField>
            <FormField label={t("providers.field.domain")} help={t("help.customDomain" as any)}>
              <input value={String(prov.domain ?? "")} onChange={(e) => set("domain", e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t("providers.field.providerUrl")} span="full">
              <input value={String(prov.providerUrl ?? "")} onChange={(e) => set("providerUrl", e.target.value)} className={inputClass} />
            </FormField>
          </FormSection>
        );

      case "Payment":
        return (
          <FormSection title={t("providers.section.paymentConfig" as any)}>
            <FormField label={t("providers.field.clientId")} help={t("help.appIdMerchantId" as any)}>
              <input value={String(prov.clientId ?? "")} onChange={(e) => set("clientId", e.target.value)} className={monoInputClass} />
            </FormField>
            <FormField label={t("providers.field.clientSecret")} help={t("help.apiKeySecret" as any)}>
              <input value={String(prov.clientSecret ?? "")} onChange={(e) => set("clientSecret", e.target.value)} type="password" className={monoInputClass} />
            </FormField>
            <FormField label={t("providers.field.host")} help={t("help.webhookUrl" as any)}>
              <input value={String(prov.host ?? "")} onChange={(e) => set("host", e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t("providers.field.providerUrl")} span="full">
              <input value={String(prov.providerUrl ?? "")} onChange={(e) => set("providerUrl", e.target.value)} className={inputClass} />
            </FormField>
          </FormSection>
        );

      default:
        return (
          <FormSection title={t("providers.section.config" as any)}>
            <FormField label={t("providers.field.clientId")}>
              <input value={String(prov.clientId ?? "")} onChange={(e) => set("clientId", e.target.value)} className={monoInputClass} />
            </FormField>
            <FormField label={t("providers.field.clientSecret")}>
              <input value={String(prov.clientSecret ?? "")} onChange={(e) => set("clientSecret", e.target.value)} type="password" className={monoInputClass} />
            </FormField>
            <FormField label={t("providers.field.endpoint")} span="full">
              <input value={String(prov.endpoint ?? "")} onChange={(e) => set("endpoint", e.target.value)} className={inputClass} />
            </FormField>
          </FormSection>
        );
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {isNew ? t("common.add") : t("common.edit")} {t("providers.title")}
            </h1>
            {!isNew && <p className="text-[13px] text-text-muted font-mono mt-0.5">{owner}/{name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
              <Trash2 size={14} /> {t("common.delete")}
            </button>
          )}
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

      {/* Basic info */}
      <FormSection title={t("field.name")}>
        <FormField label={t("field.owner")}>
          <input value={String(prov.owner ?? "")} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={String(prov.name ?? "")} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={String(prov.displayName ?? "")} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <div />
        <FormField label={t("providers.field.category")}>
          <select
            value={category}
            onChange={(e) => {
              const cat = e.target.value;
              const types = TYPE_BY_CATEGORY[cat] ?? [];
              set("category", cat);
              set("type", types[0] ?? "");
            }}
            className={inputClass}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>
        <FormField label={t("field.type")}>
          <select value={String(prov.type ?? "")} onChange={(e) => set("type", e.target.value)} className={inputClass}>
            {(TYPE_BY_CATEGORY[category] ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FormField>
      </FormSection>

      {/* Category-specific fields */}
      {renderCategoryFields()}
    </motion.div>
  );
}
