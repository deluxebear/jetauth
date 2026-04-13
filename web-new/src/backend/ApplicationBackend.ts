import { request, paginationQuery } from "./request";

export interface Application {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  category: string;
  type: string;
  logo: string;
  title: string;
  favicon: string;
  order: number;
  homepageUrl: string;
  description: string;
  organization: string;
  cert: string;
  defaultGroup: string;
  headerHtml: string;
  tags: string[];
  isShared: boolean;
  ipRestriction: string;

  // Authentication flags
  enablePassword: boolean;
  enableSignUp: boolean;
  enableGuestSignin: boolean;
  disableSignin: boolean;
  enableSigninSession: boolean;
  enableAutoSignin: boolean;
  enableCodeSignin: boolean;
  enableExclusiveSignin: boolean;
  enableWebAuthn: boolean;
  enableLinkWithEmail: boolean;

  // SAML
  enableSamlCompress: boolean;
  enableSamlC14n10: boolean;
  enableSamlPostBinding: boolean;
  disableSamlAttributes: boolean;
  enableSamlAssertionSignature: boolean;
  useEmailAsSamlNameId: boolean;
  samlReplyUrl: string;
  samlHashAlgorithm: string;
  samlAttributes: unknown[];

  // OAuth/OIDC
  clientId: string;
  clientSecret: string;
  clientCert: string;
  redirectUris: string[];
  forcedRedirectOrigin: string;
  grantTypes: string[];

  // Token
  tokenFormat: string;
  tokenSigningMethod: string;
  tokenFields: string[];
  tokenAttributes: unknown[];
  expireInHours: number;
  refreshExpireInHours: number;
  cookieExpireInHours: number;

  // URLs
  signupUrl: string;
  signinUrl: string;
  forgetUrl: string;
  affiliationUrl: string;
  termsOfUse: string;

  // UI
  signupHtml: string;
  signinHtml: string;
  footerHtml: string;
  formCss: string;
  formCssMobile: string;
  formOffset: number;
  formSideHtml: string;
  formBackgroundUrl: string;
  formBackgroundUrlMobile: string;
  themeData: unknown;

  // Provider/Scope config
  providers: unknown[];
  scopes: unknown[];
  customScopes: unknown[];
  signinMethods: unknown[];
  signupItems: unknown[];
  signinItems: unknown[];
  orgChoiceMode: string;

  // Security
  failedSigninLimit: number;
  failedSigninFrozenTime: number;
  codeResendTimeout: number;
  ipWhitelist: string;

  // Reverse proxy
  domain: string;
  otherDomains: string[];
  upstreamHost: string;
  sslMode: string;
  sslCert: string;

  [key: string]: unknown;
}

export function getApplications(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Application[]>("GET", `/api/get-applications?${paginationQuery(params)}`);
}

export function getApplicationsByOrganization(params: {
  owner: string;
  organization: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Application[]>("GET", `/api/get-organization-applications?${paginationQuery(params)}`);
}

export function getApplication(owner: string, name: string) {
  return request<Application>(
    "GET",
    `/api/get-application?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addApplication(app: Application) {
  return request("POST", "/api/add-application", app);
}

export function updateApplication(owner: string, name: string, app: Application) {
  return request(
    "POST",
    `/api/update-application?id=${owner}/${encodeURIComponent(name)}`,
    app
  );
}

export function deleteApplication(app: Application) {
  return request("POST", "/api/delete-application", app);
}

export function newApplication(orgName: string): Application {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner: "admin",
    name: `application_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Application - ${rand}`,
    category: "Default",
    type: "All",
    logo: "/img/logo.png",
    title: "",
    favicon: "",
    order: 0,
    homepageUrl: "",
    description: "",
    organization: orgName,
    cert: "cert-built-in",
    defaultGroup: "",
    headerHtml: "",
    tags: [],
    isShared: false,
    ipRestriction: "",
    enablePassword: true,
    enableSignUp: true,
    enableGuestSignin: false,
    disableSignin: false,
    enableSigninSession: false,
    enableAutoSignin: false,
    enableCodeSignin: false,
    enableExclusiveSignin: false,
    enableWebAuthn: false,
    enableLinkWithEmail: false,
    enableSamlCompress: false,
    enableSamlC14n10: false,
    enableSamlPostBinding: false,
    disableSamlAttributes: false,
    enableSamlAssertionSignature: false,
    useEmailAsSamlNameId: false,
    samlReplyUrl: "",
    samlHashAlgorithm: "",
    samlAttributes: [],
    clientId: "",
    clientSecret: "",
    clientCert: "",
    redirectUris: ["http://localhost:9000/callback"],
    forcedRedirectOrigin: "",
    grantTypes: ["authorization_code", "password", "client_credentials", "token", "id_token", "refresh_token"],
    tokenFormat: "JWT",
    tokenSigningMethod: "RS256",
    tokenFields: [],
    tokenAttributes: [],
    expireInHours: 168,
    refreshExpireInHours: 168,
    cookieExpireInHours: 720,
    signupUrl: "",
    signinUrl: "",
    forgetUrl: "",
    affiliationUrl: "",
    termsOfUse: "",
    signupHtml: "",
    signinHtml: "",
    footerHtml: "",
    formCss: "",
    formCssMobile: "",
    formOffset: 2,
    formSideHtml: "",
    formBackgroundUrl: "",
    formBackgroundUrlMobile: "",
    themeData: null,
    providers: [],
    scopes: [],
    customScopes: [],
    signinMethods: [
      { name: "Password", displayName: "Password", rule: "All" },
      { name: "Verification code", displayName: "Verification code", rule: "All" },
      { name: "WebAuthn", displayName: "WebAuthn", rule: "None" },
      { name: "Face ID", displayName: "Face ID", rule: "None" },
    ],
    signupItems: [
      { name: "ID", visible: false, required: true, rule: "Random" },
      { name: "Username", visible: true, required: true, rule: "None" },
      { name: "Display name", visible: true, required: true, rule: "None" },
      { name: "Password", visible: true, required: true, rule: "None" },
      { name: "Confirm password", visible: true, required: true, rule: "None" },
      { name: "Email", visible: true, required: true, rule: "Normal" },
      { name: "Phone", visible: true, required: true, rule: "None" },
      { name: "Agreement", visible: true, required: true, rule: "None" },
      { name: "Signup button", visible: true, required: true, rule: "None" },
      { name: "Providers", visible: true, required: true, rule: "None" },
    ],
    signinItems: [],
    orgChoiceMode: "",
    failedSigninLimit: 0,
    failedSigninFrozenTime: 0,
    codeResendTimeout: 0,
    ipWhitelist: "",
    domain: "",
    otherDomains: [],
    upstreamHost: "",
    sslMode: "",
    sslCert: "",
  };
}
