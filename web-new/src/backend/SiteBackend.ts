import { request, paginationQuery } from "./request";

export interface NodeItem {
  name: string;
  version: string;
  diff: string;
  pid: number;
  status: string;
  message: string;
  provider: string;
}

export interface Site {
  owner: string;
  name: string;
  createdTime: string;
  updatedTime: string;
  displayName: string;
  tag: string;
  domain: string;
  otherDomains: string[];
  needRedirect: boolean;
  disableVerbose: boolean;
  rules: string[];
  enableAlert: boolean;
  alertInterval: number;
  alertTryTimes: number;
  alertProviders: string[];
  challenges: string[];
  host: string;
  port: number;
  hosts: string[];
  sslMode: string;
  sslCert: string;
  publicIp: string;
  node: string;
  isSelf: boolean;
  status: string;
  nodes: NodeItem[];
  casdoorApplication: string;
  [key: string]: unknown;
}

export function getGlobalSites() {
  return request<Site[]>("GET", "/api/get-global-sites");
}

export function getSites(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Site[]>("GET", `/api/get-sites?${paginationQuery(params)}`);
}

export function getSite(owner: string, name: string) {
  return request<Site>(
    "GET",
    `/api/get-site?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addSite(site: Site) {
  return request("POST", "/api/add-site", site);
}

export function updateSite(owner: string, name: string, site: Site) {
  return request(
    "POST",
    `/api/update-site?id=${owner}/${encodeURIComponent(name)}`,
    site
  );
}

export function deleteSite(site: Site) {
  return request("POST", "/api/delete-site", site);
}

export function newSite(owner: string): Site {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `site_${rand}`,
    createdTime: new Date().toISOString(),
    updatedTime: "",
    displayName: `New Site - ${rand}`,
    tag: "",
    domain: "door.casdoor.com",
    otherDomains: [],
    needRedirect: false,
    disableVerbose: false,
    rules: [],
    enableAlert: false,
    alertInterval: 60,
    alertTryTimes: 3,
    alertProviders: [],
    challenges: [],
    host: "",
    port: 8000,
    hosts: [],
    sslMode: "HTTPS Only",
    sslCert: "",
    publicIp: "",
    node: "",
    isSelf: false,
    status: "Active",
    nodes: [],
    casdoorApplication: "",
  };
}
