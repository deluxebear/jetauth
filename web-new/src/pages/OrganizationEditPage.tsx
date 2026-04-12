import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, Settings, Shield, Menu, Palette, Wallet, Wrench, LogOut, Plus, ChevronUp, ChevronDown, RefreshCw, Pencil, X } from "lucide-react";
import Tabs from "../components/Tabs";
import { FormField, FormSection, Switch, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import TreeCheckbox, { type TreeNode } from "../components/TreeCheckbox";
import CurrencySelect from "../components/CurrencySelect";
import CountryCodeSelect from "../components/CountryCodeSelect";
import LanguageSelect from "../components/LanguageSelect";
import ImageUrlInput from "../components/ImageUrlInput";
import { navGroups as navGroupsDef, widgetItems as widgetItemsDef } from "../navConfig";
import * as OrgBackend from "../backend/OrganizationBackend";
import * as AppBackend from "../backend/ApplicationBackend";
import * as LdapBackend from "../backend/LdapBackend";
import { friendlyError } from "../utils/errorHelper";
import type { Organization } from "../backend/OrganizationBackend";

// Field-level permission config — grouped to match the tab layout
const ORG_ADMIN_FIELD_GROUPS = [
  { tab: "orgs.tab.general", fields: [
    { key: "displayName", labelKey: "field.displayName" },
    { key: "logo", labelKey: "orgs.field.logo" },
    { key: "logoDark", labelKey: "orgs.field.logoDark" },
    { key: "favicon", labelKey: "orgs.field.favicon" },
    { key: "websiteUrl", labelKey: "orgs.field.websiteUrl" },
    { key: "defaultAvatar", labelKey: "orgs.field.defaultAvatar" },
    { key: "defaultApplication", labelKey: "orgs.field.defaultApplication" },
    { key: "initScore", labelKey: "orgs.field.initScore" },
    { key: "userTypes", labelKey: "orgs.field.userTypes" },
    { key: "tags", labelKey: "orgs.field.tags" },
    { key: "countryCodes", labelKey: "orgs.field.countryCodes" },
    { key: "languages", labelKey: "orgs.field.languages" },
    { key: "enableSoftDeletion", labelKey: "orgs.field.enableSoftDeletion" },
    { key: "isProfilePublic", labelKey: "orgs.field.isProfilePublic" },
    { key: "useEmailAsUsername", labelKey: "orgs.field.useEmailAsUsername" },
    { key: "enableTour", labelKey: "orgs.field.enableTour" },
    { key: "disableSignin", labelKey: "orgs.field.disableSignin" },
    { key: "usePermanentAvatar", labelKey: "orgs.field.usePermanentAvatar" },
  ]},
  { tab: "orgs.tab.security", fields: [
    { key: "passwordType", labelKey: "orgs.field.passwordType" },
    { key: "passwordSalt", labelKey: "orgs.field.passwordSalt" },
    { key: "passwordOptions", labelKey: "orgs.field.passwordOptions" },
    { key: "passwordObfuscatorType", labelKey: "orgs.field.passwordObfuscatorType" },
    { key: "passwordObfuscatorKey", labelKey: "orgs.field.passwordObfuscatorKey" },
    { key: "passwordExpireDays", labelKey: "orgs.field.passwordExpireDays" },
    { key: "defaultPassword", labelKey: "orgs.field.defaultPassword" },
    { key: "masterPassword", labelKey: "orgs.field.masterPassword" },
    { key: "masterVerificationCode", labelKey: "orgs.field.masterVerificationCode" },
    { key: "ipWhitelist", labelKey: "orgs.field.ipWhitelist" },
    { key: "mfaItems", labelKey: "orgs.field.mfaItems" },
    { key: "mfaRememberDuration", labelKey: "orgs.field.mfaRemember" },
  ]},
  { tab: "orgs.tab.menu", fields: [
    { key: "navItems", labelKey: "orgs.field.adminNavItems" },
    { key: "userNavItems", labelKey: "orgs.field.userNavItems" },
    { key: "widgetItems", labelKey: "orgs.field.widgetItems" },
  ]},
  { tab: "orgs.tab.theme", fields: [
    { key: "themeData", labelKey: "orgs.tab.theme" },
  ]},
  { tab: "orgs.tab.finance", fields: [
    { key: "balanceCurrency", labelKey: "orgs.field.balanceCurrency" },
    { key: "orgBalance", labelKey: "orgs.field.orgBalance" },
    { key: "balanceCredit", labelKey: "orgs.field.orgBalanceCredit" },
  ]},
  { tab: "orgs.tab.advanced", fields: [
    { key: "ldapAttributes", labelKey: "orgs.field.ldapAttributes" },
    { key: "accountItems", labelKey: "orgs.field.accountItemsLabel" },
  ]},
];

const DEFAULT_EDITABLE = ["displayName", "logo", "logoDark", "favicon", "websiteUrl", "defaultAvatar", "themeData"];
import type { Application } from "../backend/ApplicationBackend";
import type { Ldap } from "../backend/LdapBackend";

const PASSWORD_TYPES = [
  { value: "plain", label: "Plain" }, { value: "salt", label: "Salt" },
  { value: "sha512-salt", label: "SHA512-Salt" }, { value: "md5-salt", label: "MD5-Salt" },
  { value: "bcrypt", label: "Bcrypt" }, { value: "pbkdf2-salt", label: "PBKDF2-Salt" },
  { value: "argon2id", label: "Argon2id" }, { value: "pbkdf2-django", label: "PBKDF2-Django" },
];

const PASSWORD_COMPLEXITY_KEYS: { value: string; labelKey: string }[] = [
  { value: "AtLeast6", labelKey: "orgs.pwOpt.atLeast6" },
  { value: "AtLeast8", labelKey: "orgs.pwOpt.atLeast8" },
  { value: "Aa123", labelKey: "orgs.pwOpt.Aa123" },
  { value: "SpecialChar", labelKey: "orgs.pwOpt.specialChar" },
  { value: "NoRepeat", labelKey: "orgs.pwOpt.noRepeat" },
];

// CURRENCIES moved to CurrencySelect component

const LDAP_ATTRIBUTES = [
  "uid", "cn", "mail", "email", "mobile", "displayName", "givenName", "sn",
  "uidNumber", "gidNumber", "homeDirectory", "loginShell", "gecos",
  "sshPublicKey", "memberOf", "title", "userPassword", "c", "co",
];

export default function OrganizationEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const queryClient = useQueryClient();
  const [org, setOrg] = useState<Organization | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [ldaps, setLdaps] = useState<Ldap[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ["organizations"] });

  const isBuiltIn = name === "built-in";

  // Non-global admins: org field locked, no delete
  const account = JSON.parse(localStorage.getItem("account") ?? "null");
  const isGA = account?.owner === "built-in";
  const canDelete = isGA && !isBuiltIn;

  // Field-level permission check for org admins
  // null/undefined = not configured → use defaults; [] = explicitly empty → nothing editable
  const rawEditable = (org as any)?.orgAdminEditableFields;
  const editableFields = Array.isArray(rawEditable)
    ? new Set(rawEditable as string[])
    : new Set(DEFAULT_EDITABLE);
  const canEditField = (fieldKey: string) => isGA || editableFields.has(fieldKey);

  const fetchData = useCallback(async () => {
    if (!owner || !name) return;
    setLoading(true);
    try {
      // Non-GA admins cannot call get-organization (objOwner="admin" != subOwner),
      // so fetch via get-organizations (list API) which they have access to.
      const orgPromise = isGA
        ? OrgBackend.getOrganization(owner, name)
        : OrgBackend.getOrganizations({ owner: name, organizationName: name }).then(res => ({
          ...res,
          data: res.status === "ok" && Array.isArray(res.data) ? res.data.find((o: Organization) => o.name === name) ?? null : null,
        }));

      const [orgRes, appRes, ldapRes] = await Promise.all([
        orgPromise,
        AppBackend.getApplicationsByOrganization({ owner: isGA ? "admin" : name, organization: name }),
        LdapBackend.getLdaps(name),
      ]);
      if (orgRes.status === "ok" && orgRes.data) {
        setOrg(orgRes.data as Organization);
      } else {
        modal.showError(orgRes.msg || t("orgs.error.loadFailed" as any));
        navigate("/organizations");
      }
      if (appRes.status === "ok" && appRes.data) {
        setApplications(appRes.data);
      }
      if (ldapRes.status === "ok" && ldapRes.data) {
        setLdaps(ldapRes.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [owner, name, isGA, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !org) {
    return <div className="flex items-center justify-center py-24"><div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /></div>;
  }

  const set = (key: string, val: unknown) =>
    setOrg((prev) => prev ? { ...prev, [key]: val } : prev);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await OrgBackend.updateOrganization(owner!, name!, org);
      if (res.status === "ok") {
        invalidateList();
        notifyOrgChange();
        if (org.name !== name) navigate(`/organizations/${org.owner}/${org.name}`, { replace: true });
        modal.toast(t("common.saveSuccess" as any));
        setIsAddMode(false);
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };
  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = await OrgBackend.updateOrganization(owner!, name!, org);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/organizations");
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };

  const notifyOrgChange = () => window.dispatchEvent(new Event("organizationsChanged"));

  const handleBack = async () => {
    if (isAddMode) {
      await OrgBackend.deleteOrganization(org);
      invalidateList();
      notifyOrgChange();
    }
    navigate("/organizations");
  };

  const handleDelete = async () => {
    if (isBuiltIn) { modal.showError(t("orgs.error.cannotDeleteBuiltin" as any)); return; }
    modal.showConfirm(`${t("common.confirmDelete")} [${org.displayName || org.name}]`, async () => {
      try {
        const res = await OrgBackend.deleteOrganization(org);
        if (res.status === "ok") { invalidateList(); notifyOrgChange(); navigate("/organizations"); }
        else { modal.showError(res.msg || "Failed to delete"); }
      } catch (e: any) { modal.toast(e?.message || t("common.saveFailed" as any), "error"); }
    });
  };


  // Build nav tree from the shared navConfig — always in sync with the sidebar
  const navTree: TreeNode[] = [
    {
      key: "all",
      label: t("navTree.all" as any),
      children: navGroupsDef.map((group) => ({
        key: group.key,
        label: t(group.labelKey),
        children: group.items.map((item) => ({
          key: item.to,
          label: t(item.labelKey),
        })),
      })),
    },
  ];

  const widgetTree: TreeNode[] = [
    {
      key: "all",
      label: t("widgetTree.all" as any),
      children: widgetItemsDef.map((w) => ({
        key: w.key,
        label: t(w.labelKey as any),
      })),
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("orgs.title" as any)}</h1>
            <p className="text-[13px] text-text-muted font-mono mt-0.5">{owner}/{name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
              <Trash2 size={14} /> {t("common.delete")}
            </button>
          )}
          {(isGA || editableFields.size > 0) && (<>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg border border-accent px-3 py-2 text-[13px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-50 transition-colors">
              {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /> : <Save size={14} />}
              {t("common.save")}
            </button>
            <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
              {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
              {t("common.saveAndExit" as any)}
            </button>
          </>)}
        </div>
      </div>

      {/* ══ Tabbed Form ══ */}
      <Tabs tabs={[
        {
          key: "general",
          label: t("orgs.tab.general" as any),
          icon: <Settings size={14} />,
          content: (
            <div className="space-y-5">
              <FormSection title={t("orgs.section.basic" as any)}>
                <FormField label={t("field.name")} required>
                  <input value={org.name} onChange={(e) => set("name", e.target.value)} disabled={isBuiltIn || !isGA} className={monoInputClass} />
                </FormField>
                <FormField label={t("field.displayName")}>
                  <input value={org.displayName ?? ""} onChange={(e) => set("displayName", e.target.value)} disabled={!canEditField("displayName")} className={inputClass} />
                </FormField>
                <FormField label={t("orgs.field.enableDarkLogo" as any)}>
                  <Switch checked={!!org.enableDarkLogo} onChange={(v) => set("enableDarkLogo", v)} disabled={!canEditField("logoDark")} />
                </FormField>
                <div />
                <FormField label={t("orgs.field.logo" as any)} span="full">
                  <ImageUrlInput value={org.logo ?? ""} onChange={(v) => set("logo", v)} owner={org.name ?? ""} tag="org-logo" outputWidth={320} outputHeight={80} disabled={!canEditField("logo")} />
                </FormField>
                {!!org.enableDarkLogo && (
                  <FormField label={t("orgs.field.logoDark" as any)} span="full">
                    <ImageUrlInput value={(org as any).logoDark ?? ""} onChange={(v) => set("logoDark", v)} owner={org.name ?? ""} tag="org-logo-dark" outputWidth={320} outputHeight={80} disabled={!canEditField("logoDark")} />
                  </FormField>
                )}
                <FormField label={t("orgs.field.favicon" as any)}>
                  <ImageUrlInput value={org.favicon ?? ""} onChange={(v) => set("favicon", v)} owner={org.name ?? ""} tag="org-favicon" outputWidth={64} outputHeight={64} accept="image/x-icon,image/png,image/svg+xml" disabled={!canEditField("favicon")} />
                </FormField>
                <FormField label={t("orgs.field.websiteUrl" as any)}>
                  <input value={org.websiteUrl ?? ""} onChange={(e) => set("websiteUrl", e.target.value)} disabled={!canEditField("websiteUrl")} className={inputClass} placeholder="https://example.com" />
                </FormField>
                <FormField label={t("orgs.field.defaultAvatar" as any)} span="full">
                  <ImageUrlInput value={org.defaultAvatar ?? ""} onChange={(v) => set("defaultAvatar", v)} owner={org.name ?? ""} tag="org-avatar" outputWidth={200} outputHeight={200} previewClass="h-12 w-12 rounded-full border border-border object-cover bg-surface-2" disabled={!canEditField("defaultAvatar")} />
                </FormField>
                {isBuiltIn && (
                  <FormField label={t("orgs.field.hasPrivilegeConsent" as any)} help={t("orgs.field.hasPrivilegeConsent.help" as any)}>
                    <Switch checked={!!(org as any).hasPrivilegeConsent} onChange={(v) => {
                      modal.showConfirm(t("orgs.confirmPrivilege" as any), () => set("hasPrivilegeConsent", v));
                    }} />
                  </FormField>
                )}
              </FormSection>

              <FormSection title={t("orgs.section.defaults" as any)}>
                <FormField label={t("orgs.field.defaultApplication" as any)}>
                  <div className={!canEditField("defaultApplication") ? "pointer-events-none opacity-60" : ""}>
                    <SearchableSelect
                      value={org.defaultApplication ?? ""}
                      options={applications.map((app) => ({ value: app.name, label: app.displayName || app.name }))}
                      onChange={(v) => set("defaultApplication", v)}
                      placeholder={t("common.search" as any)}
                    />
                  </div>
                </FormField>
                <FormField label={t("orgs.field.initScore" as any)}>
                  <input type="number" value={org.initScore ?? 0} onChange={(e) => set("initScore", Number(e.target.value))} disabled={!canEditField("initScore")} className={monoInputClass} />
                </FormField>
                <FormField label={t("orgs.field.userTypes" as any)} span="full">
                  <div className={!canEditField("userTypes") ? "pointer-events-none opacity-60" : ""}>
                    <TagsEditor tags={(org as any).userTypes ?? []} onChange={(v) => set("userTypes", v)} placeholder="normal-user, paid-user, ..." />
                  </div>
                </FormField>
                <FormField label={t("orgs.field.tags" as any)} span="full">
                  <div className={!canEditField("tags") ? "pointer-events-none opacity-60" : ""}>
                    <TagsEditor tags={org.tags ?? []} onChange={(v) => set("tags", v)} />
                  </div>
                </FormField>
                <FormField label={t("orgs.field.countryCodes" as any)} span="full">
                  <div className={!canEditField("countryCodes") ? "pointer-events-none opacity-60" : ""}>
                    <CountryCodeSelect selected={org.countryCodes ?? []} onChange={(v) => set("countryCodes", v)} />
                  </div>
                </FormField>
                <FormField label={t("orgs.field.languages" as any)} span="full">
                  <div className={!canEditField("languages") ? "pointer-events-none opacity-60" : ""}>
                    <LanguageSelect selected={org.languages ?? []} onChange={(v) => set("languages", v)} />
                  </div>
                </FormField>
              </FormSection>

              <FormSection title={t("orgs.section.features" as any)}>
                <FormField label={t("orgs.field.enableSoftDeletion" as any)}>
                  <Switch checked={!!org.enableSoftDeletion} onChange={(v) => set("enableSoftDeletion", v)} disabled={!canEditField("enableSoftDeletion")} />
                </FormField>
                <FormField label={t("orgs.field.isProfilePublic" as any)}>
                  <Switch checked={!!org.isProfilePublic} onChange={(v) => set("isProfilePublic", v)} disabled={!canEditField("isProfilePublic")} />
                </FormField>
                <FormField label={t("orgs.field.useEmailAsUsername" as any)}>
                  <Switch checked={!!org.useEmailAsUsername} onChange={(v) => set("useEmailAsUsername", v)} disabled={!canEditField("useEmailAsUsername")} />
                </FormField>
                <FormField label={t("orgs.field.enableTour" as any)}>
                  <Switch checked={!!org.enableTour} onChange={(v) => set("enableTour", v)} disabled={!canEditField("enableTour")} />
                </FormField>
                <FormField label={t("orgs.field.disableSignin" as any)}>
                  <Switch checked={!!org.disableSignin} onChange={(v) => set("disableSignin", v)} disabled={!canEditField("disableSignin")} />
                </FormField>
                <FormField label={t("orgs.field.usePermanentAvatar" as any)}>
                  <Switch checked={!!org.usePermanentAvatar} onChange={(v) => set("usePermanentAvatar", v)} disabled={!canEditField("usePermanentAvatar")} />
                </FormField>
              </FormSection>
            </div>
          ),
        },
        {
          key: "security",
          label: t("orgs.tab.security" as any),
          icon: <Shield size={14} />,
          content: (
            <div className="space-y-5">
              <FormSection title={t("orgs.section.password" as any)}>
                <FormField label={t("orgs.field.passwordType" as any)}>
                  <select value={org.passwordType ?? "bcrypt"} onChange={(e) => set("passwordType", e.target.value)} disabled={!canEditField("passwordType")} className={inputClass}>
                    {PASSWORD_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </FormField>
                <FormField label={t("orgs.field.passwordSalt" as any)}>
                  <input value={org.passwordSalt ?? ""} onChange={(e) => set("passwordSalt", e.target.value)} disabled={!canEditField("passwordSalt")} className={monoInputClass} />
                </FormField>
                <FormField label={t("orgs.field.passwordOptions" as any)} span="full">
                  <div className={!canEditField("passwordOptions") ? "pointer-events-none opacity-60" : ""}>
                    <MultiSelectDropdown
                      selected={org.passwordOptions ?? []}
                      options={PASSWORD_COMPLEXITY_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey as any) }))}
                      mutuallyExclusive={[["AtLeast6", "AtLeast8"]]}
                      onChange={(v) => set("passwordOptions", v)}
                    />
                  </div>
                </FormField>
                <FormField label={t("orgs.field.passwordObfuscatorType" as any)}>
                  <select value={(org as any).passwordObfuscatorType ?? "Plain"} onChange={(e) => {
                    const v = e.target.value;
                    set("passwordObfuscatorType", v);
                    // Auto-generate random key when switching to AES/DES
                    if (v === "AES") {
                      set("passwordObfuscatorKey", Array.from({ length: 32 }, () => Math.floor(Math.random() * 15 + 1).toString(16)).join(""));
                    } else if (v === "DES") {
                      set("passwordObfuscatorKey", Array.from({ length: 16 }, () => Math.floor(Math.random() * 15 + 1).toString(16)).join(""));
                    } else {
                      set("passwordObfuscatorKey", "");
                    }
                  }} disabled={!canEditField("passwordObfuscatorType")} className={inputClass}>
                    <option value="Plain">Plain</option>
                    <option value="AES">AES</option>
                    <option value="DES">DES</option>
                  </select>
                </FormField>
                {(org as any).passwordObfuscatorType && (org as any).passwordObfuscatorType !== "Plain" && (
                  <FormField label={t("orgs.field.passwordObfuscatorKey" as any)}>
                    <div className="flex gap-2 items-center">
                      <input value={(org as any).passwordObfuscatorKey ?? ""} readOnly className={`${monoInputClass} flex-1 bg-surface-2 cursor-default`} />
                      <button type="button" disabled={!canEditField("passwordObfuscatorKey")} onClick={() => {
                        const len = (org as any).passwordObfuscatorType === "AES" ? 32 : 16;
                        set("passwordObfuscatorKey", Array.from({ length: len }, () => Math.floor(Math.random() * 15 + 1).toString(16)).join(""));
                      }} className="shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-3 hover:text-text-primary transition-colors">
                        {t("users.generatePassword" as any)}
                      </button>
                    </div>
                  </FormField>
                )}
                <FormField label={t("orgs.field.passwordExpireDays" as any)} help={t("orgs.field.passwordExpireDays.help" as any)}>
                  <input type="number" value={org.passwordExpireDays ?? 0} onChange={(e) => set("passwordExpireDays", Number(e.target.value))} min={0} disabled={!canEditField("passwordExpireDays")} className={monoInputClass} />
                </FormField>
                <FormField label={t("orgs.field.masterPassword" as any)}>
                  <input value={org.masterPassword ?? ""} onChange={(e) => set("masterPassword", e.target.value)} type="password" disabled={!canEditField("masterPassword")} className={inputClass} placeholder={org.masterPassword === "***" ? "***" : ""} />
                </FormField>
                <FormField label={t("orgs.field.defaultPassword" as any)}>
                  <input value={org.defaultPassword ?? ""} onChange={(e) => set("defaultPassword", e.target.value)} type="password" disabled={!canEditField("defaultPassword")} className={inputClass} />
                </FormField>
                <FormField label={t("orgs.field.masterVerificationCode" as any)}>
                  <input value={(org as any).masterVerificationCode ?? ""} onChange={(e) => set("masterVerificationCode", e.target.value)} type="password" disabled={!canEditField("masterVerificationCode")} className={inputClass} placeholder={(org as any).masterVerificationCode === "***" ? "***" : ""} />
                </FormField>
                <FormField label={t("orgs.field.ipWhitelist" as any)}>
                  <input value={(org as any).ipWhitelist ?? ""} onChange={(e) => set("ipWhitelist", e.target.value)} disabled={!canEditField("ipWhitelist")} className={inputClass} placeholder="192.168.1.0/24, 10.0.0.1" />
                </FormField>
              </FormSection>

              <FormSection title={t("orgs.section.mfa" as any)}>
                <FormField label={t("orgs.field.mfaRemember" as any)}>
                  <input type="number" value={org.mfaRememberInHours ?? 12} onChange={(e) => set("mfaRememberInHours", Number(e.target.value))} min={0} disabled={!canEditField("mfaRememberDuration")} className={monoInputClass} />
                </FormField>
                <div />
                <FormField label={t("orgs.field.mfaItems" as any)} span="full">
                  <div className={!canEditField("mfaItems") ? "pointer-events-none opacity-60" : ""}>
                    <MfaItemsEditor items={(org as any).mfaItems ?? []} onChange={(v) => set("mfaItems", v)} t={t} />
                  </div>
                </FormField>
              </FormSection>
            </div>
          ),
        },
        {
          key: "menu",
          label: t("orgs.tab.menu" as any),
          icon: <Menu size={14} />,
          content: (
            <FormSection title={t("orgs.section.menu" as any)}>
              <FormField label={t("orgs.field.adminNavItems" as any)} span="full">
                <div className={!canEditField("navItems") ? "pointer-events-none opacity-60" : ""}>
                  <TreeCheckbox tree={navTree} checked={(org as any).navItems ?? ["all"]} onChange={(v) => set("navItems", v)} />
                </div>
              </FormField>
              <FormField label={t("orgs.field.userNavItems" as any)} span="full">
                <div className={!canEditField("userNavItems") ? "pointer-events-none opacity-60" : ""}>
                  <TreeCheckbox tree={navTree} checked={(org as any).userNavItems ?? []} onChange={(v) => set("userNavItems", v)} />
                </div>
              </FormField>
              <FormField label={t("orgs.field.widgetItems" as any)} span="full">
                <div className={!canEditField("widgetItems") ? "pointer-events-none opacity-60" : ""}>
                  <TreeCheckbox tree={widgetTree} checked={(org as any).widgetItems ?? ["all"]} onChange={(v) => set("widgetItems", v)} />
                </div>
              </FormField>
            </FormSection>
          ),
        },
        {
          key: "theme",
          label: t("orgs.tab.theme" as any),
          icon: <Palette size={14} />,
          content: (
            <div className={!canEditField("themeData") ? "pointer-events-none opacity-60" : ""}>
            <FormSection title={t("orgs.section.theme" as any)}>
              <FormField label={t("orgs.field.enableCustomTheme" as any)}>
                <Switch checked={!!(org as any).themeData?.isEnabled} onChange={(v) => set("themeData", { ...((org as any).themeData ?? {}), isEnabled: v })} />
              </FormField>
              {(org as any).themeData?.isEnabled && (
                <>
                  <FormField label={t("orgs.field.themeType" as any)}>
                    <select value={(org as any).themeData?.themeType ?? "default"} onChange={(e) => set("themeData", { ...(org as any).themeData, themeType: e.target.value })} className={inputClass}>
                      <option value="default">Default</option><option value="dark">Dark</option><option value="light">Light</option>
                    </select>
                  </FormField>
                  <FormField label={t("orgs.field.primaryColor" as any)}>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={(org as any).themeData?.colorPrimary ?? "#1890ff"} onChange={(e) => set("themeData", { ...(org as any).themeData, colorPrimary: e.target.value })} className="h-9 w-12 rounded border border-border cursor-pointer" />
                      <input value={(org as any).themeData?.colorPrimary ?? "#1890ff"} onChange={(e) => set("themeData", { ...(org as any).themeData, colorPrimary: e.target.value })} className={`${monoInputClass} flex-1`} />
                    </div>
                  </FormField>
                  <FormField label={t("orgs.field.borderRadius" as any)}>
                    <input type="number" value={(org as any).themeData?.borderRadius ?? 6} onChange={(e) => set("themeData", { ...(org as any).themeData, borderRadius: Number(e.target.value) })} min={0} max={20} className={monoInputClass} />
                  </FormField>
                  <FormField label={t("orgs.field.compactMode" as any)}>
                    <Switch checked={!!(org as any).themeData?.isCompact} onChange={(v) => set("themeData", { ...(org as any).themeData, isCompact: v })} />
                  </FormField>
                </>
              )}
            </FormSection>
            </div>
          ),
        },
        {
          key: "finance",
          label: t("orgs.tab.finance" as any),
          icon: <Wallet size={14} />,
          content: (
            <FormSection title={t("orgs.section.finance" as any)}>
              <FormField label={t("orgs.field.balanceCurrency" as any)}>
                <CurrencySelect value={org.balanceCurrency ?? "USD"} onChange={(v) => set("balanceCurrency", v)} disabled={!canEditField("balanceCurrency")} />
              </FormField>
              <FormField label={t("orgs.field.orgBalance" as any)}>
                <input type="number" value={(org as any).orgBalance ?? 0} onChange={(e) => set("orgBalance", Number(e.target.value))} disabled={!canEditField("orgBalance")} className={monoInputClass} />
              </FormField>
              <FormField label={t("orgs.field.userBalance" as any)}>
                <input type="number" value={(org as any).userBalance ?? 0} disabled className={monoInputClass} />
              </FormField>
              <FormField label={t("orgs.field.balanceCredit" as any)} help={t("orgs.field.balanceCredit.help" as any)}>
                <input type="number" value={(org as any).balanceCredit ?? 0} onChange={(e) => set("balanceCredit", Math.min(0, Number(e.target.value)))} max={0} disabled={!canEditField("balanceCredit")} className={monoInputClass} />
              </FormField>
            </FormSection>
          ),
        },
        {
          key: "advanced",
          label: t("orgs.tab.advanced" as any),
          icon: <Wrench size={14} />,
          content: (
            <div className="space-y-5">
              <FormSection title={t("orgs.section.ldap" as any)}>
                <FormField label={t("orgs.field.ldapAttributes" as any)} span="full">
                  <div className={!canEditField("ldapAttributes") ? "pointer-events-none opacity-60" : ""}>
                    <MultiSelectDropdown
                      selected={(org as any).ldapAttributes ?? []}
                      options={LDAP_ATTRIBUTES.map((a) => ({ value: a, label: a }))}
                      onChange={(v) => set("ldapAttributes", v)}
                    />
                  </div>
                </FormField>
              </FormSection>

              <div className={!canEditField("ldapAttributes") ? "pointer-events-none opacity-60" : ""}>
                <LdapServersTable ldaps={ldaps} orgName={name!} onUpdate={setLdaps} t={t} modal={modal} />
              </div>

              <div className={!canEditField("masterPassword") ? "pointer-events-none opacity-60" : ""}>
              <FormSection title={t("orgs.section.kerberos" as any)}>
                <FormField label={t("orgs.field.kerberosRealm" as any)}>
                  <input value={(org as any).kerberosRealm ?? ""} onChange={(e) => set("kerberosRealm", e.target.value)} className={inputClass} />
                </FormField>
                <FormField label={t("orgs.field.kerberosKdcHost" as any)}>
                  <input value={(org as any).kerberosKdcHost ?? ""} onChange={(e) => set("kerberosKdcHost", e.target.value)} className={inputClass} />
                </FormField>
                <FormField label={t("orgs.field.kerberosServiceName" as any)}>
                  <input value={(org as any).kerberosServiceName ?? ""} onChange={(e) => set("kerberosServiceName", e.target.value)} className={inputClass} placeholder="HTTP" />
                </FormField>
                <FormField label={t("orgs.field.kerberosKeytab" as any)} span="full">
                  <textarea value={(org as any).kerberosKeytab ?? ""} onChange={(e) => set("kerberosKeytab", e.target.value)} rows={4} className={`${monoInputClass} text-[11px]`} />
                </FormField>
              </FormSection>
              </div>

              <div className={!canEditField("accountItems") ? "pointer-events-none opacity-60" : ""}>
              <AccountItemsTable items={org.accountItems ?? []} onChange={(v) => set("accountItems", v)} t={t} />
              </div>

            </div>
          ),
        },
        // Org admin permissions tab — GA only
        ...(isGA ? [{
          key: "permissions",
          label: t("orgs.tab.permissions" as any),
          icon: <Shield size={14} />,
          content: (
            <div className="space-y-4">
              <p className="text-[13px] text-text-muted">{t("orgs.field.orgAdminEditableFields.help" as any)}</p>
              {ORG_ADMIN_FIELD_GROUPS.map((group) => {
                const currentFields: string[] = (org as any).orgAdminEditableFields ?? [];
                const groupKeys = group.fields.map((f) => f.key);
                const allChecked = groupKeys.every((k) => currentFields.includes(k));
                const someChecked = groupKeys.some((k) => currentFields.includes(k));
                const toggleGroup = () => {
                  if (allChecked) {
                    set("orgAdminEditableFields", currentFields.filter((f: string) => !groupKeys.includes(f)));
                  } else {
                    set("orgAdminEditableFields", [...new Set([...currentFields, ...groupKeys])]);
                  }
                };
                return (
                  <div key={group.tab} className="rounded-xl border border-border bg-surface-1 overflow-hidden">
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-subtle bg-surface-2/30">
                      <input type="checkbox" checked={allChecked} ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                        onChange={toggleGroup} className="rounded border-border text-accent focus:ring-accent/30" />
                      <span className="text-[13px] font-semibold text-text-primary">{t(group.tab as any)}</span>
                      <span className="ml-auto text-[11px] text-text-muted font-mono">
                        {groupKeys.filter((k) => currentFields.includes(k)).length}/{groupKeys.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2.5 px-4 py-3">
                      {group.fields.map((field) => (
                        <label key={field.key} className="flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer hover:text-text-primary transition-colors">
                          <input type="checkbox" checked={currentFields.includes(field.key)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                set("orgAdminEditableFields", [...currentFields, field.key]);
                              } else {
                                set("orgAdminEditableFields", currentFields.filter((f: string) => f !== field.key));
                              }
                            }}
                            className="rounded border-border text-accent focus:ring-accent/30" />
                          {t(field.labelKey as any)}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ),
        }] : []),
      ]} />
    </motion.div>
  );
}

// ── Sub-components ──

function TagsEditor({ tags, onChange, placeholder = "Type and press Enter..." }: { tags: string[]; onChange: (tags: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});

  const addTag = (tag: string) => { const t = tag.trim(); if (t && !tags.includes(t)) onChange([...tags, t]); setInput(""); };
  const removeTag = (idx: number) => onChange(tags.filter((_, j) => j !== idx));

  // Dropdown shows existing tags that match filter, for quick re-selection awareness
  const filtered = input.trim()
    ? tags.filter((t) => t.toLowerCase().includes(input.toLowerCase()))
    : [];
  const showNewOption = input.trim() && !tags.includes(input.trim());

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); }
    };
    if (open) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [open]);

  const updatePos = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropStyle({
      position: "fixed" as const,
      left: rect.left,
      width: rect.width,
      top: rect.bottom + 4,
      maxHeight: Math.min(200, window.innerHeight - rect.bottom - 16),
    });
  }, []);

  useEffect(() => {
    if (open) {
      updatePos();
      window.addEventListener("scroll", updatePos, true);
      window.addEventListener("resize", updatePos);
      return () => {
        window.removeEventListener("scroll", updatePos, true);
        window.removeEventListener("resize", updatePos);
      };
    }
  }, [open, updatePos]);

  const hasDropdown = open && (showNewOption || filtered.length > 0);

  return (
    <div ref={ref}>
      <div
        ref={containerRef}
        onClick={() => { inputRef.current?.focus(); setOpen(true); }}
        className={`flex flex-wrap gap-1.5 rounded-lg border bg-surface-2 px-2.5 py-2 min-h-[38px] cursor-text transition-colors ${
          open ? "border-accent ring-1 ring-accent/30" : "border-border"
        }`}
      >
        {tags.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/20 px-2 py-0.5 text-[11px] font-mono font-medium text-accent">
            {tag}
            <button onClick={(e) => { e.stopPropagation(); removeTag(i); }} className="hover:text-danger transition-colors text-[10px] ml-0.5">x</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addTag(input); }
            if (e.key === "Backspace" && !input && tags.length > 0) { removeTag(tags.length - 1); }
          }}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[100px] bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>

      {hasDropdown && (
        <div style={dropStyle} className="z-[60] rounded-lg border border-border bg-surface-1 py-1 shadow-[var(--shadow-elevated)] overflow-y-auto">
          {showNewOption && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { addTag(input); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-left text-text-primary hover:bg-surface-2 transition-colors"
            >
              <span className="text-accent font-medium">+</span> {input.trim()}
            </button>
          )}
          {filtered.map((tag) => (
            <div
              key={tag}
              className="flex w-full items-center px-3 py-2 text-[13px] text-accent/70 cursor-default"
            >
              {tag}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MfaItemsEditor({ items, onChange, t }: { items: { name: string; rule: string }[]; onChange: (items: { name: string; rule: string }[]) => void; t: (key: string) => string }) {
  const MFA_NAMES = ["app", "sms", "email"];
  const MFA_RULES = ["Optional", "Required", "Prompt"];

  // Ensure all MFA types exist
  const normalized = MFA_NAMES.map((name) => {
    const existing = items.find((i) => i.name === name);
    return existing ?? { name, rule: "Optional" };
  });

  return (
    <div className="space-y-2">
      {normalized.map((item, idx) => (
        <div key={item.name} className="flex items-center gap-3">
          <span className="text-[13px] font-mono text-text-secondary w-16">{t(`orgs.mfa.${item.name}` as any)}</span>
          <select
            value={item.rule}
            onChange={(e) => {
              const next = [...normalized];
              next[idx] = { ...next[idx], rule: e.target.value };
              onChange(next);
            }}
            className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[12px] text-text-primary outline-none focus:border-accent"
          >
            {MFA_RULES.map((r) => <option key={r} value={r}>{t(`orgs.mfa.${r}` as any)}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function MultiSelectDropdown({
  selected,
  options,
  onChange,
  mutuallyExclusive = [],
}: {
  selected: string[];
  options: { value: string; label: string }[];
  onChange: (v: string[]) => void;
  mutuallyExclusive?: string[][];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [open]);

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) { setOpen(false); return; }
    setDropStyle({
      position: "fixed" as const,
      left: rect.left,
      width: rect.width,
      top: rect.bottom + 4,
      maxHeight: Math.min(280, window.innerHeight - rect.bottom - 16),
    });
  }, []);

  useEffect(() => {
    if (open) {
      updatePos();
      window.addEventListener("scroll", updatePos, true);
      window.addEventListener("resize", updatePos);
      return () => {
        window.removeEventListener("scroll", updatePos, true);
        window.removeEventListener("resize", updatePos);
      };
    }
  }, [open, updatePos]);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      // Remove mutually exclusive siblings
      const excluded = new Set<string>();
      for (const group of mutuallyExclusive) {
        if (group.includes(value)) {
          group.forEach((v) => { if (v !== value) excluded.add(v); });
        }
      }
      onChange([...selected.filter((v) => !excluded.has(v)), value]);
    }
  };

  const getLabel = (value: string) =>
    options.find((o) => o.value === value)?.label ?? value;

  return (
    <div ref={ref}>
      {/* Selected tags + trigger */}
      <div
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={`flex flex-wrap gap-1.5 rounded-lg border bg-surface-2 px-2.5 py-2 min-h-[38px] cursor-pointer transition-colors ${
          open ? "border-accent ring-1 ring-accent/30" : "border-border"
        }`}
      >
        {selected.length === 0 && (
          <span className="text-[12px] text-text-muted py-0.5">—</span>
        )}
        {selected.map((val) => (
          <span
            key={val}
            className="inline-flex items-center gap-1 rounded-md bg-accent/15 border border-accent/20 px-2 py-0.5 text-[12px] font-medium text-accent"
          >
            {getLabel(val)}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggle(val);
              }}
              className="hover:text-danger transition-colors text-[10px] ml-0.5"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={dropStyle} className="z-[60] rounded-lg border border-border bg-surface-1 py-1 shadow-[var(--shadow-elevated)] overflow-y-auto">
          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors ${
                  isSelected
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-text-primary hover:bg-surface-2"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    isSelected
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-surface-2"
                  }`}
                >
                  {isSelected && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "",
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    };
    if (open) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [open]);

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) { setOpen(false); return; }
    setDropStyle({
      position: "fixed" as const,
      left: rect.left,
      width: rect.width,
      top: rect.bottom + 4,
      maxHeight: Math.min(280, window.innerHeight - rect.bottom - 16),
    });
  }, []);

  useEffect(() => {
    if (open) {
      updatePos();
      setTimeout(() => inputRef.current?.focus(), 0);
      window.addEventListener("scroll", updatePos, true);
      window.addEventListener("resize", updatePos);
      return () => {
        window.removeEventListener("scroll", updatePos, true);
        window.removeEventListener("resize", updatePos);
      };
    }
  }, [open, updatePos]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    o.value.toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div ref={ref}>
      <div
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={`flex items-center rounded-lg border bg-surface-2 px-2.5 py-2 min-h-[38px] cursor-pointer transition-colors ${
          open ? "border-accent ring-1 ring-accent/30" : "border-border"
        }`}
      >
        <span className={`text-[13px] flex-1 ${value ? "text-text-primary" : "text-text-muted"}`}>
          {value ? selectedLabel : "—"}
        </span>
        <svg className="h-4 w-4 text-text-muted shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>

      {open && (
        <div style={dropStyle} className="z-[60] rounded-lg border border-border bg-surface-1 shadow-[var(--shadow-elevated)] overflow-hidden">
          <div className="px-2 py-1.5 border-b border-border">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: (dropStyle.maxHeight as number ?? 280) - 40 }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
              className={`flex w-full items-center px-3 py-2 text-[13px] text-left transition-colors ${
                !value ? "bg-accent/10 text-accent font-medium" : "text-text-muted hover:bg-surface-2"
              }`}
            >
              —
            </button>
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); setSearch(""); }}
                className={`flex w-full items-center px-3 py-2 text-[13px] text-left transition-colors ${
                  opt.value === value
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-text-primary hover:bg-surface-2"
                }`}
              >
                {opt.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-text-muted">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── LDAP Servers Table ──

const ACCOUNT_ITEM_NAMES = [
  "Organization", "ID", "Name", "Display name", "First name", "Last name",
  "Avatar", "User type", "Password", "Email", "Phone", "Country code",
  "Country/Region", "Location", "Address", "Addresses", "Affiliation", "Title",
  "ID card type", "ID card", "ID card info", "Real name", "ID verification",
  "Homepage", "Bio", "Tag", "Language", "Gender", "Birthday", "Education",
  "Balance", "Balance currency", "Balance credit", "Cart", "Transactions",
  "Score", "Karma", "Ranking", "Signup application", "Register type", "Register source",
  "API key", "Groups", "Roles", "Permissions", "3rd-party logins", "Properties",
  "Is online", "Is admin", "Is forbidden", "Is deleted", "Need update password", "IP whitelist",
  "Multi-factor authentication", "WebAuthn credentials", "Last change password time",
  "Managed accounts", "Face ID", "MFA accounts", "MFA items",
];

const REGEX_FIELDS = [
  "Display name", "Password", "Email", "Phone", "Location",
  "Title", "Homepage", "Bio", "Gender", "Birthday", "Education", "ID card", "ID card type",
];

function LdapServersTable({ ldaps, orgName, onUpdate, t, modal }: {
  ldaps: Ldap[];
  orgName: string;
  onUpdate: (ldaps: Ldap[]) => void;
  t: (key: string) => string;
  modal: ReturnType<typeof import("../components/Modal").useModal>;
}) {
  const handleAdd = async () => {
    try {
      const res = await LdapBackend.addLdap({
        owner: orgName,
        serverName: "Example LDAP Server",
        host: "example.com",
        port: 389,
        username: "cn=admin,dc=example,dc=com",
        password: "123",
        baseDn: "ou=People,dc=example,dc=com",
        autoSync: 0,
      });
      if (res.status === "ok") {
        modal.toast(t("common.addSuccess" as any) || "Added successfully");
        onUpdate([...ldaps, res.data2 as Ldap]);
      } else {
        modal.toast(res.msg || "Failed to add", "error");
      }
    } catch (e: any) {
      modal.toast(e.message || "Failed to add", "error");
    }
  };

  const handleDelete = (idx: number) => {
    const ldap = ldaps[idx];
    modal.showConfirm(`${t("common.confirmDelete")} ${ldap.serverName}?`, async () => {
      try {
        const res = await LdapBackend.deleteLdap(ldap);
        if (res.status === "ok") {
          modal.toast(t("common.deleteSuccess" as any) || "Deleted");
          onUpdate(ldaps.filter((_, i) => i !== idx));
        } else {
          modal.toast(res.msg || "Failed to delete", "error");
        }
      } catch (e: any) {
        modal.toast(e.message || "Failed to delete", "error");
      }
    });
  };

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-text-primary">{t("orgs.field.ldapServers" as any)}</h3>
        <button onClick={handleAdd} className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors">
          <Plus size={12} /> {t("common.add")}
        </button>
      </div>
      {ldaps.length === 0 ? (
        <div className="px-5 py-8 text-center text-[13px] text-text-muted">{t("common.noData")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-surface-2/30">
                <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{t("orgs.ldap.serverName" as any)}</th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{t("orgs.ldap.server" as any)}</th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{t("orgs.ldap.baseDn" as any)}</th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{t("orgs.ldap.autoSync" as any)}</th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{t("orgs.ldap.lastSync" as any)}</th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-40">{t("common.action" as any)}</th>
              </tr>
            </thead>
            <tbody>
              {ldaps.map((ldap, idx) => (
                <tr key={ldap.id} className="border-b border-border-subtle hover:bg-surface-2/30">
                  <td className="px-4 py-2 text-[13px]">
                    <Link to={`/ldap/${ldap.owner}/${ldap.id}`} className="text-accent hover:underline">{ldap.serverName}</Link>
                  </td>
                  <td className="px-4 py-2 text-[13px] font-mono text-text-secondary">{ldap.host}:{ldap.port}</td>
                  <td className="px-4 py-2 text-[13px] font-mono text-text-secondary truncate max-w-[200px]">{ldap.baseDn}</td>
                  <td className="px-4 py-2 text-[13px]">
                    {ldap.autoSync === 0
                      ? <span className="text-warning">Disable</span>
                      : <span className="text-success">{ldap.autoSync} mins</span>
                    }
                  </td>
                  <td className="px-4 py-2 text-[13px] text-text-secondary">{ldap.lastSync || "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <Link to={`/ldap/sync/${ldap.owner}/${ldap.id}`}
                        className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-hover transition-colors">
                        <RefreshCw size={11} /> {t("common.sync" as any)}
                      </Link>
                      <Link to={`/ldap/${ldap.owner}/${ldap.id}`}
                        className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                        <Pencil size={11} /> {t("common.edit")}
                      </Link>
                      <button onClick={() => handleDelete(idx)}
                        className="flex items-center gap-1 rounded-lg border border-danger/30 px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-danger/10 transition-colors">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Account Items Table ──

function AccountItemsTable({ items, onChange, t }: {
  items: { name: string; visible: boolean; viewRule: string; modifyRule: string; tab?: string; regex?: string }[];
  onChange: (items: { name: string; visible: boolean; viewRule: string; modifyRule: string; tab?: string; regex?: string }[]) => void;
  t: (key: string) => string;
}) {
  const addRow = () => {
    const usedNames = new Set(items.map((i) => i.name));
    const nextName = ACCOUNT_ITEM_NAMES.find((n) => !usedNames.has(n)) ?? "Organization";
    onChange([...items, { name: nextName, visible: true, viewRule: "Public", modifyRule: "Self", tab: "" }]);
  };

  const updateField = (idx: number, key: string, value: unknown) => {
    const next = [...items];
    next[idx] = { ...next[idx], [key]: value };
    onChange(next);
  };

  const deleteRow = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  const swapRows = (a: number, b: number) => {
    if (b < 0 || b >= items.length) return;
    const next = [...items];
    [next[a], next[b]] = [next[b], next[a]];
    onChange(next);
  };

  const usedNames = new Set(items.map((i) => i.name));

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-text-primary">{t("orgs.section.accountItems" as any)} ({items.length})</h3>
        <button onClick={addRow} className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors">
          <Plus size={12} /> {t("common.add")}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-[13px] text-text-muted">{t("common.noData")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-surface-2/30">
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{t("common.name" as any)}</th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-16">{t("orgs.account.visible" as any)}</th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-36">{t("orgs.account.regex" as any)}</th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-28">{t("orgs.account.viewRule" as any)}</th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-28">{t("orgs.account.modifyRule" as any)}</th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-24">{t("common.action" as any)}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const modifyOptions = (item.viewRule === "Admin" || item.name === "Is admin")
                  ? ["Admin", "Immutable"]
                  : ["Self", "Admin", "Immutable"];

                return (
                  <tr key={idx} className="border-b border-border-subtle hover:bg-surface-2/30">
                    <td className="px-3 py-1.5">
                      <select value={item.name} onChange={(e) => updateField(idx, "name", e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-[12px] text-text-primary outline-none focus:border-accent transition-colors">
                        <option value={item.name}>{(() => { const k = `accountItem.${item.name}`; const v = t(k as any); return v === k ? item.name : v; })()}</option>
                        {ACCOUNT_ITEM_NAMES.filter((n) => !usedNames.has(n)).map((n) => {
                          const k = `accountItem.${n}`; const v = t(k as any);
                          return <option key={n} value={n}>{v === k ? n : v}</option>;
                        })}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <Switch checked={item.visible} onChange={(v) => updateField(idx, "visible", v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      {REGEX_FIELDS.includes(item.name) ? (
                        <input value={item.regex ?? ""} onChange={(e) => updateField(idx, "regex", e.target.value)}
                          className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors" />
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5">
                      {item.visible ? (
                        <select value={item.viewRule} onChange={(e) => updateField(idx, "viewRule", e.target.value)}
                          className="w-full rounded border border-border bg-surface-2 px-2 py-1 text-[12px] text-text-primary outline-none">
                          <option value="Public">{t("orgs.rule.Public" as any)}</option>
                          <option value="Self">{t("orgs.rule.Self" as any)}</option>
                          <option value="Admin">{t("orgs.rule.Admin" as any)}</option>
                        </select>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5">
                      {item.visible ? (
                        <select value={item.modifyRule} onChange={(e) => updateField(idx, "modifyRule", e.target.value)}
                          className="w-full rounded border border-border bg-surface-2 px-2 py-1 text-[12px] text-text-primary outline-none">
                          {modifyOptions.map((o) => <option key={o} value={o}>{t(`orgs.rule.${o}` as any)}</option>)}
                        </select>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-0.5">
                        <button disabled={idx === 0} onClick={() => swapRows(idx, idx - 1)}
                          className="rounded p-1 text-text-muted hover:bg-surface-2 disabled:opacity-30 transition-colors">
                          <ChevronUp size={13} />
                        </button>
                        <button disabled={idx === items.length - 1} onClick={() => swapRows(idx, idx + 1)}
                          className="rounded p-1 text-text-muted hover:bg-surface-2 disabled:opacity-30 transition-colors">
                          <ChevronDown size={13} />
                        </button>
                        <button onClick={() => deleteRow(idx)}
                          className="rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors">
                          <X size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
