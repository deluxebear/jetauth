import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, Copy, LogOut } from "lucide-react";
import { FormField, FormSection, Switch, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useOrganization } from "../OrganizationContext";
import * as AppBackend from "../backend/ApplicationBackend";
import type { Application } from "../backend/ApplicationBackend";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";
import ImageUrlInput from "../components/ImageUrlInput";
import SaveButton from "../components/SaveButton";

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
  const [activeTab, setActiveTab] = useState("basic");

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
      }
    } catch (e: any) { modal.toast(e?.message || t("common.saveFailed" as any), "error"); }
    finally { setLoading(false); }
  }, [name, isNew]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
          <input value={String(app.defaultGroup ?? "")} onChange={(e) => set("defaultGroup", e.target.value)} className={inputClass} />
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
        <FormField label={t("apps.field.expireInHours")} help={t("help.tokenLifetime" as any)}>
          <input type="number" value={app.expireInHours ?? 168} onChange={(e) => set("expireInHours", Number(e.target.value))} min={0.01} step={0.01} className={monoInputClass} />
        </FormField>
        <FormField label={t("apps.field.refreshExpireHours" as any)}>
          <input type="number" value={app.refreshExpireInHours ?? 168} onChange={(e) => set("refreshExpireInHours", Number(e.target.value))} min={0.01} step={0.01} className={monoInputClass} />
        </FormField>
      </FormSection>
    </div>
  );

  // ── SAML Tab ──
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
          <Switch checked={!!app.enableSamlPostBinding} onChange={(v) => set("enableSamlPostBinding", v)} />
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
    </div>
  );

  // ── Providers Tab ──
  const providersTab = (
    <div className="space-y-5">
      <FormSection title={t("apps.section.providers" as any)}>
        <FormField label={t("apps.field.providers")} span="full">
          <div className="text-[12px] text-text-muted">
            {Array.isArray(app.providers) && app.providers.length > 0 ? (
              <div className="space-y-2">
                {(app.providers as any[]).map((provider: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
                    <span className="font-medium text-text-primary text-[13px] flex-1">{provider.name}</span>
                    <label className="flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={!!provider.canSignUp}
                        onChange={(e) => {
                          const next = [...(app.providers as any[])];
                          next[i] = { ...next[i], canSignUp: e.target.checked };
                          set("providers", next);
                        }}
                        className="rounded"
                      />
                      SignUp
                    </label>
                    <label className="flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={!!provider.canSignIn}
                        onChange={(e) => {
                          const next = [...(app.providers as any[])];
                          next[i] = { ...next[i], canSignIn: e.target.checked };
                          set("providers", next);
                        }}
                        className="rounded"
                      />
                      SignIn
                    </label>
                    <label className="flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={!!provider.canUnlink}
                        onChange={(e) => {
                          const next = [...(app.providers as any[])];
                          next[i] = { ...next[i], canUnlink: e.target.checked };
                          set("providers", next);
                        }}
                        className="rounded"
                      />
                      Unlink
                    </label>
                    <label className="flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={!!provider.prompted}
                        onChange={(e) => {
                          const next = [...(app.providers as any[])];
                          next[i] = { ...next[i], prompted: e.target.checked };
                          set("providers", next);
                        }}
                        className="rounded"
                      />
                      Prompted
                    </label>
                    <button
                      onClick={() => {
                        const next = (app.providers as any[]).filter((_, j) => j !== i);
                        set("providers", next);
                      }}
                      className="rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <span>No providers configured</span>
            )}
            <ProviderAdder
              onAdd={(name) => {
                const current = Array.isArray(app.providers) ? (app.providers as any[]) : [];
                set("providers", [...current, { name, canSignUp: true, canSignIn: true, canUnlink: true, prompted: false, signupGroup: "" }]);
              }}
            />
          </div>
        </FormField>
      </FormSection>
    </div>
  );

  // ── UI Customization Tab ──
  const uiTab = (
    <div className="space-y-5">
      <FormSection title={t("apps.section.signinUi" as any)}>
        <FormField label={t("apps.field.orgChoiceMode" as any)}>
          <SimpleSelect value={String(app.orgChoiceMode ?? "None")} options={[{ value: "None", label: "None" }, { value: "Select", label: "Select" }, { value: "Input", label: "Input" }]} onChange={(v) => set("orgChoiceMode", v)} />
        </FormField>
        <FormField label={t("apps.field.signinMethods" as any)} span="full">
          <div className="text-[12px] text-text-muted">
            {Array.isArray(app.signinMethods) && app.signinMethods.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {(app.signinMethods as any[]).map((m: any, i: number) => (
                  <span key={i} className="rounded-full bg-accent/15 border border-accent/20 px-2 py-0.5 text-[11px] font-mono font-medium text-accent">
                    {m.name} ({m.rule})
                  </span>
                ))}
              </div>
            ) : (
              <span>No signin methods configured</span>
            )}
          </div>
        </FormField>
        <FormField label={t("apps.field.signupHtml" as any)} span="full">
          <textarea value={String(app.signupHtml ?? "")} onChange={(e) => set("signupHtml", e.target.value)} rows={3} className={`${inputClass} font-mono text-[12px]`} />
        </FormField>
        <FormField label={t("apps.field.signinHtml" as any)} span="full">
          <textarea value={String(app.signinHtml ?? "")} onChange={(e) => set("signinHtml", e.target.value)} rows={3} className={`${inputClass} font-mono text-[12px]`} />
        </FormField>
        <FormField label={t("apps.field.signinItems" as any)} span="full">
          <div className="text-[12px] text-text-muted">
            {Array.isArray(app.signinItems) && app.signinItems.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {(app.signinItems as any[]).map((item: any, i: number) => (
                  <span key={i} className="rounded-md bg-surface-3 border border-border px-2 py-0.5 text-[11px] font-mono text-text-secondary">
                    {item.name}
                  </span>
                ))}
              </div>
            ) : (
              <span>No signin items configured</span>
            )}
          </div>
        </FormField>
      </FormSection>

      {!!app.enableSignUp && (
        <FormSection title={t("apps.section.signupUi" as any)}>
          <FormField label={t("apps.field.signupItems" as any)} span="full">
            <div className="text-[12px] text-text-muted">
              {Array.isArray(app.signupItems) && app.signupItems.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {(app.signupItems as any[]).map((item: any, i: number) => (
                    <span key={i} className="rounded-md bg-surface-3 border border-border px-2 py-0.5 text-[11px] font-mono text-text-secondary">
                      {item.name} {item.required ? "(required)" : ""}
                    </span>
                  ))}
                </div>
              ) : (
                <span>No signup items configured</span>
              )}
            </div>
          </FormField>
        </FormSection>
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
          <input value={String(app.cert ?? "")} onChange={(e) => set("cert", e.target.value)} className={inputClass} placeholder={t("help.placeholder.certBuiltIn" as any)} />
        </FormField>
        <FormField label={t("apps.field.clientCert" as any)}>
          <input value={String(app.clientCert ?? "")} onChange={(e) => set("clientCert", e.target.value)} className={inputClass} />
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
          <input value={String(app.sslCert ?? "")} onChange={(e) => set("sslCert", e.target.value)} className={inputClass} />
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
          className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
        >
          {t("apps.addUri" as any)}
        </button>
      </div>
    </div>
  );
}

// ── Provider adder sub-component ──
function ProviderAdder({ onAdd }: { onAdd: (name: string) => void }) {
  const [input, setInput] = useState("");
  const { t } = useTranslation();

  return (
    <div className="flex gap-2 mt-3">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && input.trim()) {
            onAdd(input.trim());
            setInput("");
          }
        }}
        placeholder="Provider name"
        className={`${inputClass} flex-1 text-[12px]`}
      />
      <button
        onClick={() => { if (input.trim()) { onAdd(input.trim()); setInput(""); } }}
        className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
      >
        {t("common.add" as any)}
      </button>
    </div>
  );
}
