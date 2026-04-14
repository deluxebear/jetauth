import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, Copy, LogOut, Link as LinkIcon, Plus } from "lucide-react";
import { FormField, FormSection, Switch, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useOrganization } from "../OrganizationContext";
import * as AppBackend from "../backend/ApplicationBackend";
import type { Application } from "../backend/ApplicationBackend";
import * as GroupBackend from "../backend/GroupBackend";
import * as CertBackend from "../backend/CertBackend";
import * as ProviderBackend from "../backend/ProviderBackend";
import type { Provider } from "../backend/ProviderBackend";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";
import SingleSearchSelect from "../components/SingleSearchSelect";
import ImageUrlInput from "../components/ImageUrlInput";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";
import EditableTable, { type EditableColumn } from "../components/EditableTable";

type AppData = Partial<Application>;

const GRANT_TYPES = [
  { id: "authorization_code", name: "Authorization Code" },
  { id: "password", name: "Password" },
  { id: "client_credentials", name: "Client Credentials" },
  { id: "token", name: "Token" },
  { id: "id_token", name: "ID Token" },
  { id: "refresh_token", name: "Refresh Token" },
  { id: "urn:ietf:params:oauth:grant-type:device_code", name: "Device Code" },
  { id: "urn:ietf:params:oauth:grant-type:jwt-bearer", name: "JWT Bearer" },
];

const TOKEN_FORMATS = ["JWT", "JWT-Empty", "JWT-Custom", "JWT-Standard"];
const SIGNING_METHODS = ["RS256", "RS512", "ES256", "ES512", "ES384"];
const SAML_HASH_ALGORITHMS = ["SHA1", "SHA256", "SHA512"];
const SSL_MODES = [
  { value: "", label: "None" },
  { value: "HTTP", label: "HTTP" },
  { value: "HTTPS and HTTP", label: "HTTPS and HTTP" },
  { value: "HTTPS Only", label: "HTTPS Only" },
];

const SAML_NAME_FORMATS = [
  { value: "urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified", label: "Unspecified" },
  { value: "urn:oasis:names:tc:SAML:2.0:attrname-format:basic", label: "Basic" },
  { value: "urn:oasis:names:tc:SAML:2.0:attrname-format:uri", label: "UriReference" },
  { value: "urn:oasis:names:tc:SAML:2.0:attrname-format:X500", label: "x500AttributeName" },
];

const SAML_USER_VARIABLES = [
  "$user.owner", "$user.name", "$user.email", "$user.id",
  "$user.phone", "$user.roles", "$user.permissions", "$user.groups",
];

const TOKEN_ATTR_CATEGORIES = [
  { value: "Static Value", label: "Static Value" },
  { value: "Existing Field", label: "Existing Field" },
];

const TOKEN_ATTR_TYPES = [
  { value: "Array", label: "Array" },
  { value: "String", label: "String" },
];

const TOKEN_ATTR_USER_FIELDS = [
  "Owner", "Name", "Id", "DisplayName", "Email", "Phone",
  "Tag", "Roles", "Permissions", "permissionNames", "Groups",
];

const SIGNIN_METHOD_OPTIONS = [
  { name: "Password", displayName: "Password", rule: "All" },
  { name: "Verification code", displayName: "Verification code", rule: "All" },
  { name: "WebAuthn", displayName: "WebAuthn", rule: "None" },
  { name: "LDAP", displayName: "LDAP", rule: "None" },
  { name: "Face ID", displayName: "Face ID", rule: "None" },
  { name: "WeChat", displayName: "WeChat", rule: "Tab" },
];

const SIGNIN_METHOD_RULES: Record<string, { value: string; label: string }[]> = {
  "Password": [{ value: "All", label: "All" }, { value: "Non-LDAP", label: "Non-LDAP" }, { value: "Hide password", label: "Hide password" }],
  "Verification code": [{ value: "All", label: "All" }, { value: "Email only", label: "Email only" }, { value: "Phone only", label: "Phone only" }],
  "WeChat": [{ value: "Tab", label: "Tab" }, { value: "Login page", label: "Login page" }],
};

const SIGNUP_ITEM_NAMES = [
  "ID", "Username", "Display name", "First name", "Last name", "Affiliation",
  "Gender", "Bio", "Tag", "Education", "Country/Region", "ID card",
  "Password", "Confirm password", "Email", "Phone", "Email or Phone",
  "Phone or Email", "Invitation code", "Agreement", "Signup button", "Providers",
];

const SIGNUP_ITEM_RULES: Record<string, { value: string; label: string }[]> = {
  "ID": [{ value: "Random", label: "Random" }, { value: "Incremental", label: "Incremental" }],
  "Display name": [{ value: "None", label: "None" }, { value: "Real name", label: "Real name" }, { value: "First, last", label: "First, last" }],
  "Email": [{ value: "Normal", label: "Normal" }, { value: "No verification", label: "No verification" }],
  "Phone": [{ value: "Normal", label: "Normal" }, { value: "No verification", label: "No verification" }],
  "Agreement": [{ value: "None", label: "None" }, { value: "Signin", label: "Signin" }, { value: "Signin (Default True)", label: "Signin (Default True)" }],
  "Providers": [{ value: "big", label: "Big" }, { value: "small", label: "Small" }],
};

const SIGNIN_ITEM_NAMES = [
  "Signin methods", "Logo", "Back button", "Languages", "Username", "Password",
  "Verification code", "Providers", "Agreement", "Forgot password?", "Login button",
  "Signup link", "Captcha", "Auto sign in", "Select organization",
];

const SIGNIN_ITEM_RULES: Record<string, { value: string; label: string }[]> = {
  "Providers": [{ value: "big", label: "Big" }, { value: "small", label: "Small" }],
  "Captcha": [{ value: "pop up", label: "Pop up" }, { value: "inline", label: "Inline" }],
  "Forgot password?": [{ value: "None", label: "Auto sign in - True" }, { value: "Auto sign in - False", label: "Auto sign in - False" }],
  "Languages": [{ value: "None", label: "Default" }, { value: "Label", label: "Label" }],
};

export default function ApplicationEditPage() {
  const { owner: orgName, name } = useParams<{ owner: string; name: string }>();
  const isNew = !name || name === "new";
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const { orgOptions, isGlobalAdmin } = useOrganization();
  const queryClient = useQueryClient();
  const [app, setApp] = useState<AppData>({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");
  const [activeTab, setActiveTab] = useState("basic");
  const [samlMetadata, setSamlMetadata] = useState("");
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [groupOptions, setGroupOptions] = useState<{ value: string; label: string }[]>([]);
  const [certOptions, setCertOptions] = useState<{ value: string; label: string }[]>([]);
  const [orgProviders, setOrgProviders] = useState<Provider[]>([]);

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ["applications"] });

  const fetchData = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const res = await AppBackend.getApplication("admin", name!);
      if (res.status === "ok" && res.data) {
        const application = res.data;
        if (!application.grantTypes?.length) {
          application.grantTypes = ["authorization_code"];
        }
        if (!application.tags) {
          application.tags = [];
        }
        setApp(application);
        setOriginalJson(JSON.stringify(application));
      }
    } catch (e: any) { modal.toast(e?.message || t("common.saveFailed" as any), "error"); }
    finally { setLoading(false); }
  }, [name, isNew]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch groups for the application's organization
  useEffect(() => {
    const orgOwner = app.organization || orgName;
    if (!orgOwner) return;
    GroupBackend.getGroups({ owner: orgOwner, pageSize: 100 }).then((res) => {
      if (res.status === "ok" && Array.isArray(res.data)) {
        setGroupOptions(res.data.map((g) => ({
          value: `${g.owner}/${g.name}`,
          label: `${g.type === "Physical" ? "📁" : "📂"} ${g.displayName || g.name}`,
        })));
      }
    }).catch(() => {});
  }, [app.organization, orgName]);

  // Fetch certs for the application's organization
  useEffect(() => {
    const certOwner = app.isShared ? "admin" : (app.organization || orgName);
    if (!certOwner) return;
    CertBackend.getCerts({ owner: certOwner, pageSize: 100 }).then((res) => {
      if (res.status === "ok" && Array.isArray(res.data)) {
        setCertOptions(res.data.map((c) => ({ value: c.name, label: c.name })));
      }
    }).catch(() => {});
  }, [app.organization, app.isShared, orgName]);

  // Fetch providers for the application's organization
  useEffect(() => {
    const provOwner = app.isShared ? "admin" : (app.organization || orgName);
    if (!provOwner) return;
    ProviderBackend.getProviders({ owner: provOwner, pageSize: -1 }).then((res) => {
      if (res.status === "ok" && Array.isArray(res.data)) {
        setOrgProviders(res.data);
      }
    }).catch(() => {});
  }, [app.organization, app.isShared, orgName]);

  const fetchSamlMetadata = useCallback(async () => {
    if (!name) return;
    setLoadingMetadata(true);
    try {
      const xml = await AppBackend.getSamlMetadata("admin", name, !!app.enableSamlPostBinding);
      setSamlMetadata(xml);
    } catch { setSamlMetadata(""); }
    finally { setLoadingMetadata(false); }
  }, [name, app.enableSamlPostBinding]);

  useEffect(() => {
    if (!isNew && name && !samlMetadata && !loadingMetadata) {
      fetchSamlMetadata();
    }
  }, [isNew, name, samlMetadata, loadingMetadata, fetchSamlMetadata]);

  const set = (key: string, val: unknown) => setApp((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = isNew
        ? await AppBackend.addApplication(app as Application)
        : await AppBackend.updateApplication(app.owner || "admin", name!, app as Application);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(app));
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
        ? await AppBackend.addApplication(app as Application)
        : await AppBackend.updateApplication(app.owner || "admin", name!, app as Application);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/applications");
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
      await AppBackend.deleteApplication(app as Application);
      invalidateList();
    }
    navigate("/applications");
  };

  const handleDelete = async () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await AppBackend.deleteApplication(app as Application);
        if (res.status === "ok") {
          invalidateList();
          navigate("/applications");
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      } catch (e: any) {
        modal.toast(e?.message || t("common.deleteFailed" as any), "error");
      }
    });
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    modal.toast(t("common.copySuccess" as any));
  };

  const isDirty = originalJson !== "" && JSON.stringify(app) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const tabs = [
    { key: "basic", label: t("apps.tab.basic" as any) },
    { key: "auth", label: t("apps.tab.auth" as any) },
    { key: "oauth", label: t("apps.tab.oauth" as any) },
    { key: "saml", label: t("apps.tab.saml" as any) },
    { key: "providers", label: t("apps.tab.providers" as any) },
    { key: "ui", label: t("apps.tab.ui" as any) },
    { key: "security", label: t("apps.tab.security" as any) },
    { key: "proxy", label: t("apps.tab.proxy" as any) },
  ];

  // ── Basic Tab ──
  const basicTab = (
    <div className="space-y-5">
      <FormSection title={t("field.name")}>
        <FormField label={t("field.owner")}>
          <SimpleSelect value={String(app.organization ?? "")} options={[{ value: "", label: "—" }, ...orgOptions.map((o) => ({ value: o.name, label: o.displayName || o.name }))]} onChange={(v) => set("organization", v)} disabled={!isGlobalAdmin} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input
            value={String(app.name ?? "")}
            onChange={(e) => set("name", e.target.value)}
            disabled={app.name === "app-built-in"}
            className={monoInputClass}
            placeholder={t("help.placeholder.name" as any)}
          />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={String(app.displayName ?? "")} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("apps.field.category" as any)}>
          <SimpleSelect
            value={String(app.category ?? "Default")}
            options={[{ value: "Default", label: "Default" }, { value: "Agent", label: "Agent" }]}
            onChange={(v) => {
              set("category", v);
              if (v === "Agent") {
                set("type", "MCP");
              } else {
                set("type", "All");
              }
            }}
          />
        </FormField>
        <FormField label={t("field.type")}>
          <SimpleSelect value={String(app.type ?? "")} options={(app.category === "Agent"
              ? ["MCP", "A2A"]
              : ["All", "OIDC", "OAuth", "SAML", "CAS"]
            ).map((v) => ({ value: v, label: v }))} onChange={(v) => set("type", v)} />
        </FormField>
        <FormField label={t("apps.field.isShared" as any)}>
          <Switch checked={!!app.isShared} onChange={(v) => set("isShared", v)} />
        </FormField>
        <FormField label={t("field.description")} span="full">
          <textarea value={String(app.description ?? "")} onChange={(e) => set("description", e.target.value)} rows={2} className={inputClass} />
        </FormField>
      </FormSection>

      <FormSection title={t("apps.section.branding" as any)}>
        <FormField label={t("apps.field.logo" as any)} span="full">
          <ImageUrlInput value={String(app.logo ?? "")} onChange={(v) => set("logo", v)} owner={String(app.organization ?? "")} tag="app-logo" outputWidth={500} outputHeight={250} />
        </FormField>
        <FormField label={t("apps.field.title" as any)}>
          <input value={String(app.title ?? "")} onChange={(e) => set("title", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("apps.field.favicon" as any)}>
          <ImageUrlInput value={String(app.favicon ?? "")} onChange={(v) => set("favicon", v)} owner={String(app.organization ?? "")} tag="app-favicon" outputWidth={64} outputHeight={64} accept="image/x-icon,image/png,image/svg+xml" />
        </FormField>
        <FormField label={t("apps.field.homepageUrl")} span="full">
          <input value={String(app.homepageUrl ?? "")} onChange={(e) => set("homepageUrl", e.target.value)} className={inputClass} placeholder={t("help.placeholder.homepageUrl" as any)} />
        </FormField>
        <FormField label={t("apps.field.organization")}>
          <input value={String(app.organization ?? "")} onChange={(e) => set("organization", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("apps.field.tags" as any)}>
          <input
            value={Array.isArray(app.tags) ? app.tags.join(", ") : ""}
            onChange={(e) => set("tags", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            className={inputClass}
            placeholder="tag1, tag2, ..."
          />
        </FormField>
        <FormField label={t("apps.field.order" as any)}>
          <input type="number" value={app.order ?? 0} onChange={(e) => set("order", Number(e.target.value))} min={0} step={1} className={monoInputClass} />
        </FormField>
      </FormSection>
    </div>
  );

  // ── Authentication Tab ──
  const authTab = (
    <div className="space-y-5">
      <FormSection title={t("apps.section.signin" as any)}>
        <FormField label={t("apps.field.cookieExpireHours" as any)}>
          <input type="number" value={app.cookieExpireInHours ?? 720} onChange={(e) => set("cookieExpireInHours", Number(e.target.value))} min={1} step={1} className={monoInputClass} />
        </FormField>
        <FormField label={t("apps.field.defaultGroup" as any)}>
          <SingleSearchSelect
            value={String(app.defaultGroup ?? "")}
            options={groupOptions}
            onChange={(v) => set("defaultGroup", v)}
            placeholder={t("common.search" as any)}
          />
        </FormField>
        <FormField label={t("apps.field.enableSignUp")}>
          <Switch checked={!!app.enableSignUp} onChange={(v) => set("enableSignUp", v)} />
        </FormField>
        <FormField label={t("apps.field.disableSignin" as any)}>
          <Switch checked={!!app.disableSignin} onChange={(v) => set("disableSignin", v)} />
        </FormField>
        <FormField label={t("apps.field.enableGuestSignin" as any)}>
          <Switch checked={!!app.enableGuestSignin} onChange={(v) => set("enableGuestSignin", v)} />
        </FormField>
        <FormField label={t("apps.field.enableExclusiveSignin" as any)}>
          <Switch checked={!!app.enableExclusiveSignin} onChange={(v) => set("enableExclusiveSignin", v)} />
        </FormField>
        <FormField label={t("apps.field.enableSigninSession" as any)}>
          <Switch
            checked={!!app.enableSigninSession}
            onChange={(v) => {
              if (!v) set("enableAutoSignin", false);
              set("enableSigninSession", v);
            }}
          />
        </FormField>
        <FormField label={t("apps.field.enableAutoSignin")} help={t("help.requiresSigninSession" as any)}>
          <Switch
            checked={!!app.enableAutoSignin}
            onChange={(v) => set("enableAutoSignin", v)}
            disabled={!app.enableSigninSession}
          />
        </FormField>
        <FormField label={t("apps.field.enablePassword")}>
          <Switch checked={!!app.enablePassword} onChange={(v) => set("enablePassword", v)} />
        </FormField>
        <FormField label={t("apps.field.enableCodeSignin")}>
          <Switch checked={!!app.enableCodeSignin} onChange={(v) => set("enableCodeSignin", v)} />
        </FormField>
        <FormField label={t("apps.field.enableLinkWithEmail" as any)}>
          <Switch checked={!!app.enableLinkWithEmail} onChange={(v) => set("enableLinkWithEmail", v)} />
        </FormField>
      </FormSection>

      <FormSection title={t("apps.section.urls" as any)}>
        <FormField label={t("apps.field.signupUrl")} span="full">
          <input value={String(app.signupUrl ?? "")} onChange={(e) => set("signupUrl", e.target.value)} className={inputClass} placeholder={t("help.placeholder.signupUrl" as any)} />
        </FormField>
        <FormField label={t("apps.field.signinUrl")} span="full">
          <input value={String(app.signinUrl ?? "")} onChange={(e) => set("signinUrl", e.target.value)} className={inputClass} placeholder={t("help.placeholder.signinUrl" as any)} />
        </FormField>
        <FormField label={t("apps.field.forgetUrl")} span="full">
          <input value={String(app.forgetUrl ?? "")} onChange={(e) => set("forgetUrl", e.target.value)} className={inputClass} placeholder={t("help.placeholder.forgetUrl" as any)} />
        </FormField>
        <FormField label={t("apps.field.affiliationUrl" as any)} span="full">
          <input value={String(app.affiliationUrl ?? "")} onChange={(e) => set("affiliationUrl", e.target.value)} className={inputClass} placeholder={t("help.placeholder.url" as any)} />
        </FormField>
      </FormSection>
    </div>
  );

  // ── OAuth Tab ──
  const oauthTab = (
    <div className="space-y-5">
      <FormSection title={t("apps.section.credentials" as any)}>
        <FormField label={t("apps.field.clientId")} span="full">
          <div className="flex gap-2">
            <input value={String(app.clientId ?? "")} onChange={(e) => set("clientId", e.target.value)} className={`${monoInputClass} flex-1`} />
            <button onClick={() => copyText(String(app.clientId ?? ""))} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.copy" as any)}>
              <Copy size={14} />
            </button>
          </div>
        </FormField>
        <FormField label={t("apps.field.clientSecret")} span="full">
          <div className="flex gap-2">
            <input value={String(app.clientSecret ?? "")} onChange={(e) => set("clientSecret", e.target.value)} type="password" className={`${monoInputClass} flex-1`} />
            <button onClick={() => copyText(String(app.clientSecret ?? ""))} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.copy" as any)}>
              <Copy size={14} />
            </button>
          </div>
        </FormField>
      </FormSection>

      <FormSection title={t("apps.section.redirectUris" as any)}>
        <FormField label={t("apps.field.redirectUris")} span="full">
          <RedirectUriEditor
            uris={Array.isArray(app.redirectUris) ? app.redirectUris : []}
            onChange={(v) => set("redirectUris", v)}
          />
        </FormField>
        <FormField label={t("apps.field.forcedRedirectOrigin" as any)} span="full">
          <input value={String(app.forcedRedirectOrigin ?? "")} onChange={(e) => set("forcedRedirectOrigin", e.target.value)} className={inputClass} placeholder={t("help.placeholder.url" as any)} />
        </FormField>
      </FormSection>

      <FormSection title={t("apps.section.tokenConfig" as any)}>
        <FormField label={t("apps.field.grantTypes")} span="full">
          <div className="flex flex-wrap gap-2">
            {GRANT_TYPES.map((gt) => {
              const selected = (app.grantTypes ?? []).includes(gt.id);
              return (
                <button
                  key={gt.id}
                  type="button"
                  onClick={() => {
                    const current = app.grantTypes ?? [];
                    set("grantTypes", selected ? current.filter((g) => g !== gt.id) : [...current, gt.id]);
                  }}
                  className={`rounded-md border px-2.5 py-1 text-[12px] font-mono font-medium transition-colors ${
                    selected
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border bg-surface-2 text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {gt.name}
                </button>
              );
            })}
          </div>
        </FormField>
        <FormField label={t("apps.field.tokenFormat")}>
          <SimpleSelect value={String(app.tokenFormat ?? "JWT")} options={TOKEN_FORMATS.map((f) => ({ value: f, label: f }))} onChange={(v) => set("tokenFormat", v)} />
        </FormField>
        <FormField label={t("apps.field.signingMethod" as any)}>
          <SimpleSelect value={String(app.tokenSigningMethod || "RS256")} options={SIGNING_METHODS.map((m) => ({ value: m, label: m }))} onChange={(v) => set("tokenSigningMethod", v)} />
        </FormField>
        {app.tokenFormat === "JWT-Custom" && (
          <FormField label={t("apps.field.tokenFields" as any)} span="full">
            <input
              value={Array.isArray(app.tokenFields) ? app.tokenFields.join(", ") : ""}
              onChange={(e) => set("tokenFields", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              className={inputClass}
              placeholder="signinMethod, provider, name, ..."
            />
          </FormField>
        )}
        {app.tokenFormat === "JWT-Custom" && (
          <div className="col-span-2">
            <EditableTable
              title={t("apps.oauth.tokenAttributes" as any)}
              columns={[
                { key: "name", title: t("col.name" as any), width: "25%", placeholder: "e.g., department" },
                { key: "category", title: t("apps.oauth.category" as any), width: "20%", type: "select", options: TOKEN_ATTR_CATEGORIES },
                {
                  key: "value", title: t("col.value" as any), width: "30%",
                  render: (row, _i, onChange) => (
                    row.category === "Existing Field"
                      ? <SimpleSelect value={String(row.value ?? "")} options={TOKEN_ATTR_USER_FIELDS.map((f) => ({ value: f, label: f }))} onChange={(v) => onChange("value", v)} />
                      : <input value={String(row.value ?? "")} onChange={(e) => onChange("value", e.target.value)} className={`${inputClass} !py-1 !text-[12px]`} />
                  ),
                },
                { key: "type", title: t("field.type" as any), width: "15%", type: "select", options: TOKEN_ATTR_TYPES },
              ]}
              rows={(app.tokenAttributes as Record<string, unknown>[]) ?? []}
              onChange={(rows) => set("tokenAttributes", rows)}
              newRow={() => ({ name: "", value: "", type: "Array", category: "Static Value" })}
            />
          </div>
        )}
        <FormField label={t("apps.field.expireInHours")} help={t("help.tokenLifetime" as any)}>
          <input type="number" value={app.expireInHours ?? 168} onChange={(e) => set("expireInHours", Number(e.target.value))} min={0.01} step={0.01} className={monoInputClass} />
        </FormField>
        <FormField label={t("apps.field.refreshExpireHours" as any)}>
          <input type="number" value={app.refreshExpireInHours ?? 168} onChange={(e) => set("refreshExpireInHours", Number(e.target.value))} min={0.01} step={0.01} className={monoInputClass} />
        </FormField>
      </FormSection>

      {/* Scopes table — only for Agent category */}
      {app.category === "Agent" && (
        <EditableTable
          title={t("apps.oauth.scopes" as any)}
          columns={[
            { key: "name", title: t("col.name" as any), width: "20%", placeholder: "e.g., files:read" },
            { key: "displayName", title: t("col.displayName" as any), width: "20%", placeholder: "e.g., Read Files" },
            { key: "description", title: t("field.description" as any), width: "30%", placeholder: "e.g., Allow reading your files" },
            { key: "tools", title: t("apps.oauth.tools" as any), width: "20%",
              render: (row, _i, onChange) => (
                <input
                  value={Array.isArray(row.tools) ? (row.tools as string[]).join(", ") : String(row.tools ?? "")}
                  onChange={(e) => onChange("tools", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))}
                  placeholder="tool1, tool2, ..."
                  className={`${inputClass} !py-1 !text-[12px]`}
                />
              ),
            },
          ]}
          rows={(app.scopes as Record<string, unknown>[]) ?? []}
          onChange={(rows) => set("scopes", rows)}
          newRow={() => ({ name: "", displayName: "", description: "", tools: [] })}
        />
      )}
    </div>
  );

  // ── SAML Tab ──
  const samlAttributeColumns: EditableColumn<Record<string, unknown>>[] = [
    { key: "Name", title: t("col.name" as any), width: "25%", placeholder: "e.g., email" },
    {
      key: "nameFormat", title: t("apps.saml.nameFormat" as any), width: "30%", type: "select",
      options: SAML_NAME_FORMATS,
    },
    {
      key: "value", title: t("col.value" as any), width: "30%",
      render: (row, _i, onChange) => (
        <AutocompleteInput
          value={String(row.value ?? "")}
          onChange={(v) => onChange("value", v)}
          suggestions={SAML_USER_VARIABLES}
          placeholder="e.g., $user.email"
        />
      ),
    },
  ];

  const samlTab = (
    <div className="space-y-5">
      <FormSection title={t("apps.section.saml" as any)}>
        <FormField label={t("apps.field.samlReplyUrl" as any)} span="full">
          <input value={String(app.samlReplyUrl ?? "")} onChange={(e) => set("samlReplyUrl", e.target.value)} className={inputClass} placeholder={t("help.placeholder.samlReplyUrl" as any)} />
        </FormField>
        <FormField label={t("apps.field.enableSamlCompress" as any)}>
          <Switch checked={!!app.enableSamlCompress} onChange={(v) => set("enableSamlCompress", v)} />
        </FormField>
        <FormField label={t("apps.field.enableSamlC14n" as any)}>
          <Switch checked={!!app.enableSamlC14n10} onChange={(v) => set("enableSamlC14n10", v)} />
        </FormField>
        <FormField label={t("apps.field.useEmailSamlNameId" as any)}>
          <Switch checked={!!app.useEmailAsSamlNameId} onChange={(v) => set("useEmailAsSamlNameId", v)} />
        </FormField>
        <FormField label={t("apps.field.enableSamlPostBinding" as any)}>
          <Switch
            checked={!!app.enableSamlPostBinding}
            onChange={(v) => {
              set("enableSamlPostBinding", v);
              setSamlMetadata(""); // triggers re-fetch
            }}
          />
        </FormField>
        <FormField label={t("apps.field.samlHashAlgorithm" as any)}>
          <SimpleSelect value={String(app.samlHashAlgorithm ?? "")} options={SAML_HASH_ALGORITHMS.map((a) => ({ value: a, label: a }))} onChange={(v) => set("samlHashAlgorithm", v)} />
        </FormField>
        <FormField label={t("apps.field.disableSamlAttributes" as any)}>
          <Switch checked={!!app.disableSamlAttributes} onChange={(v) => set("disableSamlAttributes", v)} />
        </FormField>
        <FormField label={t("apps.field.enableSamlAssertionSig" as any)}>
          <Switch checked={!!app.enableSamlAssertionSignature} onChange={(v) => set("enableSamlAssertionSignature", v)} />
        </FormField>
      </FormSection>

      {/* SAML Attributes Table */}
      {!app.disableSamlAttributes && (
        <EditableTable
          title={t("apps.saml.attributes" as any)}
          columns={samlAttributeColumns}
          rows={(app.samlAttributes as Record<string, unknown>[]) ?? []}
          onChange={(rows) => set("samlAttributes", rows)}
          newRow={() => ({ Name: "", nameFormat: "", value: "" })}
        />
      )}

      {/* SAML Metadata */}
      <FormSection title={t("apps.saml.metadata" as any)}>
        <FormField label="" span="full">
          <div className="space-y-3">
            <textarea
              value={samlMetadata}
              readOnly
              rows={12}
              className={`${inputClass} font-mono text-[11px] bg-surface-2 cursor-default whitespace-pre`}
              placeholder={loadingMetadata ? t("common.loading" as any) : t("apps.saml.metadataPlaceholder" as any)}
            />
            <button
              onClick={() => {
                const url = `${window.location.origin}/api/saml/metadata?application=admin/${encodeURIComponent(name!)}&enablePostBinding=${!!app.enableSamlPostBinding}`;
                navigator.clipboard.writeText(url);
                modal.toast(t("common.copySuccess" as any));
              }}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors"
            >
              <Copy size={13} /> {t("apps.saml.copyMetadataUrl" as any)}
            </button>
          </div>
        </FormField>
      </FormSection>
    </div>
  );

  // ── Providers Tab ──
  const providerItems = (app.providers as any[]) ?? [];
  const usedProviderNames = providerItems.map((p: any) => p.name);
  const availableProviders = orgProviders.filter((p) => !usedProviderNames.includes(p.name));

  const getProviderObj = (name: string): Provider | undefined =>
    orgProviders.find((p) => p.name === name);

  const getRuleOptions = (prov: Provider | undefined): { value: string; label: string }[] | null => {
    if (!prov) return null;
    if (prov.type === "Google") return [{ value: "Default", label: t("apps.providers.rule.default" as any) }, { value: "OneTap", label: "OneTap" }];
    if (prov.category === "Captcha") return [
      { value: "None", label: t("apps.providers.rule.none" as any) },
      { value: "Dynamic", label: t("apps.providers.rule.dynamic" as any) },
      { value: "Always", label: t("apps.providers.rule.always" as any) },
      { value: "Internet-Only", label: t("apps.providers.rule.internetOnly" as any) },
    ];
    if (prov.category === "SMS" || prov.category === "Email") return [
      { value: "All", label: t("apps.providers.rule.all" as any) },
      { value: "signup", label: t("apps.providers.rule.signup" as any) },
      { value: "login", label: t("apps.providers.rule.login" as any) },
      { value: "forget", label: t("apps.providers.rule.forget" as any) },
      { value: "reset", label: t("apps.providers.rule.reset" as any) },
      { value: "mfaSetup", label: t("apps.providers.rule.mfaSetup" as any) },
      { value: "mfaAuth", label: t("apps.providers.rule.mfaAuth" as any) },
    ];
    return null;
  };

  const isOAuthLike = (cat?: string) => cat === "OAuth" || cat === "Web3" || cat === "SAML";

  const updateProvider = (index: number, key: string, val: unknown) => {
    const next = [...providerItems];
    next[index] = { ...next[index], [key]: val };
    set("providers", next);
  };

  const providersTab = (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface-1 overflow-visible">
        {/* Title bar */}
        <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between">
          <h4 className="text-[13px] font-semibold text-text-primary">{t("apps.section.providers" as any)}</h4>
          <button
            onClick={() => {
              set("providers", [...providerItems, { name: "", canSignUp: true, canSignIn: true, canUnlink: true, prompted: false, signupGroup: "", rule: "None" }]);
            }}
            className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors"
          >
            <Plus size={13} /> {t("common.add")}
          </button>
        </div>

        {/* Provider rows */}
        {providerItems.length === 0 && (
          <div className="py-6 text-center text-[12px] text-text-muted">{t("common.noData")}</div>
        )}
        {providerItems.map((item: any, i: number) => {
          const prov = getProviderObj(item.name);
          const cat = prov?.category;
          const ruleOptions = getRuleOptions(prov);
          const showOAuthFields = isOAuthLike(cat);

          return (
            <div key={i} className="border-b border-border last:border-b-0 px-4 py-3 space-y-2">
              {/* Row 1: Name selector + category/type badges */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SingleSearchSelect
                    value={item.name ?? ""}
                    options={[
                      ...(item.name && prov ? [{ value: prov.name, label: prov.displayName && prov.displayName !== prov.name ? `${prov.name} (${prov.displayName})` : prov.name }] : []),
                      ...availableProviders.map((p) => ({
                        value: p.name,
                        label: p.displayName && p.displayName !== p.name ? `${p.name} (${p.displayName})` : p.name,
                      })),
                    ]}
                    onChange={(v) => {
                      const selected = orgProviders.find((p) => p.name === v);
                      const next = [...providerItems];
                      next[i] = { ...next[i], name: v };
                      if (selected && (selected.category === "Email" || selected.category === "SMS")) {
                        next[i].rule = "All";
                      }
                      set("providers", next);
                    }}
                    placeholder={t("apps.providers.selectProvider" as any)}
                  />
                </div>
                {cat && (
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-text-secondary">{cat}</span>
                )}
                {prov?.type && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">{prov.type}</span>
                )}
                <button
                  onClick={() => set("providers", providerItems.filter((_: any, j: number) => j !== i))}
                  className="rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Row 2: Conditional fields based on provider category */}
              {(showOAuthFields || cat === "SMS" || ruleOptions) && (
                <div className="flex items-center gap-3 flex-wrap text-[11px]">
                  {/* SMS: Country/Region codes */}
                  {cat === "SMS" && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-text-muted font-medium">{t("apps.providers.countryCodes" as any)}</span>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(item.countryCodes) && item.countryCodes.length > 0 ? item.countryCodes : ["All"]).map((code: string, ci: number) => (
                          <span key={ci} className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-mono">{code}</span>
                        ))}
                        <input
                          value=""
                          onChange={() => {}}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                              const val = (e.target as HTMLInputElement).value.trim();
                              const codes = Array.isArray(item.countryCodes) ? item.countryCodes : [];
                              updateProvider(i, "countryCodes", [...codes.filter((c: string) => c !== "All"), val]);
                              (e.target as HTMLInputElement).value = "";
                            }
                          }}
                          placeholder="+"
                          className={`${inputClass} !py-0.5 !text-[10px] !px-1.5 w-12`}
                        />
                      </div>
                    </div>
                  )}

                  {/* OAuth/Web3/SAML: canSignUp/canSignIn/canUnlink/prompted/bindingRule */}
                  {showOAuthFields && (
                    <>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={!!item.canSignUp} onChange={(e) => updateProvider(i, "canSignUp", e.target.checked)} className="rounded" />
                        {t("apps.providers.canSignUp" as any)}
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={!!item.canSignIn} onChange={(e) => updateProvider(i, "canSignIn", e.target.checked)} className="rounded" />
                        {t("apps.providers.canSignIn" as any)}
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={!!item.canUnlink} onChange={(e) => updateProvider(i, "canUnlink", e.target.checked)} className="rounded" />
                        {t("apps.providers.canUnlink" as any)}
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={!!item.prompted} onChange={(e) => updateProvider(i, "prompted", e.target.checked)} className="rounded" />
                        {t("apps.providers.prompted" as any)}
                      </label>
                      {/* Binding rule multi-select */}
                      <div className="flex items-center gap-1">
                        <span className="text-text-muted font-medium">{t("apps.providers.bindingRule" as any)}</span>
                        {["Email", "Name", "Phone"].map((opt) => {
                          const rules: string[] = Array.isArray(item.bindingRule) ? item.bindingRule : ["Email", "Phone", "Name"];
                          const checked = rules.includes(opt);
                          return (
                            <label key={opt} className="flex items-center gap-0.5">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked ? [...rules, opt] : rules.filter((r: string) => r !== opt);
                                  updateProvider(i, "bindingRule", next);
                                }}
                                className="rounded"
                              />
                              {opt}
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* OAuth/Web3 only: signupGroup */}
                  {(cat === "OAuth" || cat === "Web3") && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-text-muted font-medium">{t("apps.providers.signupGroup" as any)}</span>
                      <div className="w-64">
                        <SingleSearchSelect
                          value={item.signupGroup ?? ""}
                          options={groupOptions}
                          onChange={(v) => updateProvider(i, "signupGroup", v)}
                          placeholder={t("common.search" as any)}
                        />
                      </div>
                    </div>
                  )}

                  {/* Rule dropdown (varies by type) */}
                  {ruleOptions && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-text-muted font-medium">{t("apps.ui.rule" as any)}</span>
                      <div className="w-32">
                        <SimpleSelect
                          value={item.rule ?? "None"}
                          options={ruleOptions}
                          onChange={(v) => updateProvider(i, "rule", v)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── UI Customization Tab ──

  const existingSigninMethodNames = ((app.signinMethods as any[]) ?? []).map((m: any) => m.name);
  const availableSigninMethods = SIGNIN_METHOD_OPTIONS.filter((m) => !existingSigninMethodNames.includes(m.name));

  const signinMethodColumns: EditableColumn<Record<string, unknown>>[] = [
    {
      key: "name", title: t("col.name" as any), width: "30%",
      render: (row, _i, onChange) => {
        const available = [...availableSigninMethods, ...(row.name ? [SIGNIN_METHOD_OPTIONS.find((m) => m.name === row.name)].filter(Boolean) : [])];
        return (
          <SimpleSelect
            value={String(row.name ?? "")}
            options={available.map((m: any) => ({ value: m.name, label: m.name }))}
            onChange={(v) => {
              const def = SIGNIN_METHOD_OPTIONS.find((m) => m.name === v);
              onChange("name", v);
              if (def) {
                onChange("displayName", def.displayName);
                onChange("rule", def.rule);
              }
            }}
          />
        );
      },
    },
    { key: "displayName", title: t("col.displayName" as any), width: "30%" },
    {
      key: "rule", title: t("apps.ui.rule" as any), width: "25%",
      render: (row, _i, onChange) => {
        const rules = SIGNIN_METHOD_RULES[String(row.name)] ?? [];
        if (rules.length === 0) {
          return <span className="text-[12px] text-text-muted">—</span>;
        }
        return <SimpleSelect value={String(row.rule ?? "None")} options={rules} onChange={(v) => onChange("rule", v)} />;
      },
    },
  ];

  const signinItemColumns: EditableColumn<Record<string, unknown>>[] = [
    {
      key: "name", title: t("col.name" as any), width: "25%",
      render: (row, _i, onChange) => {
        if (row.isCustom) {
          return <input value={String(row.name ?? "")} disabled className={`${inputClass} !py-1 !text-[12px] opacity-60`} />;
        }
        const usedNames = ((app.signinItems as any[]) ?? []).filter((it: any) => !it.isCustom && it.name !== row.name).map((it: any) => it.name);
        const available = SIGNIN_ITEM_NAMES.filter((n) => !usedNames.includes(n));
        return (
          <SimpleSelect
            value={String(row.name ?? "")}
            options={available.map((n) => ({ value: n, label: n }))}
            onChange={(v) => {
              onChange("name", v);
              if (v === "Captcha") onChange("rule", "pop up");
            }}
          />
        );
      },
    },
    { key: "visible", title: t("apps.ui.visible" as any), width: "10%", type: "switch" },
    {
      key: "label", title: t("apps.ui.label" as any), width: "20%",
      visible: (row) => {
        const n = String(row.name);
        return !!row.isCustom || n.startsWith("Text ") || ["Username", "Password", "Verification code", "Signup link", "Forgot password?", "Login button"].includes(n);
      },
    },
    {
      key: "rule", title: t("apps.ui.rule" as any), width: "20%",
      render: (row, _i, onChange) => {
        const rules = SIGNIN_ITEM_RULES[String(row.name)] ?? [];
        if (rules.length === 0) return <span className="text-[12px] text-text-muted">—</span>;
        return <SimpleSelect value={String(row.rule ?? "None")} options={rules} onChange={(v) => onChange("rule", v)} />;
      },
    },
  ];

  const signupItemColumns: EditableColumn<Record<string, unknown>>[] = [
    {
      key: "name", title: t("col.name" as any), width: "22%",
      render: (row, _i, onChange) => {
        const usedNames = ((app.signupItems as any[]) ?? []).filter((it: any) => it.name !== row.name).map((it: any) => it.name);
        const available = SIGNUP_ITEM_NAMES.filter((n) => !usedNames.includes(n));
        return <SimpleSelect value={String(row.name ?? "")} options={available.map((n) => ({ value: n, label: n }))} onChange={(v) => onChange("name", v)} />;
      },
    },
    {
      key: "visible", title: t("apps.ui.visible" as any), width: "10%", type: "switch",
      visible: (row) => row.name !== "ID",
    },
    {
      key: "required", title: t("apps.ui.required" as any), width: "10%", type: "switch",
      visible: (row) => !!row.visible && !["Signup button", "Providers", "ID"].includes(String(row.name)),
      disabled: (row) => row.name === "Password",
    },
    {
      key: "rule", title: t("apps.ui.rule" as any), width: "20%",
      render: (row, _i, onChange) => {
        const rules = SIGNUP_ITEM_RULES[String(row.name)] ?? [];
        if (rules.length === 0) return <span className="text-[12px] text-text-muted">—</span>;
        return <SimpleSelect value={String(row.rule ?? "None")} options={rules} onChange={(v) => onChange("rule", v)} />;
      },
    },
    { key: "customCss", title: "CSS", width: "20%", placeholder: ".signup-xxx {}" },
  ];

  const uiTab = (
    <div className="space-y-5">
      <FormSection title={t("apps.section.signinUi" as any)}>
        <FormField label={t("apps.field.orgChoiceMode" as any)}>
          <SimpleSelect value={String(app.orgChoiceMode ?? "None")} options={[{ value: "None", label: "None" }, { value: "Select", label: "Select" }, { value: "Input", label: "Input" }]} onChange={(v) => set("orgChoiceMode", v)} />
        </FormField>
        <div className="col-span-2">
          <EditableTable
            title={t("apps.field.signinMethods" as any)}
            columns={signinMethodColumns}
            rows={(app.signinMethods as Record<string, unknown>[]) ?? []}
            onChange={(rows) => set("signinMethods", rows)}
            newRow={() => ({ name: "", displayName: "", rule: "None" })}
            minRows={1}
            disableAdd={availableSigninMethods.length === 0}
          />
        </div>
        <FormField label={t("apps.field.signupHtml" as any)} span="full">
          <textarea value={String(app.signupHtml ?? "")} onChange={(e) => set("signupHtml", e.target.value)} rows={3} className={`${inputClass} font-mono text-[12px]`} />
        </FormField>
        <FormField label={t("apps.field.signinHtml" as any)} span="full">
          <textarea value={String(app.signinHtml ?? "")} onChange={(e) => set("signinHtml", e.target.value)} rows={3} className={`${inputClass} font-mono text-[12px]`} />
        </FormField>
        <div className="col-span-2">
          <EditableTable
            title={t("apps.field.signinItems" as any)}
            columns={signinItemColumns}
            rows={(app.signinItems as Record<string, unknown>[]) ?? []}
            onChange={(rows) => set("signinItems", rows)}
            newRow={() => ({ name: "", visible: true, required: true, rule: "None" })}
            onAddCustom={() => {
              const items = (app.signinItems as Record<string, unknown>[]) ?? [];
              set("signinItems", [...items, { name: `Text ${Date.now()}`, visible: true, isCustom: true }]);
            }}
            addCustomLabel={t("apps.ui.addCustom" as any)}
          />
        </div>
      </FormSection>

      {!!app.enableSignUp && (
        <EditableTable
          title={t("apps.field.signupItems" as any)}
          columns={signupItemColumns}
          rows={(app.signupItems as Record<string, unknown>[]) ?? []}
          onChange={(rows) => set("signupItems", rows)}
          newRow={() => ({ name: "", visible: true, required: true, options: [], rule: "None", customCss: "" })}
        />
      )}

      <FormSection title={t("apps.section.formLayout" as any)}>
        <FormField label={t("apps.field.backgroundUrl" as any)} span="full">
          <div className="flex gap-3 items-start">
            <input value={String(app.formBackgroundUrl ?? "")} onChange={(e) => set("formBackgroundUrl", e.target.value)} className={`${inputClass} flex-1`} placeholder={t("help.placeholder.url" as any)} />
            {app.formBackgroundUrl && <img src={app.formBackgroundUrl as string} alt="" className="h-10 w-10 rounded-lg border border-border object-contain bg-surface-2" />}
          </div>
        </FormField>
        <FormField label={t("apps.field.backgroundUrlMobile" as any)} span="full">
          <div className="flex gap-3 items-start">
            <input value={String(app.formBackgroundUrlMobile ?? "")} onChange={(e) => set("formBackgroundUrlMobile", e.target.value)} className={`${inputClass} flex-1`} placeholder={t("help.placeholder.url" as any)} />
            {app.formBackgroundUrlMobile && <img src={app.formBackgroundUrlMobile as string} alt="" className="h-10 w-10 rounded-lg border border-border object-contain bg-surface-2" />}
          </div>
        </FormField>
        <FormField label={t("apps.field.customCss" as any)} span="full">
          <textarea value={String(app.formCss ?? "")} onChange={(e) => set("formCss", e.target.value)} rows={3} className={`${inputClass} font-mono text-[12px]`} />
        </FormField>
        <FormField label={t("apps.field.customCssMobile" as any)} span="full">
          <textarea value={String(app.formCssMobile ?? "")} onChange={(e) => set("formCssMobile", e.target.value)} rows={3} className={`${inputClass} font-mono text-[12px]`} />
        </FormField>
        <FormField label={t("apps.field.formPosition" as any)} span="full">
          <div className="flex gap-2">
            {([
              { value: 1, label: t("apps.formPosition.left" as any) },
              { value: 2, label: t("apps.formPosition.center" as any) },
              { value: 3, label: t("apps.formPosition.right" as any) },
              { value: 4, label: t("apps.formPosition.sidePanel" as any) },
            ] as const).map((pos) => (
              <button
                key={pos.value}
                type="button"
                onClick={() => set("formOffset", pos.value)}
                className={`rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  app.formOffset === pos.value
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-surface-2 text-text-muted hover:text-text-secondary"
                }`}
              >
                {pos.label}
              </button>
            ))}
          </div>
        </FormField>
        {app.formOffset === 4 && (
          <FormField label={t("apps.field.sidePanelHtml" as any)} span="full">
            <textarea value={String(app.formSideHtml ?? "")} onChange={(e) => set("formSideHtml", e.target.value)} rows={4} className={`${inputClass} font-mono text-[12px]`} />
          </FormField>
        )}
      </FormSection>

      <FormSection title={t("apps.section.htmlCustom" as any)}>
        <FormField label={t("apps.field.headerHtml" as any)} span="full">
          <textarea value={String(app.headerHtml ?? "")} onChange={(e) => set("headerHtml", e.target.value)} rows={3} className={`${inputClass} font-mono text-[12px]`} />
        </FormField>
        <FormField label={t("apps.field.footerHtml" as any)} span="full">
          <textarea value={String(app.footerHtml ?? "")} onChange={(e) => set("footerHtml", e.target.value)} rows={3} className={`${inputClass} font-mono text-[12px]`} />
        </FormField>
      </FormSection>
    </div>
  );

  // ── Security Tab ──
  const securityTab = (
    <div className="space-y-5">
      <FormSection title={t("apps.section.certs" as any)}>
        <FormField label={t("apps.field.tokenCert" as any)}>
          <SingleSearchSelect
            value={String(app.cert ?? "")}
            options={certOptions}
            onChange={(v) => set("cert", v)}
            placeholder={t("common.search" as any)}
          />
        </FormField>
        <FormField label={t("apps.field.clientCert" as any)}>
          <SingleSearchSelect
            value={String(app.clientCert ?? "")}
            options={certOptions}
            onChange={(v) => set("clientCert", v)}
            placeholder={t("common.search" as any)}
          />
        </FormField>
      </FormSection>

      <FormSection title={t("apps.section.signinLimits" as any)}>
        <FormField label={t("apps.field.failedSigninLimit" as any)} help={t("apps.help.failedSigninLimit" as any)}>
          <input type="number" value={app.failedSigninLimit ?? 0} onChange={(e) => set("failedSigninLimit", Number(e.target.value))} min={0} step={1} className={monoInputClass} />
        </FormField>
        <FormField label={t("apps.field.failedSigninFrozenTime" as any)} help={t("apps.help.failedSigninFrozenTime" as any)}>
          <input type="number" value={app.failedSigninFrozenTime ?? 0} onChange={(e) => set("failedSigninFrozenTime", Number(e.target.value))} min={0} step={1} className={monoInputClass} />
        </FormField>
        <FormField label={t("apps.field.codeResendTimeout" as any)} help={t("apps.help.codeResendTimeout" as any)}>
          <input type="number" value={app.codeResendTimeout ?? 0} onChange={(e) => set("codeResendTimeout", Number(e.target.value))} min={0} step={1} className={monoInputClass} />
        </FormField>
      </FormSection>

      <FormSection title={t("apps.section.ipSecurity" as any)}>
        <FormField label={t("apps.field.ipWhitelist" as any)} span="full">
          <input value={String(app.ipWhitelist ?? "")} onChange={(e) => set("ipWhitelist", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("apps.field.ipRestriction" as any)} span="full">
          <input value={String(app.ipRestriction ?? "")} onChange={(e) => set("ipRestriction", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      <FormSection title={t("apps.section.termsOfUse" as any)}>
        <FormField label={t("apps.field.termsOfUse" as any)} span="full">
          <input value={String(app.termsOfUse ?? "")} onChange={(e) => set("termsOfUse", e.target.value)} className={inputClass} placeholder={t("help.placeholder.url" as any)} />
        </FormField>
      </FormSection>
    </div>
  );

  // ── Reverse Proxy Tab ──
  const proxyTab = (
    <div className="space-y-5">
      <FormSection title={t("apps.section.domainConfig" as any)}>
        <FormField label={t("apps.field.domain" as any)} span="full">
          <input value={String(app.domain ?? "")} onChange={(e) => set("domain", e.target.value)} className={inputClass} placeholder={t("apps.help.domain" as any)} />
        </FormField>
        <FormField label={t("apps.field.otherDomains" as any)} span="full">
          <RedirectUriEditor
            uris={Array.isArray(app.otherDomains) ? app.otherDomains : []}
            onChange={(v) => set("otherDomains", v)}
          />
        </FormField>
      </FormSection>

      <FormSection title={t("apps.section.upstream" as any)}>
        <FormField label={t("apps.field.upstreamHost" as any)} span="full">
          <input value={String(app.upstreamHost ?? "")} onChange={(e) => set("upstreamHost", e.target.value)} className={inputClass} placeholder={t("apps.help.upstreamHost" as any)} />
        </FormField>
      </FormSection>

      <FormSection title={t("apps.section.ssl" as any)}>
        <FormField label={t("apps.field.sslMode" as any)}>
          <SimpleSelect value={String(app.sslMode ?? "")} options={SSL_MODES} onChange={(v) => set("sslMode", v)} />
        </FormField>
        <FormField label={t("apps.field.sslCert" as any)}>
          <SingleSearchSelect
            value={String(app.sslCert ?? "")}
            options={[{ value: "", label: "None" }, ...certOptions]}
            onChange={(v) => set("sslCert", v)}
            placeholder={t("common.search" as any)}
          />
        </FormField>
      </FormSection>
    </div>
  );

  const tabContent: Record<string, React.JSX.Element> = {
    basic: basicTab,
    auth: authTab,
    oauth: oauthTab,
    saml: samlTab,
    providers: providersTab,
    ui: uiTab,
    security: securityTab,
    proxy: proxyTab,
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
            <h1 className="text-xl font-bold tracking-tight">
              {isNew ? t("common.add") : t("common.edit")} {t("apps.title")}
            </h1>
            {!isNew && <p className="text-[13px] text-text-muted font-mono mt-0.5">{orgName}/{name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && app.name !== "app-built-in" && (
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

      {/* Tab Bar */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text-secondary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>{tabContent[activeTab]}</div>
    </motion.div>
  );
}

// ── Redirect URI editor sub-component ──
function RedirectUriEditor({ uris, onChange }: { uris: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      {uris.map((uri, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={uri}
            onChange={(e) => {
              const next = [...uris];
              next[i] = e.target.value;
              onChange(next);
            }}
            className={`${monoInputClass} flex-1 text-[12px]`}
          />
          <button
            onClick={() => onChange(uris.filter((_, j) => j !== i))}
            className="rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              onChange([...uris, input.trim()]);
              setInput("");
            }
          }}
          placeholder={t("help.placeholder.callbackUrl" as any)}
          className={`${inputClass} flex-1 text-[12px]`}
        />
        <button
          onClick={() => { if (input.trim()) { onChange([...uris, input.trim()]); setInput(""); } }}
          className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors"
        >
          {t("apps.addUri" as any)}
        </button>
      </div>
    </div>
  );
}

// ── Autocomplete input for SAML variables ──
function AutocompleteInput({ value, onChange, suggestions, placeholder }: {
  value: string; onChange: (v: string) => void; suggestions: string[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const filtered = suggestions.filter((s) => s.toLowerCase().includes((filter || value).toLowerCase()));

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setFilter(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={`${inputClass} !py-1 !text-[12px]`}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface-1 shadow-lg max-h-32 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(s); setOpen(false); }}
              className="block w-full text-left px-2.5 py-1.5 text-[12px] font-mono text-text-secondary hover:bg-accent/10 hover:text-accent transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

