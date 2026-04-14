import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, LogOut, ExternalLink, Copy } from "lucide-react";
import { FormField, FormSection, Switch, inputClass, monoInputClass } from "../components/FormSection";
import SimpleSelect from "../components/SimpleSelect";
import SingleSearchSelect from "../components/SingleSearchSelect";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useOrganization } from "../OrganizationContext";
import * as ProvBackend from "../backend/ProviderBackend";
import type { Provider } from "../backend/ProviderBackend";
import { friendlyError } from "../utils/errorHelper";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";

// ── Category & Type constants (matching original) ──

const CATEGORIES = [
  "Captcha", "Email", "Face ID", "ID Verification", "Log",
  "MFA", "Notification", "OAuth", "Payment", "SAML",
  "SMS", "Storage", "Web3",
];

const TYPE_BY_CATEGORY: Record<string, string[]> = {
  OAuth: [
    "Google", "GitHub", "QQ", "WeChat", "Facebook", "DingTalk", "Weibo", "Gitee",
    "LinkedIn", "WeCom", "Lark", "GitLab", "ADFS", "Baidu", "Alipay", "Casdoor",
    "Infoflow", "Apple", "AzureAD", "AzureADB2C", "Slack", "Steam", "Bilibili",
    "Okta", "Douyin", "Line", "Amazon", "Auth0", "BattleNet", "Bitbucket", "Discord",
    "Dropbox", "Gitea", "Instagram", "Kakao", "Naver", "PayPal", "Spotify", "Telegram",
    "TikTok", "Twitter", "VK", "Zoom",
    "Custom",
  ],
  Email: ["Default", "SUBMAIL", "Mailtrap", "Azure ACS", "SendGrid", "Custom HTTP Email", "Resend"],
  SMS: [
    "Aliyun SMS", "Tencent Cloud SMS", "Twilio SMS", "Amazon SNS", "Azure ACS",
    "Volc Engine SMS", "Huawei Cloud SMS", "Baidu Cloud SMS", "UCloud SMS",
    "Infobip SMS", "OSON SMS", "SmsBao SMS", "SUBMAIL SMS", "Msg91 SMS",
    "Custom HTTP SMS", "Mock SMS",
  ],
  Storage: [
    "Local File System", "AWS S3", "MinIO", "Aliyun OSS", "Tencent Cloud COS",
    "Azure Blob", "Qiniu Cloud Kodo", "Google Cloud Storage", "Synology", "Casdoor", "CUCloud OSS",
  ],
  SAML: ["Aliyun IDaaS", "Keycloak", "Custom"],
  Payment: ["Dummy", "Balance", "Alipay", "WeChat Pay", "PayPal", "Stripe", "GC"],
  Captcha: ["Default", "reCAPTCHA v2", "reCAPTCHA v3", "hCaptcha", "Aliyun Captcha", "GEETEST", "Cloudflare Turnstile"],
  Web3: ["MetaMask", "Web3Onboard"],
  Notification: [
    "Telegram", "Custom HTTP", "DingTalk", "Lark", "Microsoft Teams", "Bark",
    "Pushover", "Pushbullet", "Slack", "Webpush", "Discord", "Google Chat",
    "Line", "Matrix", "Twitter", "Reddit", "Rocket Chat", "Viber", "WeCom",
  ],
  "Face ID": ["Alibaba Cloud Facebody"],
  MFA: ["RADIUS"],
  "ID Verification": ["Jumio", "Alibaba Cloud"],
  Log: ["Casdoor Permission Log", "System Log", "Agent", "SELinux Log"],
};

const DEFAULT_TYPE_FOR_CATEGORY: Record<string, string> = {
  OAuth: "Google", Email: "Default", SMS: "Twilio SMS", Storage: "AWS S3",
  SAML: "Keycloak", Payment: "PayPal", Captcha: "Default", Web3: "MetaMask",
  Notification: "Telegram", "Face ID": "Alibaba Cloud Facebody", MFA: "RADIUS",
  "ID Verification": "Jumio", Log: "Casdoor Permission Log",
};

// SubType options
const SUBTYPES: Record<string, string[]> = {
  WeCom: ["Internal", "Third-party"],
  Infoflow: ["Internal", "Third-party"],
  WeChat: ["Web", "Mobile"],
  Agent: ["OpenClaw"],
};

// ── Dynamic label helpers ──

function getClientIdLabel(cat: string, type: string, t: (k: string) => string): string {
  if (cat === "OAuth" && type === "Apple") return "Service ID identifier";
  if (cat === "Email") return t("providers.label.username" as any);
  if (cat === "SMS") {
    if (["Volc Engine SMS", "Amazon SNS", "Baidu Cloud SMS"].includes(type)) return "Access Key";
    if (type === "Huawei Cloud SMS") return "App Key";
    if (type === "UCloud SMS") return "Public Key";
    if (["Msg91 SMS", "Infobip SMS", "OSON SMS"].includes(type)) return "Sender Id";
    return t("providers.field.clientId");
  }
  if (cat === "Captcha") {
    if (type === "Aliyun Captcha") return "Access Key";
    return "Site Key";
  }
  return t("providers.field.clientId");
}

function getClientSecretLabel(cat: string, type: string, t: (k: string) => string): string {
  if (cat === "OAuth" && type === "Apple") return "Team ID";
  if (cat === "Storage" && type === "Google Cloud Storage") return "Service Account JSON";
  if (cat === "Email") {
    if (["Azure ACS", "SendGrid", "Resend"].includes(type)) return "Secret Key";
    return t("providers.label.password" as any);
  }
  if (cat === "SMS") {
    if (["Volc Engine SMS", "Amazon SNS", "Baidu Cloud SMS", "OSON SMS"].includes(type)) return "Secret Access Key";
    if (type === "Huawei Cloud SMS") return "App Secret";
    if (type === "UCloud SMS") return "Private Key";
    if (type === "Msg91 SMS") return "Auth Key";
    if (type === "Infobip SMS") return "API Key";
    return t("providers.field.clientSecret");
  }
  if (cat === "Captcha") {
    if (type === "Aliyun Captcha") return "Secret Access Key";
    return "Secret Key";
  }
  if (cat === "Notification") {
    if (["Line", "Telegram", "Bark", "DingTalk", "Discord", "Slack", "Pushover", "Pushbullet"].includes(type)) return "Secret Key";
    if (["Lark", "Microsoft Teams", "WeCom"].includes(type)) return "Endpoint";
    return t("providers.field.clientSecret");
  }
  return t("providers.field.clientSecret");
}

function shouldHideCredentials(cat: string, type: string): boolean {
  if (cat === "Captcha" && type === "Default") return true;
  if (cat === "Web3") return true;
  if (cat === "MFA") return true;
  if (cat === "Log") return true;
  if (cat === "Storage" && type === "Local File System") return true;
  if (cat === "SMS" && type === "Custom HTTP SMS") return true;
  if (cat === "Email" && type === "Custom HTTP Email") return true;
  if (cat === "Notification" && ["Google Chat", "Custom HTTP", "Balance"].includes(type)) return true;
  return false;
}

function shouldShowClientId2(cat: string, type: string): boolean {
  if (cat === "Email") return true;
  return ["WeChat", "Apple", "Aliyun Captcha", "WeChat Pay", "Twitter", "Reddit", "CUCloud"].includes(type);
}

function getClientId2Label(cat: string, type: string): string {
  if (cat === "OAuth" && type === "Apple") return "Key ID";
  if (cat === "Email") return "From Address";
  if (type === "Aliyun Captcha") return "Scene";
  if (type === "WeChat Pay" || type === "CUCloud") return "App ID";
  return "Client ID 2";
}

function getClientSecret2Label(cat: string, type: string): string {
  if (cat === "OAuth" && type === "Apple") return "Key Text";
  if (cat === "Email") return "From Name";
  if (type === "Aliyun Captcha") return "App Key";
  return "Client Secret 2";
}

function shouldHideClientSecret2(cat: string, type: string): boolean {
  if (type === "WeChat Pay" || type === "CUCloud") return true;
  if (cat === "Email" && type === "Azure ACS") return true;
  return false;
}

function getAppIdLabel(cat: string, type: string): string | null {
  // OAuth
  if (type === "WeCom") return "Agent ID";
  if (type === "Infoflow") return "Agent ID";
  if (type === "AzureADB2C") return "User Flow";
  // SMS
  if (type === "Twilio SMS" || type === "Azure ACS") return "Sender Number";
  if (type === "Tencent Cloud SMS") return "App ID";
  if (type === "Volc Engine SMS") return "SMS Account";
  if (type === "Huawei Cloud SMS") return "Channel No.";
  if (type === "Amazon SNS") return "Region";
  if (type === "Baidu Cloud SMS") return "Endpoint";
  if (type === "Infobip SMS") return "Base URL";
  if (type === "UCloud SMS") return "Project Id";
  // Email
  if (cat === "Email" && type === "SUBMAIL") return "App ID";
  // Notification
  if (type === "Viber") return "Domain";
  if (["Line", "Matrix", "Rocket Chat"].includes(type)) return "App Key";
  return null;
}

// ── Default email templates ──

const DEFAULT_EMAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verification Code Email</title>
<style>
    body { font-family: Arial, sans-serif; }
    .email-container { width: 600px; margin: 0 auto; }
    .header { text-align: center; }
    .code { font-size: 24px; margin: 20px 0; text-align: center; }
    .footer { font-size: 12px; text-align: center; margin-top: 50px; }
    .footer a { color: #000; text-decoration: none; }
</style>
</head>
<body>
<div class="email-container">
  <div class="header">
        <h3>JetAuth</h3>
        <img src="/img/logo.png" alt="JetAuth Logo" width="300">
    </div>
    <p><strong>%{user.friendlyName}</strong>, here is your verification code</p>
    <p>Use this code for your transaction. It's valid for 5 minutes</p>
    <div class="code">
        %s
    </div>
    <reset-link>
      <div class="link">
         Or click this <a href="%link">link</a> to reset
      </div>
    </reset-link>
    <p>Thanks</p>
    <p>JetAuth Team</p>
    <hr>
    <div class="footer">
        <p>JetAuth Identity & Access Management</p>
    </div>
</div>
</body>
</html>`;

const DEFAULT_EMAIL_TEXT = `You have requested a verification code at JetAuth. Here is your code: %s, please enter in 5 minutes. <reset-link>Or click %link to reset</reset-link>`;

const DEFAULT_INVITATION_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invitation Code Email</title>
<style>
    body { font-family: Arial, sans-serif; }
    .email-container { width: 600px; margin: 0 auto; }
    .header { text-align: center; }
    .code { font-size: 24px; margin: 20px 0; text-align: center; }
    .footer { font-size: 12px; text-align: center; margin-top: 50px; }
    .footer a { color: #000; text-decoration: none; }
</style>
</head>
<body>
<div class="email-container">
  <div class="header">
        <h3>JetAuth</h3>
        <img src="/img/logo.png" alt="JetAuth Logo" width="300">
    </div>
    <p>You have been invited to join JetAuth</p>
    <div class="code">
        %code
    </div>
    <reset-link>
      <div class="link">
         Or click this <a href="%link">link</a> to signup
      </div>
    </reset-link>
    <p>Thanks</p>
    <p>JetAuth Team</p>
    <hr>
    <div class="footer">
        <p>JetAuth Identity & Access Management</p>
    </div>
</div>
</body>
</html>`;

const DEFAULT_INVITATION_TEXT = `You have been invited to join JetAuth. Here is your invitation code: %s, please enter in 5 minutes. Or click %link to signup`;

// ── Mapping fields ──

const OAUTH_MAPPING_FIELDS = [
  "id", "username", "displayName", "email", "avatarUrl", "phone",
  "countryCode", "firstName", "lastName", "region", "location", "affiliation", "title",
];

const OAUTH_MAPPING_REQUIRED = ["id", "username", "displayName"];

// ══════════════════════════════════════════

export default function ProviderEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const isNew = !name || name === "new";
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const { orgOptions, isGlobalAdmin } = useOrganization();
  const queryClient = useQueryClient();
  const [prov, setProv] = useState<Record<string, unknown>>({
    owner: "admin",
    category: "OAuth",
    type: "Google",
    method: "Normal",
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");
  const [nameAutoGen, setNameAutoGen] = useState(isAddMode);
  const [displayNameAutoGen, setDisplayNameAutoGen] = useState(isAddMode);
  const [samlMetadataUrl, setSamlMetadataUrl] = useState("");
  const [samlMetadataLoading, setSamlMetadataLoading] = useState(false);

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ["providers"] });

  const fetchData = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const res = await ProvBackend.getProvider(owner!, name!);
      if (res.status === "ok" && res.data) { setProv(res.data); setOriginalJson(JSON.stringify(res.data)); }
    } catch (e: any) { modal.toast(e?.message || t("common.saveFailed" as any), "error"); }
    finally { setLoading(false); }
  }, [owner, name, isNew]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const set = (key: string, val: unknown) => setProv((p) => ({ ...p, [key]: val }));
  const category = String(prov.category ?? "OAuth");
  const type = String(prov.type ?? "");

  // Auto-generate name/displayName when category or type changes
  const autoGenNames = (cat: string, typ: string, subTyp?: string) => {
    const parts = [cat, typ, subTyp].filter(Boolean).join("_").toLowerCase().replace(/\s+/g, "_");
    if (nameAutoGen) set("name", `provider_${parts}`);
    if (displayNameAutoGen) set("displayName", [cat, typ, subTyp].filter(Boolean).join(" "));
  };

  const handleCategoryChange = (newCat: string) => {
    const newType = DEFAULT_TYPE_FOR_CATEGORY[newCat] ?? "";
    const updates: Record<string, unknown> = { category: newCat, type: newType };

    // Category-specific defaults
    if (newCat === "Email") {
      Object.assign(updates, {
        host: "smtp.example.com", port: 465, sslMode: "Auto",
        title: "JetAuth Verification Code",
        content: DEFAULT_EMAIL_HTML,
        metadata: DEFAULT_INVITATION_HTML,
      });
    } else if (newCat === "MFA") {
      Object.assign(updates, { host: "", port: 1812 });
    } else if (newCat === "Log") {
      Object.assign(updates, { host: "", port: 0, title: "", state: "Enabled" });
    } else if (newCat === "ID Verification") {
      Object.assign(updates, { endpoint: "" });
    }

    setProv((p) => ({ ...p, ...updates }));
    autoGenNames(newCat, newType);
  };

  const handleTypeChange = (newType: string) => {
    const updates: Record<string, unknown> = { type: newType };

    // Type-specific defaults
    if (category === "OAuth" && newType === "Custom") {
      Object.assign(updates, {
        customAuthUrl: "https://door.casdoor.com/login/oauth/authorize",
        scopes: "openid profile email",
        customTokenUrl: "https://door.casdoor.com/api/login/oauth/access_token",
        customUserInfoUrl: "https://door.casdoor.com/api/userinfo",
      });
    } else if (category === "Storage" && newType === "Local File System") {
      Object.assign(updates, { domain: window.location.origin });
    } else if (category === "SMS" && newType === "Custom HTTP SMS") {
      Object.assign(updates, { endpoint: "https://example.com/send-custom-http-sms", method: "GET", title: "code" });
    } else if (category === "Email" && newType === "Custom HTTP Email") {
      Object.assign(updates, { endpoint: "https://example.com/send-custom-http-email", method: "POST" });
    } else if (category === "Notification" && newType === "Custom HTTP") {
      Object.assign(updates, { method: "GET", title: "" });
    }

    setProv((p) => ({ ...p, ...updates }));
    autoGenNames(category, newType);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = isNew
        ? await ProvBackend.addProvider(prov as Provider)
        : await ProvBackend.updateProvider(owner!, name!, prov as Provider);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(prov));
        setIsAddMode(false);
        invalidateList();
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) { modal.toast(e?.message || t("common.saveFailed" as any), "error"); }
    finally { setSaving(false); }
  };

  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = isNew
        ? await ProvBackend.addProvider(prov as Provider)
        : await ProvBackend.updateProvider(owner!, name!, prov as Provider);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/providers");
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    } finally { setSaving(false); }
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
      try {
        const res = await ProvBackend.deleteProvider(prov as Provider);
        if (res.status === "ok") {
          invalidateList();
          navigate("/providers");
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      } catch (e: any) {
        modal.toast(e?.message || t("common.deleteFailed" as any), "error");
      }
    });
  };

  const isDirty = originalJson !== "" && JSON.stringify(prov) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /></div>;
  }

  // ── Computed flags ──
  const hideCredentials = shouldHideCredentials(category, type);
  const showClientId2 = shouldShowClientId2(category, type);
  const showSubType = !!SUBTYPES[type];
  const appIdLabel = getAppIdLabel(category, type);
  const isOAuthLike = category === "OAuth" || category === "Web3" || category === "SAML";
  const isCustomOAuth = category === "OAuth" && type === "Custom";

  // ── Category-specific fields ──
  const renderCredentials = () => {
    if (hideCredentials) return null;
    return (
      <FormSection title={t("providers.section.credentials" as any)}>
        <FormField label={getClientIdLabel(category, type, t)}>
          <input value={String(prov.clientId ?? "")} onChange={(e) => set("clientId", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={getClientSecretLabel(category, type, t)}>
          <input value={String(prov.clientSecret ?? "")} onChange={(e) => set("clientSecret", e.target.value)} type="password" className={monoInputClass} />
        </FormField>
        {showClientId2 && (
          <>
            <FormField label={getClientId2Label(category, type)}>
              <input value={String(prov.clientId2 ?? "")} onChange={(e) => set("clientId2", e.target.value)} className={monoInputClass} />
            </FormField>
            {!shouldHideClientSecret2(category, type) && (
              <FormField label={getClientSecret2Label(category, type)}>
                {category === "OAuth" && type === "Apple" ? (
                  <textarea value={String(prov.clientSecret2 ?? "")} onChange={(e) => set("clientSecret2", e.target.value)} rows={4} className={`${monoInputClass} text-[11px]`} />
                ) : (
                  <input value={String(prov.clientSecret2 ?? "")} onChange={(e) => set("clientSecret2", e.target.value)} className={monoInputClass} />
                )}
              </FormField>
            )}
          </>
        )}
        {appIdLabel && (
          <FormField label={appIdLabel}>
            <input value={String(prov.appId ?? "")} onChange={(e) => set("appId", e.target.value)} className={monoInputClass} />
          </FormField>
        )}
      </FormSection>
    );
  };

  const renderOAuthFields = () => (
    <>
      {isCustomOAuth && (
        <>
          <FormSection title={t("providers.section.customOAuth" as any)}>
            <FormField label={t("providers.field.customAuthUrl" as any)} span="full">
              <input value={String(prov.customAuthUrl ?? "")} onChange={(e) => set("customAuthUrl", e.target.value)} className={inputClass} placeholder="https://example.com/oauth/authorize" />
            </FormField>
            <FormField label={t("providers.field.customTokenUrl" as any)} span="full">
              <input value={String(prov.customTokenUrl ?? "")} onChange={(e) => set("customTokenUrl", e.target.value)} className={inputClass} placeholder="https://example.com/oauth/token" />
            </FormField>
            <FormField label={t("providers.field.scopes" as any)} span="full">
              <input value={String(prov.scopes ?? "")} onChange={(e) => set("scopes", e.target.value)} className={inputClass} placeholder="openid profile email" />
            </FormField>
            <FormField label={t("providers.field.customUserInfoUrl" as any)} span="full">
              <input value={String(prov.customUserInfoUrl ?? "")} onChange={(e) => set("customUserInfoUrl", e.target.value)} className={inputClass} placeholder="https://example.com/api/userinfo" />
            </FormField>
            <FormField label={t("providers.field.customLogoutUrl" as any)} span="full">
              <input value={String(prov.customLogoutUrl ?? "")} onChange={(e) => set("customLogoutUrl", e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t("providers.field.enablePkce" as any)}>
              <Switch checked={!!prov.enablePkce} onChange={(v) => set("enablePkce", v)} />
            </FormField>
          </FormSection>
          <FormSection title={t("providers.section.userMapping" as any)}>
            {OAUTH_MAPPING_FIELDS.map((field) => (
              <FormField key={field} label={t(`providers.mapping.${field}` as any)} required={OAUTH_MAPPING_REQUIRED.includes(field)}>
                <input
                  value={String((prov.userMapping as any)?.[field] ?? "")}
                  onChange={(e) => set("userMapping", { ...(prov.userMapping as any ?? {}), [field]: e.target.value })}
                  className={monoInputClass}
                  placeholder={field}
                />
              </FormField>
            ))}
          </FormSection>
          <FormSection title={t("providers.field.customLogo" as any)}>
            <FormField label={t("providers.field.customLogo" as any)} span="full">
              <input value={String(prov.customLogo ?? "")} onChange={(e) => set("customLogo", e.target.value)} className={inputClass} />
            </FormField>
          </FormSection>
        </>
      )}
    </>
  );

  const sendTestEmail = async (testSmtp = false) => {
    const emailForm = {
      title: prov.title,
      content: prov.content,
      sender: prov.displayName,
      receivers: testSmtp ? ["TestSmtpServer"] : [String(prov.receiver ?? "")],
      provider: prov.name,
      providerObject: prov,
      owner: prov.owner,
      name: prov.name,
    };
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify(emailForm),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.status === "ok") {
        modal.toast(testSmtp ? t("providers.email.smtpSuccess" as any) : t("providers.email.sendSuccess" as any));
      } else {
        modal.toast(data.msg || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    }
  };

  const renderEmailFields = () => (
    <>
      {type === "Custom HTTP Email" ? (
        <>
          <FormSection title={t("providers.section.emailConfig" as any)}>
            <FormField label={t("providers.field.endpoint")} span="full">
              <input value={String(prov.endpoint ?? "")} onChange={(e) => set("endpoint", e.target.value)} className={inputClass} placeholder="https://example.com/send-email" />
            </FormField>
            <FormField label={t("providers.field.method" as any)}>
              <SimpleSelect value={String(prov.method ?? "POST")} options={[{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }]} onChange={(v) => set("method", v)} />
            </FormField>
          </FormSection>
          <FormSection title={t("providers.section.httpHeaders" as any)}>
            <FormField label="" span="full">
              <HttpHeadersEditor
                headers={(prov.httpHeaders as Record<string, string>) ?? {}}
                onChange={(h) => set("httpHeaders", h)}
              />
            </FormField>
          </FormSection>
          <FormSection title={t("providers.section.emailMapping" as any)}>
            {["fromName", "fromAddress", "toAddress", "subject", "content"].map((field) => (
              <FormField key={field} label={t(`providers.emailMapping.${field}` as any)}>
                <input
                  value={String((prov.userMapping as any)?.[field] ?? "")}
                  onChange={(e) => set("userMapping", { ...(prov.userMapping as any ?? {}), [field]: e.target.value })}
                  className={monoInputClass}
                  placeholder={field}
                />
              </FormField>
            ))}
          </FormSection>
        </>
      ) : (
        <FormSection title={t("providers.section.emailConfig" as any)}>
          {type !== "Resend" && (
            <FormField label={t("providers.field.host")}>
              <input value={String(prov.host ?? "")} onChange={(e) => set("host", e.target.value)} className={inputClass} placeholder={t("help.placeholder.smtpHost" as any)} />
            </FormField>
          )}
          {!["Azure ACS", "SendGrid", "Resend"].includes(type) && (
            <>
              <FormField label={t("providers.field.port")}>
                <input type="number" value={String(prov.port ?? 465)} onChange={(e) => set("port", Number(e.target.value))} className={monoInputClass} />
              </FormField>
              <FormField label={t("providers.field.sslMode" as any)}>
                <SimpleSelect value={String(prov.sslMode ?? "Auto")} options={[
                  { value: "Auto", label: t("providers.sslMode.auto" as any) },
                  { value: "Enable", label: t("providers.state.enabled" as any) },
                  { value: "Disable", label: t("providers.state.disabled" as any) },
                ]} onChange={(v) => set("sslMode", v)} />
              </FormField>
            </>
          )}
          <FormField label={t("providers.field.emailTitle" as any)} span="full">
            <input value={String(prov.title ?? "")} onChange={(e) => set("title", e.target.value)} className={inputClass} />
          </FormField>
        </FormSection>
      )}

      {/* Email Content — editor + preview */}
      <FormSection title={t("providers.field.emailContent" as any)}>
        <div className="col-span-2 space-y-2">
          <div className="flex gap-2">
            <button onClick={() => set("content", DEFAULT_EMAIL_TEXT)} className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              {t("providers.email.resetText" as any)}
            </button>
            <button onClick={() => set("content", DEFAULT_EMAIL_HTML)} className="rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors">
              {t("providers.email.resetHtml" as any)}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <textarea value={String(prov.content ?? "")} onChange={(e) => set("content", e.target.value)} rows={12} className={`${monoInputClass} text-[11px]`} />
            <div className="rounded-lg border border-border bg-white p-3 overflow-auto max-h-[300px]">
              <div dangerouslySetInnerHTML={{ __html: String(prov.content ?? "").replace(/%s/g, "123456").replace(/%\{user\.friendlyName\}/g, "User") }} />
            </div>
          </div>
        </div>
      </FormSection>

      {/* Invitation Email Content — editor + preview */}
      <FormSection title={t("providers.email.invitationContent" as any)}>
        <div className="col-span-2 space-y-2">
          <div className="flex gap-2">
            <button onClick={() => set("metadata", DEFAULT_INVITATION_TEXT)} className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              {t("providers.email.resetText" as any)}
            </button>
            <button onClick={() => set("metadata", DEFAULT_INVITATION_HTML)} className="rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors">
              {t("providers.email.resetHtml" as any)}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <textarea value={String(prov.metadata ?? "")} onChange={(e) => set("metadata", e.target.value)} rows={12} className={`${monoInputClass} text-[11px]`} />
            <div className="rounded-lg border border-border bg-white p-3 overflow-auto max-h-[300px]">
              <div dangerouslySetInnerHTML={{ __html: String(prov.metadata ?? "").replace(/%code/g, "123456").replace(/%s/g, "123456") }} />
            </div>
          </div>
        </div>
      </FormSection>

      {/* Test Email */}
      <FormSection title={t("providers.email.testEmail" as any)}>
        <FormField label={t("providers.field.receiver" as any)} span="full">
          <div className="flex gap-2 items-center">
            <input value={String(prov.receiver ?? "")} onChange={(e) => set("receiver", e.target.value)} className={`${inputClass} flex-1`} placeholder={t("providers.help.testReceiver" as any)} />
            {!["Azure ACS", "SendGrid", "Resend"].includes(type) && (
              <button onClick={() => sendTestEmail(true)} className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors whitespace-nowrap">
                {t("providers.email.testSmtp" as any)}
              </button>
            )}
            <button
              onClick={() => sendTestEmail(false)}
              disabled={!prov.receiver || !String(prov.receiver).includes("@")}
              className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {t("providers.email.sendTest" as any)}
            </button>
          </div>
        </FormField>
      </FormSection>
    </>
  );

  const renderSmsFields = () => (
    <FormSection title={t("providers.section.smsConfig" as any)}>
      {type === "Custom HTTP SMS" ? (
        <>
          <FormField label={t("providers.field.endpoint")} span="full">
            <input value={String(prov.endpoint ?? "")} onChange={(e) => set("endpoint", e.target.value)} className={inputClass} placeholder="https://example.com/send-sms" />
          </FormField>
          <FormField label={t("providers.field.method" as any)}>
            <SimpleSelect value={String(prov.method ?? "GET")} options={[{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }]} onChange={(v) => set("method", v)} />
          </FormField>
          {/* HTTP Headers */}
          <FormField label={t("providers.section.httpHeaders" as any)} span="full">
            <HttpHeadersEditor
              headers={(prov.httpHeaders as Record<string, string>) ?? {}}
              onChange={(h) => set("httpHeaders", h)}
            />
          </FormField>
          {/* SMS mapping fields */}
          {["phoneNumber", "content"].map((field) => (
            <FormField key={field} label={t(`providers.smsMapping.${field}` as any)}>
              <input
                value={String((prov.userMapping as any)?.[field] ?? "")}
                onChange={(e) => set("userMapping", { ...(prov.userMapping as any ?? {}), [field]: e.target.value })}
                className={monoInputClass}
                placeholder={field}
              />
            </FormField>
          ))}
        </>
      ) : (
        <>
          <FormField label={t("providers.field.signName" as any)}>
            <input value={String(prov.signName ?? "")} onChange={(e) => set("signName", e.target.value)} className={inputClass} />
          </FormField>
          <FormField label={t("providers.field.templateCode" as any)}>
            <input value={String(prov.templateCode ?? "")} onChange={(e) => set("templateCode", e.target.value)} className={monoInputClass} />
          </FormField>
        </>
      )}
    </FormSection>
  );

  const renderStorageFields = () => (
    <FormSection title={t("providers.section.storageConfig" as any)}>
      <FormField label={t("providers.field.endpoint")}>
        <input value={String(prov.endpoint ?? "")} onChange={(e) => set("endpoint", e.target.value)} className={inputClass} placeholder={t("help.placeholder.s3Endpoint" as any)} />
      </FormField>
      {type !== "Local File System" && (
        <FormField label={t("providers.field.intranetEndpoint" as any)}>
          <input value={String(prov.intranetEndpoint ?? "")} onChange={(e) => set("intranetEndpoint", e.target.value)} className={inputClass} />
        </FormField>
      )}
      <FormField label={t("providers.field.bucket")}>
        <input value={String(prov.bucket ?? "")} onChange={(e) => set("bucket", e.target.value)} className={monoInputClass} />
      </FormField>
      <FormField label={t("providers.field.pathPrefix" as any)}>
        <input value={String(prov.pathPrefix ?? "")} onChange={(e) => set("pathPrefix", e.target.value)} className={monoInputClass} placeholder="e.g., /uploads" />
      </FormField>
      <FormField label={t("providers.field.domain")} help={t("help.customDomain" as any)}>
        <input value={String(prov.domain ?? "")} onChange={(e) => set("domain", e.target.value)} className={inputClass} />
      </FormField>
      <FormField label={t("providers.field.region")}>
        <input value={String(prov.region ?? "")} onChange={(e) => set("region", e.target.value)} className={monoInputClass} placeholder={t("help.placeholder.s3Region" as any)} />
      </FormField>
    </FormSection>
  );

  const fetchSamlMetadataFromUrl = async () => {
    if (!samlMetadataUrl) return;
    setSamlMetadataLoading(true);
    try {
      const res = await fetch(samlMetadataUrl);
      if (!res.ok) throw new Error("Failed to fetch");
      const xml = await res.text();
      set("metadata", xml);
      modal.toast(t("common.saveSuccess" as any));
    } catch (e: any) {
      modal.toast(e?.message || "Failed to fetch metadata", "error");
    } finally { setSamlMetadataLoading(false); }
  };

  const parseSamlMetadata = () => {
    try {
      const rawXml = String(prov.metadata ?? "").replace(/\n/g, "");
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawXml, "text/xml");
      const cert = doc.querySelector("X509Certificate")?.textContent?.replace(/\s/g, "") ?? "";
      const endpoint = doc.querySelector("SingleSignOnService")?.getAttribute("Location") ?? "";
      const issuerUrl = doc.querySelector("EntityDescriptor")?.getAttribute("entityID") ?? "";
      set("idP", cert);
      set("endpoint", endpoint);
      set("issuerUrl", issuerUrl);
      modal.toast(t("providers.saml.parseSuccess" as any));
    } catch {
      modal.toast(t("providers.saml.parseFailed" as any), "error");
    }
  };

  const spAcsUrl = `${window.location.origin}/api/acs`;

  const renderSamlFields = () => (
    <>
      <FormSection title={t("providers.section.samlConfig" as any)}>
        <FormField label={t("providers.field.enableSignAuthnRequest" as any)}>
          <Switch checked={!!prov.enableSignAuthnRequest} onChange={(v) => set("enableSignAuthnRequest", v)} />
        </FormField>
        <FormField label={t("providers.field.emailRegex" as any)}>
          <input value={String(prov.emailRegex ?? "")} onChange={(e) => set("emailRegex", e.target.value)} className={monoInputClass} placeholder="e.g., ^.*@example\\.com$" />
        </FormField>
      </FormSection>
      <FormSection title={t("providers.section.samlMetadata" as any)}>
        {/* Metadata URL fetch */}
        <FormField label={t("providers.saml.metadataUrl" as any)} span="full">
          <div className="flex gap-2">
            <input value={samlMetadataUrl} onChange={(e) => setSamlMetadataUrl(e.target.value)} className={`${inputClass} flex-1`} placeholder="https://idp.example.com/metadata" />
            <button
              onClick={fetchSamlMetadataFromUrl}
              disabled={samlMetadataLoading || !samlMetadataUrl}
              className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {samlMetadataLoading ? t("common.loading" as any) : t("providers.saml.request" as any)}
            </button>
          </div>
        </FormField>
        {/* Metadata XML */}
        <FormField label={t("providers.field.metadata" as any)} span="full">
          <textarea value={String(prov.metadata ?? "")} onChange={(e) => set("metadata", e.target.value)} rows={6} className={`${monoInputClass} text-[11px]`} placeholder="Paste SAML metadata XML here..." />
        </FormField>
        <div className="col-span-2">
          <button onClick={parseSamlMetadata} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors">
            {t("providers.saml.parse" as any)}
          </button>
        </div>
        {/* Parsed fields */}
        <FormField label={t("providers.field.endpoint")} span="full">
          <input value={String(prov.endpoint ?? "")} onChange={(e) => set("endpoint", e.target.value)} className={inputClass} placeholder="SAML 2.0 Endpoint (HTTP)" />
        </FormField>
        <FormField label={t("providers.field.idpCert" as any)} span="full">
          <input value={String(prov.idP ?? "")} onChange={(e) => set("idP", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("providers.field.issuerUrl" as any)} span="full">
          <input value={String(prov.issuerUrl ?? "")} onChange={(e) => set("issuerUrl", e.target.value)} className={inputClass} />
        </FormField>
        {/* SP ACS URL (readonly + copy) */}
        <FormField label={t("providers.saml.spAcsUrl" as any)} span="full">
          <div className="flex gap-2">
            <input value={spAcsUrl} readOnly className={`${inputClass} flex-1 bg-surface-2 cursor-default`} />
            <button onClick={() => { navigator.clipboard.writeText(spAcsUrl); modal.toast(t("common.copySuccess" as any)); }} className="rounded-lg border border-border p-2 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors">
              <Copy size={14} />
            </button>
          </div>
        </FormField>
        {/* SP Entity ID (readonly + copy) */}
        <FormField label={t("providers.saml.spEntityId" as any)} span="full">
          <div className="flex gap-2">
            <input value={spAcsUrl} readOnly className={`${inputClass} flex-1 bg-surface-2 cursor-default`} />
            <button onClick={() => { navigator.clipboard.writeText(spAcsUrl); modal.toast(t("common.copySuccess" as any)); }} className="rounded-lg border border-border p-2 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors">
              <Copy size={14} />
            </button>
          </div>
        </FormField>
      </FormSection>
    </>
  );

  const renderPaymentFields = () => (
    <FormSection title={t("providers.section.paymentConfig" as any)}>
      <FormField label={t("providers.field.host")} help={t("help.webhookUrl" as any)}>
        <input value={String(prov.host ?? "")} onChange={(e) => set("host", e.target.value)} className={inputClass} />
      </FormField>
      <FormField label={t("providers.field.cert" as any)}>
        <input value={String(prov.cert ?? "")} onChange={(e) => set("cert", e.target.value)} className={monoInputClass} />
      </FormField>
    </FormSection>
  );

  const renderCaptchaFields = () => {
    if (type === "Default") return null;
    return null; // Captcha types only need clientId/Secret which is handled by renderCredentials
  };

  const renderNotificationFields = () => (
    <FormSection title={t("providers.section.notificationConfig" as any)}>
      <FormField label={t("providers.field.receiver" as any)} span="full">
        <input
          value={String(prov.receiver ?? "")}
          onChange={(e) => set("receiver", e.target.value)}
          className={inputClass}
          placeholder={["Telegram", "Pushover", "Pushbullet", "Slack", "Discord", "Line"].includes(type) ? "Chat ID" : "Endpoint"}
        />
      </FormField>
    </FormSection>
  );

  const renderMfaFields = () => (
    <FormSection title={t("providers.section.mfaConfig" as any)}>
      <FormField label={t("providers.field.host")}>
        <input value={String(prov.host ?? "")} onChange={(e) => set("host", e.target.value)} className={inputClass} placeholder="RADIUS server host" />
      </FormField>
      <FormField label={t("providers.field.port")}>
        <input type="number" value={String(prov.port ?? 1812)} onChange={(e) => set("port", Number(e.target.value))} className={monoInputClass} />
      </FormField>
    </FormSection>
  );

  const renderLogFields = () => (
    <FormSection title={t("providers.section.logConfig" as any)}>
      <FormField label={t("providers.field.host")}>
        <input value={String(prov.host ?? "")} onChange={(e) => set("host", e.target.value)} className={inputClass} />
      </FormField>
      <FormField label={t("providers.field.port")}>
        <input type="number" value={String(prov.port ?? 0)} onChange={(e) => set("port", Number(e.target.value))} className={monoInputClass} />
      </FormField>
      <FormField label={t("providers.field.state" as any)}>
        <SimpleSelect value={String(prov.state ?? "Enabled")} options={[{ value: "Enabled", label: t("providers.state.enabled" as any) }, { value: "Disabled", label: t("providers.state.disabled" as any) }]} onChange={(v) => set("state", v)} />
      </FormField>
    </FormSection>
  );

  const renderCategorySpecificFields = () => {
    switch (category) {
      case "OAuth": return renderOAuthFields();
      case "Email": return renderEmailFields();
      case "SMS": return renderSmsFields();
      case "Storage": return renderStorageFields();
      case "SAML": return renderSamlFields();
      case "Payment": return renderPaymentFields();
      case "Captcha": return renderCaptchaFields();
      case "Web3": return (
        <FormSection title={t("providers.section.config" as any)}>
          <FormField label={t("providers.field.enableSignUp" as any)}>
            <Switch checked={!!prov.enableSignUp} onChange={(v) => set("enableSignUp", v)} />
          </FormField>
        </FormSection>
      );
      case "Notification": return renderNotificationFields();
      case "MFA": return renderMfaFields();
      case "Log": return renderLogFields();
      default: return null;
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {isAddMode ? t("common.add") : t("common.edit")} {t("providers.title")}
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
          <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save")} />
          <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
            {t("common.saveAndExit" as any)}
          </button>
        </div>
      </div>

      {showBanner && <UnsavedBanner isAddMode={isAddMode} />}

      {/* Basic info */}
      <FormSection title={t("field.name")}>
        <FormField label={t("field.owner")}>
          <SimpleSelect value={String(prov.owner ?? "")} options={[{ value: "admin", label: "admin" }, ...orgOptions.map((o) => ({ value: o.name, label: o.displayName || o.name }))]} onChange={(v) => set("owner", v)} disabled={!isGlobalAdmin} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input
            value={String(prov.name ?? "")}
            onChange={(e) => { set("name", e.target.value); setNameAutoGen(false); }}
            className={monoInputClass}
          />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input
            value={String(prov.displayName ?? "")}
            onChange={(e) => { set("displayName", e.target.value); setDisplayNameAutoGen(false); }}
            className={inputClass}
          />
        </FormField>
        <FormField label={t("providers.field.category")}>
          <SimpleSelect
            value={category}
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
            onChange={handleCategoryChange}
          />
        </FormField>
        <FormField label={t("field.type")}>
          <SingleSearchSelect
            value={type}
            options={(TYPE_BY_CATEGORY[category] ?? []).map((t) => ({ value: t, label: t }))}
            onChange={handleTypeChange}
            placeholder={t("common.search" as any)}
          />
        </FormField>
        {showSubType && (
          <FormField label={t("providers.field.subType" as any)}>
            <SimpleSelect
              value={String(prov.subType ?? "")}
              options={(SUBTYPES[type] ?? []).map((s) => ({ value: s, label: s }))}
              onChange={(v) => { set("subType", v); autoGenNames(category, type, v); }}
            />
          </FormField>
        )}
        {/* OAuth: Email regex */}
        {category === "OAuth" && (
          <FormField label={t("providers.field.emailRegex" as any)} help={t("providers.help.emailRegex" as any)}>
            <input value={String(prov.emailRegex ?? "")} onChange={(e) => set("emailRegex", e.target.value)} className={monoInputClass} placeholder="e.g., ^.*@example\\.com$" />
          </FormField>
        )}
        {/* WeCom-specific: method, scope, use id as name */}
        {type === "WeCom" && (
          <>
            <FormField label={t("providers.field.method" as any)}>
              <SimpleSelect value={String(prov.method ?? "Normal")} options={[{ value: "Normal", label: "Normal" }, { value: "Silent", label: "Silent" }]} onChange={(v) => set("method", v)} />
            </FormField>
            <FormField label={t("providers.field.scopes" as any)}>
              <SimpleSelect value={String(prov.scopes ?? "snsapi_userinfo")} options={[{ value: "snsapi_userinfo", label: "snsapi_userinfo" }, { value: "snsapi_privateinfo", label: "snsapi_privateinfo" }]} onChange={(v) => set("scopes", v)} />
            </FormField>
            <FormField label={t("providers.field.useIdAsName" as any)}>
              <Switch checked={!!prov.disableSsl} onChange={(v) => set("disableSsl", v)} />
            </FormField>
          </>
        )}
      </FormSection>

      {/* Credentials (conditional) */}
      {renderCredentials()}

      {/* Category-specific sections */}
      {renderCategorySpecificFields()}

      {/* Provider URL — after all category fields, hidden for Log */}
      {category !== "Log" && (
        <FormSection>
          <FormField label={t("providers.field.providerUrl")} help={t("providers.help.providerUrl" as any)} span="full">
            <div className="flex gap-2">
              <input value={String(prov.providerUrl ?? "")} onChange={(e) => set("providerUrl", e.target.value)} className={`${inputClass} flex-1`} />
              {prov.providerUrl && (
                <a href={String(prov.providerUrl)} target="_blank" rel="noreferrer" className="rounded-lg border border-border p-2 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors">
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </FormField>
        </FormSection>
      )}
    </motion.div>
  );
}

// ── HTTP Headers key-value editor ──
function HttpHeadersEditor({ headers, onChange }: {
  headers: Record<string, string>;
  onChange: (h: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const entries = Object.entries(headers);

  return (
    <div className="space-y-2">
      {entries.map(([key, value], i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={key}
            onChange={(e) => {
              const next = { ...headers };
              delete next[key];
              next[e.target.value] = value;
              onChange(next);
            }}
            placeholder="Header name"
            className={`${inputClass} !py-1 !text-[12px] flex-1`}
          />
          <input
            value={value}
            onChange={(e) => onChange({ ...headers, [key]: e.target.value })}
            placeholder="Header value"
            className={`${inputClass} !py-1 !text-[12px] flex-1`}
          />
          <button
            onClick={() => { const next = { ...headers }; delete next[key]; onChange(next); }}
            className="rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange({ ...headers, "": "" })}
        className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors"
      >
        {t("common.add")}
      </button>
    </div>
  );
}
