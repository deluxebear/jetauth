import { request, paginationQuery } from "./request";

export interface Organization {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  websiteUrl: string;
  logo: string;
  logoDark: string;
  favicon: string;
  hasPrivilegeConsent: boolean;
  passwordType: string;
  passwordSalt: string;
  passwordOptions: string[];
  passwordObfuscatorType: string;
  passwordObfuscatorKey: string;
  passwordExpireDays: number;
  countryCodes: string[];
  languages: string[];
  defaultAvatar: string;
  usePermanentAvatar: boolean;
  defaultApplication: string;
  userTypes: string[];
  tags: string[];
  masterPassword: string;
  defaultPassword: string;
  masterVerificationCode: string;
  ipWhitelist: string;
  initScore: number;
  enableSoftDeletion: boolean;
  isProfilePublic: boolean;
  useEmailAsUsername: boolean;
  enableTour: boolean;
  disableSignin: boolean;
  mfaRememberInHours: number;
  balanceCurrency: string;
  orgBalance: number;
  userBalance: number;
  balanceCredit: number;
  accountItems: AccountItem[];
  [key: string]: unknown;
}

export interface AccountItem {
  name: string;
  visible: boolean;
  viewRule: string;
  modifyRule: string;
  regex: string;
  tab: string;
}

export function getOrganizations(params: {
  owner: string;
  organizationName?: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  const qs = paginationQuery(params);
  return request<Organization[]>("GET", `/api/get-organizations?${qs}`);
}

export function getOrganization(owner: string, name: string) {
  return request<Organization>(
    "GET",
    `/api/get-organization?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addOrganization(org: Organization) {
  return request("POST", "/api/add-organization", org);
}

export function updateOrganization(owner: string, name: string, org: Organization) {
  return request(
    "POST",
    `/api/update-organization?id=${owner}/${encodeURIComponent(name)}`,
    org
  );
}

export function deleteOrganization(org: Organization) {
  return request("POST", "/api/delete-organization", org);
}

export function getOrganizationNames(owner: string) {
  return request<{ name: string; displayName: string }[]>(
    "GET",
    `/api/get-organization-names?owner=${owner}`
  );
}

// Default values for creating a new Organization
export function newOrganization(randomName: string): Organization {
  return {
    owner: "admin",
    name: `organization_${randomName}`,
    createdTime: new Date().toISOString(),
    displayName: `New Organization - ${randomName}`,
    websiteUrl: "",
    logo: "/img/logo.png",
    logoDark: "/img/logo-dark.png",
    favicon: "/img/favicon.png",
    hasPrivilegeConsent: false,
    passwordType: "bcrypt",
    passwordSalt: "",
    passwordOptions: ["AtLeast6"],
    passwordObfuscatorType: "Plain",
    passwordObfuscatorKey: "",
    passwordExpireDays: 0,
    countryCodes: ["CN"],
    languages: ["en", "zh", "es", "fr", "de", "id", "ja", "ko", "ru", "vi", "pt"],
    defaultAvatar: "/img/avatar.png",
    usePermanentAvatar: false,
    defaultApplication: "",
    userTypes: [],
    tags: [],
    masterPassword: "",
    defaultPassword: "",
    masterVerificationCode: "",
    ipWhitelist: "",
    initScore: 0,
    enableSoftDeletion: false,
    isProfilePublic: true,
    useEmailAsUsername: false,
    enableTour: true,
    disableSignin: false,
    mfaRememberInHours: 12,
    balanceCurrency: "CNY",
    orgBalance: 0,
    userBalance: 0,
    balanceCredit: 0,
    accountItems: defaultAccountItems(),
  };
}

function defaultAccountItems(): AccountItem[] {
  const items: [string, boolean, string, string][] = [
    ["Organization", true, "Public", "Admin"],
    ["ID", true, "Public", "Immutable"],
    ["Name", true, "Public", "Admin"],
    ["Display name", true, "Public", "Self"],
    ["First name", true, "Public", "Self"],
    ["Last name", true, "Public", "Self"],
    ["Avatar", true, "Public", "Self"],
    ["User type", true, "Public", "Admin"],
    ["Password", true, "Self", "Self"],
    ["Email", true, "Public", "Self"],
    ["Phone", true, "Public", "Self"],
    ["Country code", true, "Public", "Self"],
    ["Country/Region", true, "Public", "Self"],
    ["Location", true, "Public", "Self"],
    ["Address", true, "Public", "Self"],
    ["Addresses", true, "Public", "Self"],
    ["Affiliation", true, "Public", "Self"],
    ["Title", true, "Public", "Self"],
    ["ID card type", true, "Public", "Self"],
    ["ID card", true, "Public", "Self"],
    ["ID card info", true, "Public", "Self"],
    ["Real name", true, "Public", "Self"],
    ["ID verification", true, "Self", "Self"],
    ["Homepage", true, "Public", "Self"],
    ["Bio", true, "Public", "Self"],
    ["Tag", true, "Public", "Admin"],
    ["Language", true, "Public", "Admin"],
    ["Gender", true, "Public", "Admin"],
    ["Birthday", true, "Public", "Admin"],
    ["Education", true, "Public", "Admin"],
    ["Score", true, "Public", "Admin"],
    ["Karma", true, "Public", "Admin"],
    ["Ranking", true, "Public", "Admin"],
    ["Balance", true, "Public", "Admin"],
    ["Balance credit", true, "Public", "Admin"],
    ["Balance currency", true, "Public", "Admin"],
    ["Cart", true, "Self", "Self"],
    ["Transactions", true, "Self", "Self"],
    ["Signup application", true, "Public", "Admin"],
    ["Register type", true, "Public", "Admin"],
    ["Register source", true, "Public", "Admin"],
    ["Groups", true, "Public", "Admin"],
    ["Roles", true, "Public", "Immutable"],
    ["Permissions", true, "Public", "Immutable"],
    ["Consents", true, "Self", "Self"],
    ["3rd-party logins", true, "Self", "Self"],
    ["Properties", false, "Admin", "Admin"],
    ["Is online", true, "Admin", "Admin"],
    ["Is admin", true, "Admin", "Admin"],
    ["Is forbidden", true, "Admin", "Admin"],
    ["Is deleted", true, "Admin", "Admin"],
    ["Multi-factor authentication", true, "Self", "Self"],
    ["MFA items", true, "Self", "Self"],
    ["WebAuthn credentials", true, "Self", "Self"],
    ["Last change password time", true, "Admin", "Admin"],
    ["Managed accounts", true, "Self", "Self"],
    ["Face ID", true, "Self", "Self"],
    ["MFA accounts", true, "Self", "Self"],
    ["Need update password", true, "Admin", "Admin"],
    ["IP whitelist", true, "Admin", "Admin"],
  ];
  return items.map(([name, visible, viewRule, modifyRule]) => ({
    name,
    visible,
    viewRule,
    modifyRule,
    regex: "",
    tab: "",
  }));
}
