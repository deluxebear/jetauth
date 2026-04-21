import StatusBadge from "../../components/StatusBadge";
import type { ListPageColumn } from "../../components/GenericListPage";
import type { FieldConfig } from "../../components/GenericEditPage";
import { safeExternalUrl } from "../../utils/safeUrl";

// ─── Helper renderers ───
const linkName = (_: unknown, r: Record<string, unknown>) => (
  <span className="font-mono font-medium text-accent">{String(r.name ?? "")}</span>
);
const textMuted = (key: string) => (_: unknown, r: Record<string, unknown>) => (
  <span className="text-text-secondary">{String(r[key] ?? "—")}</span>
);
const monoMuted = (key: string) => (_: unknown, r: Record<string, unknown>) => (
  <span className="font-mono text-[12px] text-text-muted">{String(r[key] ?? "—")}</span>
);
const dateCol = (key: string) => (_: unknown, r: Record<string, unknown>) => {
  const v = r[key];
  if (!v) return <span className="text-text-muted">—</span>;
  return <span className="text-[12px] text-text-muted font-mono">{new Date(String(v)).toLocaleString()}</span>;
};
const boolBadge = (key: string, trueLabel = "Enabled", falseLabel = "Disabled") =>
  (_: unknown, r: Record<string, unknown>) => (
    <StatusBadge status={r[key] ? "active" : "inactive"} label={r[key] ? trueLabel : falseLabel} />
  );
const tagsList = (key: string) => (_: unknown, r: Record<string, unknown>) => {
  const arr = r[key];
  if (!Array.isArray(arr) || arr.length === 0) return <span className="text-text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {arr.slice(0, 3).map((t: string, i: number) => (
        <span key={i} className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-mono text-text-secondary">{String(t)}</span>
      ))}
      {arr.length > 3 && <span className="text-[11px] text-text-muted">+{arr.length - 3}</span>}
    </div>
  );
};
const truncate = (key: string, max = 40) => (_: unknown, r: Record<string, unknown>) => {
  const v = String(r[key] ?? "");
  return <span className="text-text-secondary text-[12px]" title={v}>{v.length > max ? v.slice(0, max) + "..." : v || "—"}</span>;
};

// ─── Entity Configurations ───

export interface EntityConfig {
  entityType: string;       // singular API name
  entityTypePlural: string; // plural for routes and API
  titleKey: string;
  subtitleKey: string;
  addButtonKey?: string;
  listColumns: ListPageColumn[];
  editFields: FieldConfig[];
  canAdd?: boolean;
  canDelete?: boolean;
  listOnly?: boolean; // no edit page (e.g. records, sessions)
}

export const entityConfigs: Record<string, EntityConfig> = {
  // ═══ IDENTITY ═══
  organizations: {
    entityType: "organization",
    entityTypePlural: "organizations",
    titleKey: "orgs.title",
    subtitleKey: "orgs.subtitle",
    addButtonKey: "orgs.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, width: "120px", render: linkName },
      { key: "createdTime", title: "col.created", sortable: true, width: "160px", render: dateCol("createdTime") },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "favicon", title: "col.favicon", width: "60px", render: (_: unknown, r: Record<string, unknown>) =>
        r.favicon ? <img src={String(r.favicon)} alt="" className="h-6 w-6 object-contain" /> : <span className="text-text-muted">—</span>
      },
      { key: "websiteUrl", title: "col.website", render: (_: unknown, r: Record<string, unknown>) =>
        r.websiteUrl ? <a href={safeExternalUrl(String(r.websiteUrl))} target="_blank" rel="noreferrer" className="text-accent hover:underline text-[12px] truncate block max-w-[200px]">{String(r.websiteUrl)}</a> : <span className="text-text-muted">—</span>
      },
      { key: "passwordType", title: "col.passwordType", render: monoMuted("passwordType") },
      { key: "defaultAvatar", title: "col.defaultAvatar", width: "90px", render: (_: unknown, r: Record<string, unknown>) =>
        r.defaultAvatar ? <img src={String(r.defaultAvatar)} alt="" className="h-7 w-7 rounded-full object-cover border border-border" /> : <span className="text-text-muted">—</span>
      },
      { key: "enableSoftDeletion", title: "col.softDeletion", render: boolBadge("enableSoftDeletion") },
    ],
    editFields: [
      // Basic
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true, disabled: (v) => v.name === "built-in", group: "orgs.section.basic" },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "logo", labelKey: "orgs.field.logo", type: "url", span: "full" },
      { key: "favicon", labelKey: "orgs.field.favicon", type: "url" },
      { key: "websiteUrl", labelKey: "orgs.field.websiteUrl", type: "url" },
      // Password policy
      { key: "passwordType", labelKey: "orgs.field.passwordType", type: "select", group: "orgs.section.password", options: [
        { value: "plain", label: "Plain" }, { value: "salt", label: "Salt" },
        { value: "sha512-salt", label: "SHA512-Salt" }, { value: "md5-salt", label: "MD5-Salt" },
        { value: "bcrypt", label: "Bcrypt" }, { value: "pbkdf2-salt", label: "PBKDF2-Salt" },
        { value: "argon2id", label: "Argon2id" }, { value: "pbkdf2-django", label: "PBKDF2-Django" },
      ] },
      { key: "passwordSalt", labelKey: "orgs.field.passwordSalt", type: "text", mono: true },
      { key: "passwordOptions", labelKey: "orgs.field.passwordOptions", type: "tags", span: "full", options: [
        { value: "AtLeast6", label: "At least 6 chars" }, { value: "AtLeast8", label: "At least 8 chars" },
        { value: "Aa123", label: "Upper+Lower+Digit" }, { value: "SpecialChar", label: "Special Char" },
        { value: "NoRepeat", label: "No Repeat" },
      ] },
      { key: "passwordExpireDays", labelKey: "orgs.field.passwordExpireDays", type: "number" },
      { key: "masterPassword", labelKey: "orgs.field.masterPassword", type: "password" },
      // Defaults
      { key: "defaultAvatar", labelKey: "orgs.field.defaultAvatar", type: "url", span: "full", group: "orgs.section.defaults" },
      { key: "defaultApplication", labelKey: "orgs.field.defaultApplication", type: "text" },
      { key: "defaultPassword", labelKey: "orgs.field.defaultPassword", type: "password" },
      { key: "countryCodes", labelKey: "orgs.field.countryCodes", type: "tags", span: "full" },
      { key: "languages", labelKey: "orgs.field.languages", type: "tags", span: "full" },
      { key: "tags", labelKey: "orgs.field.tags", type: "tags", span: "full" },
      // Finance
      { key: "balanceCurrency", labelKey: "orgs.field.balanceCurrency", type: "select", group: "orgs.section.finance", options: [
        { value: "USD", label: "USD" }, { value: "CNY", label: "CNY" }, { value: "EUR", label: "EUR" },
        { value: "JPY", label: "JPY" }, { value: "GBP", label: "GBP" },
      ] },
      { key: "initScore", labelKey: "orgs.field.initScore", type: "number" },
      // Switches
      { key: "enableSoftDeletion", labelKey: "orgs.field.enableSoftDeletion", type: "switch", group: "orgs.section.features" },
      { key: "isProfilePublic", labelKey: "orgs.field.isProfilePublic", type: "switch" },
      { key: "useEmailAsUsername", labelKey: "orgs.field.useEmailAsUsername", type: "switch" },
      { key: "enableTour", labelKey: "orgs.field.enableTour", type: "switch" },
      { key: "disableSignin", labelKey: "orgs.field.disableSignin", type: "switch" },
      { key: "usePermanentAvatar", labelKey: "orgs.field.usePermanentAvatar", type: "switch" },
    ],
  },

  users: {
    entityType: "user",
    entityTypePlural: "users",
    titleKey: "users.title",
    subtitleKey: "users.subtitle",
    addButtonKey: "users.addUser",
    listColumns: [
      { key: "owner", title: "col.organization", sortable: true, width: "110px" },
      { key: "name", title: "col.username", sortable: true, width: "110px", render: linkName },
      { key: "createdTime", title: "col.created", sortable: true, width: "160px", render: dateCol("createdTime") },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "avatar", title: "col.avatar", width: "60px", render: (_: unknown, r: Record<string, unknown>) =>
        r.avatar ? <img src={String(r.avatar)} alt="" className="h-8 w-8 rounded-full object-cover border border-border" referrerPolicy="no-referrer" /> : <div className="h-8 w-8 rounded-full bg-surface-3 flex items-center justify-center text-[10px] font-bold text-text-muted">{String(r.displayName ?? r.name ?? "?")[0]}</div>
      },
      { key: "email", title: "col.email", width: "160px", render: (_: unknown, r: Record<string, unknown>) =>
        r.email ? <a href={`mailto:${r.email}`} className="text-accent hover:underline text-[12px]">{String(r.email)}</a> : <span className="text-text-muted">—</span>
      },
      { key: "phone", title: "col.phone", width: "120px", render: textMuted("phone") },
      { key: "affiliation", title: "col.affiliation", width: "140px", render: textMuted("affiliation") },
      { key: "isAdmin", title: "col.admin", width: "70px", render: boolBadge("isAdmin", "Yes", "No") },
      { key: "isForbidden", title: "col.forbidden", width: "80px", render: boolBadge("isForbidden", "Yes", "No") },
      { key: "isDeleted", title: "col.deleted", width: "75px", render: boolBadge("isDeleted", "Yes", "No") },
    ],
    editFields: [
      // Identity
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "users.section.identity" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true, disabled: (v) => v.name === "admin" },
      { key: "id", labelKey: "users.field.id", type: "text", disabled: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "avatar", labelKey: "field.avatar", type: "url", span: "full" },
      { key: "type", labelKey: "field.type", type: "select", options: [
        { value: "normal-user", label: "Normal User" }, { value: "paid-user", label: "Paid User" },
      ] },
      // Contact
      { key: "email", labelKey: "field.email", type: "email", group: "users.section.contact" },
      { key: "phone", labelKey: "field.phone", type: "text" },
      { key: "countryCode", labelKey: "users.field.countryCode", type: "text" },
      { key: "region", labelKey: "users.field.region", type: "text" },
      { key: "location", labelKey: "users.field.location", type: "text" },
      { key: "address", labelKey: "users.field.address", type: "text", span: "full" },
      // Professional
      { key: "affiliation", labelKey: "users.field.affiliation", type: "text", group: "users.section.professional" },
      { key: "title", labelKey: "users.field.title", type: "text" },
      { key: "homepage", labelKey: "users.field.homepage", type: "url" },
      { key: "bio", labelKey: "users.field.bio", type: "textarea", span: "full" },
      // Personal
      { key: "tag", labelKey: "users.field.tag", type: "text", group: "users.section.personal" },
      { key: "language", labelKey: "users.field.language", type: "text" },
      { key: "gender", labelKey: "users.field.gender", type: "text" },
      { key: "birthday", labelKey: "users.field.birthday", type: "text" },
      { key: "education", labelKey: "users.field.education", type: "text" },
      { key: "realName", labelKey: "users.field.realName", type: "text" },
      // ID Verification
      { key: "idCardType", labelKey: "users.field.idCardType", type: "text", group: "users.section.verification" },
      { key: "idCard", labelKey: "users.field.idCard", type: "text" },
      // Security
      { key: "password", labelKey: "field.password", type: "password", group: "users.section.security" },
      { key: "ipWhitelist", labelKey: "users.field.ipWhitelist", type: "text", span: "full" },
      // Finance
      { key: "score", labelKey: "users.field.score", type: "number", group: "users.section.finance" },
      { key: "karma", labelKey: "users.field.karma", type: "number" },
      { key: "ranking", labelKey: "users.field.ranking", type: "number" },
      { key: "balance", labelKey: "users.field.balance", type: "number" },
      { key: "balanceCredit", labelKey: "users.field.balanceCredit", type: "number" },
      { key: "balanceCurrency", labelKey: "users.field.currency", type: "select", options: [
        { value: "USD", label: "USD" }, { value: "CNY", label: "CNY" }, { value: "EUR", label: "EUR" },
      ] },
      // Admin
      { key: "signupApplication", labelKey: "users.field.signupApplication", type: "text", disabled: true, group: "users.section.admin" },
      { key: "registerType", labelKey: "users.field.registerType", type: "text", disabled: true },
      { key: "registerSource", labelKey: "users.field.registerSource", type: "text", disabled: true },
      { key: "isAdmin", labelKey: "users.field.isAdmin", type: "switch" },
      { key: "isGlobalAdmin", labelKey: "users.field.isGlobalAdmin", type: "switch" },
      { key: "isForbidden", labelKey: "users.field.isForbidden", type: "switch" },
      { key: "isDeleted", labelKey: "users.field.isDeleted", type: "switch" },
    ],
  },

  groups: {
    entityType: "group",
    entityTypePlural: "groups",
    titleKey: "groups.title",
    subtitleKey: "groups.subtitle",
    addButtonKey: "groups.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, width: "150px", render: linkName },
      { key: "owner", title: "col.organization", sortable: true, width: "140px" },
      { key: "createdTime", title: "col.created", sortable: true, width: "160px", render: dateCol("createdTime") },
      { key: "updatedTime", title: "col.updated", sortable: true, width: "160px", render: dateCol("updatedTime") },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "type", title: "col.type", width: "100px", render: (_: unknown, r: Record<string, unknown>) =>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${r.type === "Physical" ? "bg-info/15 text-info border border-info/20" : "bg-surface-3 text-text-muted border border-border"}`}>{String(r.type ?? "Virtual")}</span>
      },
      { key: "parentId", title: "col.parent", width: "140px", render: textMuted("parentId") },
      { key: "users", title: "col.users", render: tagsList("users") },
      { key: "isEnabled", title: "col.enabled", width: "80px", render: boolBadge("isEnabled") },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "type", labelKey: "field.type", type: "select", options: [
        { value: "Virtual", label: "Virtual" }, { value: "Physical", label: "Physical" },
      ] },
      { key: "parentId", labelKey: "groups.field.parentGroup", type: "text" },
      { key: "users", labelKey: "groups.field.users", type: "tags", span: "full", group: "groups.field.users" },
      { key: "isEnabled", labelKey: "field.isEnabled", type: "switch" },
    ],
  },

  invitations: {
    entityType: "invitation",
    entityTypePlural: "invitations",
    titleKey: "invitations.title",
    subtitleKey: "invitations.subtitle",
    addButtonKey: "invitations.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, width: "140px", render: linkName },
      { key: "owner", title: "col.organization", sortable: true, width: "120px" },
      { key: "updatedTime", title: "col.updated", sortable: true, width: "160px", render: dateCol("updatedTime") },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "code", title: "col.code", width: "140px", render: monoMuted("code") },
      { key: "quota", title: "col.quota", width: "80px", render: monoMuted("quota") },
      { key: "usedCount", title: "col.used", width: "80px", render: monoMuted("usedCount") },
      { key: "application", title: "col.application", width: "140px" },
      { key: "email", title: "col.email", width: "160px", render: (_: unknown, r: Record<string, unknown>) =>
        r.email ? <a href={`mailto:${r.email}`} className="text-accent hover:underline text-[12px]">{String(r.email)}</a> : <span className="text-text-muted">—</span>
      },
      { key: "phone", title: "col.phone", width: "110px", render: textMuted("phone") },
      { key: "state", title: "col.state", width: "100px", render: (_: unknown, r: Record<string, unknown>) => {
        const s = String(r.state ?? "");
        return <StatusBadge status={s === "Active" ? "active" : "inactive"} label={s || "—"} />;
      } },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "invitations.section.basic" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "code", labelKey: "invitations.field.code", type: "text", mono: true, helpText: "Only letters and numbers allowed" },
      { key: "quota", labelKey: "invitations.field.quota", type: "number", group: "invitations.section.limits" },
      { key: "usedCount", labelKey: "invitations.field.usedCount", type: "number" },
      { key: "application", labelKey: "invitations.field.application", type: "text" },
      { key: "signupGroup", labelKey: "invitations.field.signupGroup", type: "text" },
      { key: "username", labelKey: "invitations.field.username", type: "text", group: "invitations.section.prefill" },
      { key: "email", labelKey: "field.email", type: "email" },
      { key: "phone", labelKey: "field.phone", type: "text" },
      { key: "state", labelKey: "field.state", type: "select", group: "invitations.section.state", options: [
        { value: "Active", label: "Active" }, { value: "Suspended", label: "Suspended" },
      ] },
    ],
  },

  // ═══ AUTHENTICATION ═══
  applications: {
    entityType: "application",
    entityTypePlural: "applications",
    titleKey: "apps.title",
    subtitleKey: "apps.subtitle",
    addButtonKey: "apps.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "organization", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "clientId", title: "col.clientId", render: monoMuted("clientId") },
      { key: "enablePassword", title: "col.password", render: boolBadge("enablePassword") },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "description", labelKey: "field.description", type: "textarea", span: "full" },
      { key: "logo", labelKey: "apps.field.logo", type: "url", span: "full" },
      { key: "homepageUrl", labelKey: "apps.field.homepageUrl", type: "url", group: "apps.field.clientId" },
      { key: "organization", labelKey: "apps.field.organization", type: "text" },
      { key: "clientId", labelKey: "apps.field.clientId", type: "text", mono: true },
      { key: "clientSecret", labelKey: "apps.field.clientSecret", type: "password", mono: true },
      { key: "redirectUris", labelKey: "apps.field.redirectUris", type: "tags", span: "full" },
      { key: "cert", labelKey: "apps.field.cert", type: "text", group: "tokens.field.scope" },
      { key: "tokenFormat", labelKey: "apps.field.tokenFormat", type: "select", options: [
        { value: "JWT", label: "JWT" }, { value: "JWT-Empty", label: "JWT-Empty" },
      ] },
      { key: "expireInHours", labelKey: "apps.field.expireInHours", type: "number" },
      { key: "grantTypes", labelKey: "apps.field.grantTypes", type: "tags", span: "full" },
      { key: "enablePassword", labelKey: "apps.field.enablePassword", type: "switch", group: "field.isEnabled" },
      { key: "enableSignUp", labelKey: "apps.field.enableSignUp", type: "switch" },
      { key: "enableCodeSignin", labelKey: "apps.field.enableCodeSignin", type: "switch" },
      { key: "enableAutoSignin", labelKey: "apps.field.enableAutoSignin", type: "switch" },
      { key: "signinUrl", labelKey: "apps.field.signinUrl", type: "url", group: "field.url" },
      { key: "signupUrl", labelKey: "apps.field.signupUrl", type: "url" },
      { key: "forgetUrl", labelKey: "apps.field.forgetUrl", type: "url" },
    ],
  },

  providers: {
    entityType: "provider",
    entityTypePlural: "providers",
    titleKey: "providers.title",
    subtitleKey: "providers.subtitle",
    addButtonKey: "providers.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "category", title: "col.category", render: monoMuted("category") },
      { key: "type", title: "col.type", render: monoMuted("type") },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "category", labelKey: "providers.field.category", type: "select", options: [
        { value: "OAuth", label: "OAuth" }, { value: "Email", label: "Email" },
        { value: "SMS", label: "SMS" }, { value: "Storage", label: "Storage" },
        { value: "Payment", label: "Payment" }, { value: "Captcha", label: "Captcha" },
        { value: "Notification", label: "Notification" }, { value: "AI", label: "AI" },
      ] },
      { key: "type", labelKey: "field.type", type: "text" },
      { key: "clientId", labelKey: "providers.field.clientId", type: "text", mono: true, group: "providers.field.clientId" },
      { key: "clientSecret", labelKey: "providers.field.clientSecret", type: "password", mono: true },
      { key: "host", labelKey: "providers.field.host", type: "text", group: "providers.field.endpoint" },
      { key: "port", labelKey: "providers.field.port", type: "number" },
      { key: "domain", labelKey: "providers.field.domain", type: "text" },
      { key: "endpoint", labelKey: "providers.field.endpoint", type: "url" },
      { key: "bucket", labelKey: "providers.field.bucket", type: "text" },
      { key: "region", labelKey: "providers.field.region", type: "text" },
      { key: "providerUrl", labelKey: "providers.field.providerUrl", type: "url", span: "full" },
    ],
  },

  certs: {
    entityType: "cert",
    entityTypePlural: "certs",
    titleKey: "certs.title",
    subtitleKey: "certs.subtitle",
    addButtonKey: "certs.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "scope", title: "col.scope", render: monoMuted("scope") },
      { key: "type", title: "col.type", render: monoMuted("type") },
      { key: "cryptoAlgorithm", title: "col.algorithm", render: monoMuted("cryptoAlgorithm") },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "scope", labelKey: "certs.field.scope", type: "select", options: [
        { value: "JWT", label: "JWT" }, { value: "ClientCert", label: "Client Cert" },
      ] },
      { key: "type", labelKey: "field.type", type: "select", options: [
        { value: "x509", label: "X.509" },
      ] },
      { key: "cryptoAlgorithm", labelKey: "certs.field.cryptoAlgorithm", type: "select", options: [
        { value: "RS256", label: "RS256" }, { value: "RS384", label: "RS384" }, { value: "RS512", label: "RS512" },
        { value: "ES256", label: "ES256" }, { value: "ES384", label: "ES384" }, { value: "ES512", label: "ES512" },
      ] },
      { key: "bitSize", labelKey: "certs.field.bitSize", type: "number" },
      { key: "expireInYears", labelKey: "certs.field.expireInYears", type: "number" },
      { key: "certificate", labelKey: "certs.field.certificate", type: "code", span: "full", rows: 6, group: "certs.field.certificate" },
      { key: "privateKey", labelKey: "certs.field.privateKey", type: "code", span: "full", rows: 6 },
    ],
  },

  // ═══ AUTHORIZATION ═══
  roles: {
    entityType: "role",
    entityTypePlural: "roles",
    titleKey: "roles.title",
    subtitleKey: "roles.subtitle",
    addButtonKey: "roles.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "users", title: "col.users", render: tagsList("users") },
      { key: "roles", title: "col.subRoles", render: tagsList("roles") },
      { key: "isEnabled", title: "col.enabled", render: boolBadge("isEnabled") },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "description", labelKey: "field.description", type: "textarea", span: "full" },
      { key: "users", labelKey: "roles.field.users", type: "tags", span: "full", group: "roles.field.users" },
      { key: "groups", labelKey: "roles.field.groups", type: "tags", span: "full" },
      { key: "roles", labelKey: "roles.field.roles", type: "tags", span: "full" },
      { key: "domains", labelKey: "roles.field.domains", type: "tags", span: "full" },
      { key: "isEnabled", labelKey: "field.isEnabled", type: "switch" },
    ],
  },

  permissions: {
    entityType: "permission",
    entityTypePlural: "permissions",
    titleKey: "permissions.title",
    subtitleKey: "permissions.subtitle",
    addButtonKey: "permissions.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "resources", title: "col.resources", render: tagsList("resources") },
      { key: "actions", title: "col.actions", render: tagsList("actions") },
      { key: "effect", title: "col.effect", render: (_: unknown, r: Record<string, unknown>) =>
        <StatusBadge status={r.effect === "Allow" ? "active" : "error"} label={String(r.effect ?? "—")} />
      },
      { key: "isEnabled", title: "col.enabled", render: boolBadge("isEnabled") },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "description", labelKey: "field.description", type: "textarea", span: "full" },
      { key: "model", labelKey: "permissions.field.model", type: "text", group: "permissions.field.model" },
      { key: "resourceType", labelKey: "permissions.field.resourceType", type: "select", options: [
        { value: "Application", label: "Application" }, { value: "TreeNode", label: "Tree Node" },
        { value: "Custom", label: "Custom" }, { value: "API", label: "API" },
      ] },
      { key: "resources", labelKey: "permissions.field.resources", type: "tags", span: "full" },
      { key: "actions", labelKey: "permissions.field.actions", type: "tags", span: "full" },
      { key: "effect", labelKey: "permissions.field.effect", type: "select", options: [
        { value: "Allow", label: "Allow" }, { value: "Deny", label: "Deny" },
      ] },
      { key: "users", labelKey: "permissions.field.users", type: "tags", span: "full", group: "permissions.field.users" },
      { key: "groups", labelKey: "permissions.field.groups", type: "tags", span: "full" },
      { key: "roles", labelKey: "permissions.field.roles", type: "tags", span: "full" },
      { key: "domains", labelKey: "permissions.field.domains", type: "tags", span: "full" },
      { key: "isEnabled", labelKey: "field.isEnabled", type: "switch", group: "field.state" },
      { key: "state", labelKey: "field.state", type: "select", options: [
        { value: "Approved", label: "Approved" }, { value: "Pending", label: "Pending" },
      ] },
    ],
  },

  models: {
    entityType: "model",
    entityTypePlural: "models",
    titleKey: "models.title",
    subtitleKey: "models.subtitle",
    addButtonKey: "models.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "modelText", title: "col.modelText", render: truncate("modelText", 60) },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "description", labelKey: "field.description", type: "textarea", span: "full" },
      { key: "modelText", labelKey: "models.field.modelText", type: "code", span: "full", rows: 15, group: "models.field.modelText" },
    ],
  },

  // ═══ AUDIT ═══
  tokens: {
    entityType: "token",
    entityTypePlural: "tokens",
    titleKey: "tokens.title",
    subtitleKey: "tokens.subtitle",
    addButtonKey: "tokens.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "application", title: "col.application", sortable: true },
      { key: "organization", title: "col.organization", sortable: true },
      { key: "user", title: "col.user", sortable: true },
      { key: "expiresIn", title: "col.expiresIn", sortable: true, render: monoMuted("expiresIn") },
      { key: "scope", title: "col.scope", render: monoMuted("scope") },
    ],
    editFields: [
      { key: "name", labelKey: "field.name", type: "text", disabled: true, group: "field.name" },
      { key: "application", labelKey: "tokens.field.application", type: "text" },
      { key: "organization", labelKey: "field.owner", type: "text" },
      { key: "user", labelKey: "field.user", type: "text" },
      { key: "code", labelKey: "tokens.field.code", type: "text", mono: true },
      { key: "expiresIn", labelKey: "tokens.field.expiresIn", type: "number" },
      { key: "scope", labelKey: "tokens.field.scope", type: "text" },
      { key: "tokenType", labelKey: "tokens.field.tokenType", type: "text" },
      { key: "accessToken", labelKey: "tokens.field.accessToken", type: "code", span: "full", rows: 6, group: "tokens.field.accessToken" },
    ],
  },

  records: {
    entityType: "record",
    entityTypePlural: "records",
    titleKey: "records.title",
    subtitleKey: "records.subtitle",
    canAdd: false,
    canDelete: false,
    listOnly: true,
    listColumns: [
      { key: "id", title: "col.id", sortable: true, render: monoMuted("id") },
      { key: "createdTime", title: "col.timestamp", sortable: true, render: dateCol("createdTime") },
      { key: "organization", title: "col.organization", sortable: true },
      { key: "user", title: "col.user", sortable: true },
      { key: "method", title: "col.method", render: (_: unknown, r: Record<string, unknown>) => (
        <span className={`font-mono text-[11px] font-bold ${
          r.method === "GET" ? "text-info" : r.method === "POST" ? "text-success" :
          r.method === "DELETE" ? "text-danger" : "text-warning"
        }`}>{String(r.method ?? "")}</span>
      ) },
      { key: "requestUri", title: "col.requestUri", render: truncate("requestUri", 35) },
      { key: "statusCode", title: "col.statusCode", render: (_: unknown, r: Record<string, unknown>) => {
        const code = Number(r.statusCode ?? 0);
        return <span className={`font-mono text-[12px] font-medium ${
          code < 300 ? "text-success" : code < 400 ? "text-info" : "text-danger"
        }`}>{code || "—"}</span>;
      } },
      { key: "clientIp", title: "col.clientIp", render: monoMuted("clientIp") },
    ],
    editFields: [],
  },

  sessions: {
    entityType: "session",
    entityTypePlural: "sessions",
    titleKey: "sessions.title",
    subtitleKey: "sessions.subtitle",
    canAdd: false,
    listOnly: true,
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "sessionId", title: "col.sessionId", render: tagsList("sessionId") },
    ],
    editFields: [],
  },

  // ═══ BUSINESS ═══
  products: {
    entityType: "product",
    entityTypePlural: "products",
    titleKey: "products.title",
    subtitleKey: "products.subtitle",
    addButtonKey: "products.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "price", title: "col.price", render: (_: unknown, r: Record<string, unknown>) =>
        <span className="font-mono font-medium">{String(r.price ?? "")} {String(r.currency ?? "")}</span>
      },
      { key: "quantity", title: "col.quantity", render: monoMuted("quantity") },
      { key: "sold", title: "col.sold", render: monoMuted("sold") },
      { key: "state", title: "col.state", render: (_: unknown, r: Record<string, unknown>) =>
        <StatusBadge status={r.state === "Published" ? "active" : "inactive"} label={String(r.state ?? "—")} />
      },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "description", labelKey: "field.description", type: "textarea", span: "full" },
      { key: "image", labelKey: "products.field.image", type: "url", span: "full", group: "products.field.price" },
      { key: "price", labelKey: "products.field.price", type: "number" },
      { key: "currency", labelKey: "products.field.currency", type: "select", options: [
        { value: "USD", label: "USD" }, { value: "CNY", label: "CNY" }, { value: "EUR", label: "EUR" },
      ] },
      { key: "quantity", labelKey: "products.field.quantity", type: "number" },
      { key: "sold", labelKey: "products.field.sold", type: "number", disabled: true },
      { key: "isRecharge", labelKey: "products.field.isRecharge", type: "switch" },
      { key: "state", labelKey: "field.state", type: "select", options: [
        { value: "Published", label: "Published" }, { value: "Draft", label: "Draft" },
      ] },
      { key: "successUrl", labelKey: "products.field.successUrl", type: "url", span: "full" },
      { key: "providers", labelKey: "products.field.providers", type: "tags", span: "full" },
    ],
  },

  plans: {
    entityType: "plan",
    entityTypePlural: "plans",
    titleKey: "plans.title",
    subtitleKey: "plans.subtitle",
    addButtonKey: "plans.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "price", title: "col.price", render: (_: unknown, r: Record<string, unknown>) =>
        <span className="font-mono font-medium">{String(r.price ?? "")} {String(r.currency ?? "")}</span>
      },
      { key: "period", title: "col.period", render: monoMuted("period") },
      { key: "isEnabled", title: "col.enabled", render: boolBadge("isEnabled") },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "description", labelKey: "field.description", type: "textarea", span: "full" },
      { key: "price", labelKey: "plans.field.price", type: "number", group: "plans.field.price" },
      { key: "currency", labelKey: "plans.field.currency", type: "select", options: [
        { value: "USD", label: "USD" }, { value: "CNY", label: "CNY" }, { value: "EUR", label: "EUR" },
      ] },
      { key: "period", labelKey: "plans.field.period", type: "select", options: [
        { value: "Monthly", label: "Monthly" }, { value: "Yearly", label: "Yearly" },
      ] },
      { key: "role", labelKey: "plans.field.role", type: "text" },
      { key: "isExclusive", labelKey: "plans.field.isExclusive", type: "switch" },
      { key: "isEnabled", labelKey: "field.isEnabled", type: "switch" },
      { key: "paymentProviders", labelKey: "plans.field.paymentProviders", type: "tags", span: "full" },
    ],
  },

  pricings: {
    entityType: "pricing",
    entityTypePlural: "pricings",
    titleKey: "pricings.title",
    subtitleKey: "pricings.subtitle",
    addButtonKey: "pricings.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "application", title: "col.application" },
      { key: "plans", title: "col.plans", render: tagsList("plans") },
      { key: "isEnabled", title: "col.enabled", render: boolBadge("isEnabled") },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "description", labelKey: "field.description", type: "textarea", span: "full" },
      { key: "application", labelKey: "pricings.field.application", type: "text", group: "pricings.field.plans" },
      { key: "trialDuration", labelKey: "pricings.field.trialDuration", type: "number" },
      { key: "plans", labelKey: "pricings.field.plans", type: "tags", span: "full" },
      { key: "isEnabled", labelKey: "field.isEnabled", type: "switch" },
    ],
  },

  subscriptions: {
    entityType: "subscription",
    entityTypePlural: "subscriptions",
    titleKey: "subs.title",
    subtitleKey: "subs.subtitle",
    addButtonKey: "subs.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "user", title: "col.user" },
      { key: "plan", title: "Plan" },
      { key: "period", title: "col.period", render: monoMuted("period") },
      { key: "state", title: "col.state", render: (_: unknown, r: Record<string, unknown>) => {
        const s = String(r.state ?? "");
        const status = s === "Active" ? "active" : s === "Pending" ? "pending" : s === "Expired" ? "inactive" : "warning";
        return <StatusBadge status={status} label={s || "—"} />;
      } },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "user", labelKey: "field.user", type: "text", group: "subs.field.plan" },
      { key: "pricing", labelKey: "subs.field.pricing", type: "text" },
      { key: "plan", labelKey: "subs.field.plan", type: "text" },
      { key: "payment", labelKey: "subs.field.payment", type: "text", disabled: true },
      { key: "period", labelKey: "subs.field.period", type: "select", options: [
        { value: "Monthly", label: "Monthly" }, { value: "Yearly", label: "Yearly" },
      ] },
      { key: "startTime", labelKey: "subs.field.startTime", type: "text", group: "subs.field.startTime" },
      { key: "endTime", labelKey: "subs.field.endTime", type: "text" },
      { key: "state", labelKey: "field.state", type: "select", options: [
        { value: "Pending", label: "Pending" }, { value: "Active", label: "Active" },
        { value: "Upcoming", label: "Upcoming" }, { value: "Expired", label: "Expired" },
        { value: "Suspended", label: "Suspended" }, { value: "Error", label: "Error" },
      ] },
    ],
  },

  payments: {
    entityType: "payment",
    entityTypePlural: "payments",
    titleKey: "payments.title",
    subtitleKey: "payments.subtitle",
    canAdd: false,
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "user", title: "col.user" },
      { key: "provider", title: "col.provider" },
      { key: "type", title: "col.type", render: monoMuted("type") },
      { key: "price", title: "col.amount", render: (_: unknown, r: Record<string, unknown>) =>
        <span className="font-mono font-medium">{String(r.price ?? "")} {String(r.currency ?? "")}</span>
      },
      { key: "state", title: "col.state", render: (_: unknown, r: Record<string, unknown>) => {
        const s = String(r.state ?? "");
        const status = s === "Paid" ? "active" : s === "Created" ? "pending" : "error";
        return <StatusBadge status={status} label={s || "—"} />;
      } },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", disabled: true, mono: true },
      { key: "provider", labelKey: "payments.field.provider", type: "text", disabled: true },
      { key: "type", labelKey: "field.type", type: "text", disabled: true },
      { key: "user", labelKey: "field.user", type: "text", disabled: true, group: "payments.field.amount" },
      { key: "price", labelKey: "payments.field.amount", type: "number", disabled: true },
      { key: "currency", labelKey: "payments.field.currency", type: "text", disabled: true },
      { key: "state", labelKey: "field.state", type: "text", disabled: true },
      { key: "payUrl", labelKey: "payments.field.payUrl", type: "url", span: "full" },
      { key: "invoiceUrl", labelKey: "payments.field.invoiceUrl", type: "url", span: "full" },
    ],
  },

  transactions: {
    entityType: "transaction",
    entityTypePlural: "transactions",
    titleKey: "transactions.title",
    subtitleKey: "transactions.subtitle",
    canAdd: false,
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "user", title: "col.user" },
      { key: "category", title: "col.category", render: (_: unknown, r: Record<string, unknown>) =>
        <StatusBadge status={r.category === "Recharge" ? "active" : "warning"} label={String(r.category ?? "—")} />
      },
      { key: "amount", title: "col.amount", render: (_: unknown, r: Record<string, unknown>) =>
        <span className={`font-mono font-medium ${Number(r.amount) >= 0 ? "text-success" : "text-danger"}`}>{String(r.amount ?? "")} {String(r.currency ?? "")}</span>
      },
      { key: "state", title: "col.state", render: monoMuted("state") },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", disabled: true, mono: true },
      { key: "user", labelKey: "field.user", type: "text" },
      { key: "category", labelKey: "transactions.field.category", type: "text", disabled: true },
      { key: "amount", labelKey: "transactions.field.amount", type: "number", group: "transactions.field.amount" },
      { key: "currency", labelKey: "transactions.field.currency", type: "text" },
      { key: "payment", labelKey: "transactions.field.payment", type: "text", disabled: true },
      { key: "state", labelKey: "field.state", type: "text" },
    ],
  },

  orders: {
    entityType: "order",
    entityTypePlural: "orders",
    titleKey: "orders.title",
    subtitleKey: "orders.subtitle",
    canAdd: false,
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "user", title: "col.user" },
      { key: "products", title: "col.products", render: tagsList("products") },
      { key: "price", title: "col.price", render: (_: unknown, r: Record<string, unknown>) =>
        <span className="font-mono font-medium">{String(r.price ?? "")} {String(r.currency ?? "")}</span>
      },
      { key: "state", title: "col.state", render: (_: unknown, r: Record<string, unknown>) => {
        const s = String(r.state ?? "");
        const status = s === "Paid" ? "active" : s === "Created" ? "pending" : "error";
        return <StatusBadge status={status} label={s || "—"} />;
      } },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "field.name" },
      { key: "name", labelKey: "field.name", type: "text", disabled: true, mono: true },
      { key: "user", labelKey: "field.user", type: "text", disabled: true },
      { key: "products", labelKey: "orders.field.products", type: "tags", span: "full" },
      { key: "price", labelKey: "orders.field.price", type: "number", disabled: true, group: "orders.field.price" },
      { key: "currency", labelKey: "orders.field.currency", type: "text", disabled: true },
      { key: "payment", labelKey: "orders.field.payment", type: "text", disabled: true },
      { key: "state", labelKey: "field.state", type: "text", disabled: true },
    ],
  },

  resources: {
    entityType: "resource",
    entityTypePlural: "resources",
    titleKey: "resources.title",
    subtitleKey: "resources.subtitle",
    canAdd: false,
    canDelete: true,
    listOnly: true,
    listColumns: [
      { key: "provider", title: "col.provider", sortable: true },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "user", title: "col.user", sortable: true },
      { key: "name", title: "col.name", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "tag", title: "resources.col.tag", sortable: true },
      { key: "fileType", title: "col.type", sortable: true },
      { key: "fileSize", title: "resources.col.fileSize", sortable: true },
    ],
    editFields: [],
  },

  keys: {
    entityType: "key",
    entityTypePlural: "keys",
    titleKey: "keys.title",
    subtitleKey: "keys.subtitle",
    addButtonKey: "keys.add",
    canAdd: true,
    canDelete: true,
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "type", title: "col.type", sortable: true },
      { key: "accessKey", title: "keys.field.accessKey", sortable: true, render: monoMuted("accessKey") },
      { key: "expireTime", title: "keys.field.expireTime", sortable: true, render: dateCol("expireTime") },
      { key: "state", title: "col.state", sortable: true, render: boolBadge("state", "Active", "Inactive") },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true, group: "keys.section.basic" },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "type", labelKey: "field.type", type: "select", options: [
        { value: "Organization", label: "Organization" },
        { value: "Application", label: "Application" },
        { value: "User", label: "User" },
        { value: "General", label: "General" },
      ] },
      { key: "state", labelKey: "field.state", type: "select", options: [
        { value: "Active", label: "Active" },
        { value: "Inactive", label: "Inactive" },
      ] },
    ],
  },

  // ═══ AUTHORIZATION ═══
  adapters: {
    entityType: "adapter",
    entityTypePlural: "adapters",
    titleKey: "adapters.title",
    subtitleKey: "adapters.subtitle",
    addButtonKey: "adapters.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "type", title: "col.type", sortable: true },
      { key: "host", title: "adapters.field.host" },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "type", labelKey: "field.type", type: "text" },
      { key: "host", labelKey: "adapters.field.host", type: "text" },
    ],
  },
  enforcers: {
    entityType: "enforcer",
    entityTypePlural: "enforcers",
    titleKey: "enforcers.title",
    subtitleKey: "enforcers.subtitle",
    addButtonKey: "enforcers.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "model", title: "models.title" },
      { key: "adapter", title: "adapters.title" },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "model", labelKey: "models.title", type: "text" },
      { key: "adapter", labelKey: "adapters.title", type: "text" },
    ],
  },

  // ═══ LLM AI ═══
  agents: {
    entityType: "agent",
    entityTypePlural: "agents",
    titleKey: "agents.title",
    subtitleKey: "agents.subtitle",
    addButtonKey: "agents.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "displayName", title: "col.displayName", sortable: true },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
    ],
  },
  servers: {
    entityType: "server",
    entityTypePlural: "servers",
    titleKey: "servers.title",
    subtitleKey: "servers.subtitle",
    addButtonKey: "servers.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "displayName", title: "col.displayName", sortable: true },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
    ],
  },
  entries: {
    entityType: "entry",
    entityTypePlural: "entries",
    titleKey: "entries.title",
    subtitleKey: "entries.subtitle",
    addButtonKey: "entries.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
    ],
  },
  sites: {
    entityType: "site",
    entityTypePlural: "sites",
    titleKey: "sites.title",
    subtitleKey: "sites.subtitle",
    addButtonKey: "sites.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "domain", title: "sites.field.domain" },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "domain", labelKey: "sites.field.domain", type: "text" },
    ],
  },
  rules: {
    entityType: "rule",
    entityTypePlural: "rules",
    titleKey: "rules.title",
    subtitleKey: "rules.subtitle",
    addButtonKey: "rules.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "type", title: "col.type", sortable: true },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "type", labelKey: "field.type", type: "text" },
    ],
  },

  // ═══ AUDIT (additional) ═══
  verifications: {
    entityType: "verification",
    entityTypePlural: "verifications",
    titleKey: "verifications.title",
    subtitleKey: "verifications.subtitle",
    listOnly: true,
    canAdd: false,
    canDelete: false,
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "type", title: "col.type", sortable: true },
      { key: "user", title: "col.user", sortable: true },
      { key: "receiver", title: "verifications.field.receiver" },
    ],
    editFields: [],
  },

  // ═══ ADMIN ═══
  syncers: {
    entityType: "syncer",
    entityTypePlural: "syncers",
    titleKey: "syncers.title",
    subtitleKey: "syncers.subtitle",
    addButtonKey: "syncers.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "type", title: "col.type", sortable: true },
      { key: "host", title: "syncers.field.host" },
      { key: "isEnabled", title: "col.enabled", render: boolBadge("isEnabled") },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "type", labelKey: "field.type", type: "text" },
      { key: "host", labelKey: "syncers.field.host", type: "text" },
      { key: "isEnabled", labelKey: "field.isEnabled", type: "switch" },
    ],
  },
  webhooks: {
    entityType: "webhook",
    entityTypePlural: "webhooks",
    titleKey: "webhooks.title",
    subtitleKey: "webhooks.subtitle",
    addButtonKey: "webhooks.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "url", title: "field.url" },
      { key: "isEnabled", title: "col.enabled", render: boolBadge("isEnabled") },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "url", labelKey: "field.url", type: "text" },
      { key: "isEnabled", labelKey: "field.isEnabled", type: "switch" },
    ],
  },
  "webhook-events": {
    entityType: "webhook-event",
    entityTypePlural: "webhook-events",
    titleKey: "webhookEvents.title",
    subtitleKey: "webhookEvents.subtitle",
    listOnly: true,
    canAdd: false,
    canDelete: false,
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
    ],
    editFields: [],
  },
  forms: {
    entityType: "form",
    entityTypePlural: "forms",
    titleKey: "forms.title",
    subtitleKey: "forms.subtitle",
    addButtonKey: "forms.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "type", title: "col.type", sortable: true },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "type", labelKey: "field.type", type: "text" },
    ],
  },
  tickets: {
    entityType: "ticket",
    entityTypePlural: "tickets",
    titleKey: "tickets.title",
    subtitleKey: "tickets.subtitle",
    addButtonKey: "tickets.add",
    listColumns: [
      { key: "name", title: "col.name", sortable: true, render: linkName },
      { key: "owner", title: "col.organization", sortable: true },
      { key: "createdTime", title: "col.created", sortable: true, render: dateCol("createdTime") },
      { key: "displayName", title: "col.displayName", sortable: true },
      { key: "state", title: "col.state", sortable: true },
    ],
    editFields: [
      { key: "owner", labelKey: "field.owner", type: "text", disabled: true },
      { key: "name", labelKey: "field.name", type: "text", required: true, mono: true },
      { key: "displayName", labelKey: "field.displayName", type: "text" },
      { key: "state", labelKey: "field.state", type: "text" },
    ],
  },
};
