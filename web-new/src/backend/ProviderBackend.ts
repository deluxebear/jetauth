import { request, paginationQuery } from "./request";

export interface Provider {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  category: string;
  type: string;
  subType: string;
  method: string;

  // Credentials
  clientId: string;
  clientSecret: string;
  clientId2: string;
  clientSecret2: string;
  cert: string;

  // Custom OAuth
  customAuthUrl: string;
  customTokenUrl: string;
  customUserInfoUrl: string;
  customLogo: string;

  // Mapping
  scopes: string;
  userMapping: Record<string, string>;
  httpHeaders: Record<string, string>;

  // Email/SMTP
  host: string;
  port: number;
  disableSsl: boolean;
  sslMode: string;
  title: string;
  content: string;
  receiver: string;

  // SMS
  regionId: string;
  signName: string;
  templateCode: string;
  appId: string;

  // Storage
  endpoint: string;
  intranetEndpoint: string;
  domain: string;
  bucket: string;
  pathPrefix: string;

  // SAML
  metadata: string;
  idP: string;
  issuerUrl: string;
  enableSignAuthnRequest: boolean;
  emailRegex: string;

  // General
  providerUrl: string;
  enableProxy: boolean;
  enablePkce: boolean;
  state: string;

  [key: string]: unknown;
}

export function getProviders(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Provider[]>("GET", `/api/get-providers?${paginationQuery(params)}`);
}

export function getProvider(owner: string, name: string) {
  return request<Provider>(
    "GET",
    `/api/get-provider?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addProvider(provider: Provider) {
  return request("POST", "/api/add-provider", provider);
}

export function updateProvider(owner: string, name: string, provider: Provider) {
  return request(
    "POST",
    `/api/update-provider?id=${owner}/${encodeURIComponent(name)}`,
    provider
  );
}

export function deleteProvider(provider: Provider) {
  return request("POST", "/api/delete-provider", provider);
}

export function newProvider(owner: string): Provider {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `provider_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Provider - ${rand}`,
    category: "OAuth",
    type: "GitHub",
    subType: "",
    method: "Normal",
    clientId: "",
    clientSecret: "",
    clientId2: "",
    clientSecret2: "",
    cert: "",
    customAuthUrl: "",
    customTokenUrl: "",
    customUserInfoUrl: "",
    customLogo: "",
    scopes: "",
    userMapping: {},
    httpHeaders: {},
    host: "",
    port: 0,
    disableSsl: false,
    sslMode: "",
    title: "",
    content: "",
    receiver: "",
    regionId: "",
    signName: "",
    templateCode: "",
    appId: "",
    endpoint: "",
    intranetEndpoint: "",
    domain: "",
    bucket: "",
    pathPrefix: "",
    metadata: "",
    idP: "",
    issuerUrl: "",
    enableSignAuthnRequest: false,
    emailRegex: "",
    providerUrl: "",
    enableProxy: false,
    enablePkce: false,
    state: "",
  };
}
