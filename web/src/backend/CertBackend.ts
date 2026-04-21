import { request, paginationQuery } from "./request";

export interface Cert {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  scope: string;
  type: string;
  cryptoAlgorithm: string;
  bitSize: number;
  expireInYears: number;
  expireTime: string;
  domainExpireTime: string;
  provider: string;
  account: string;
  accessKey: string;
  accessSecret: string;
  certificate: string;
  privateKey: string;
  [key: string]: unknown;
}

export function getCerts(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Cert[]>("GET", `/api/get-certs?${paginationQuery(params)}`);
}

export function getCert(owner: string, name: string) {
  return request<Cert>(
    "GET",
    `/api/get-cert?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addCert(cert: Cert) {
  return request("POST", "/api/add-cert", cert);
}

export function updateCert(owner: string, name: string, cert: Cert) {
  return request(
    "POST",
    `/api/update-cert?id=${owner}/${encodeURIComponent(name)}`,
    cert
  );
}

export function deleteCert(cert: Cert) {
  return request("POST", "/api/delete-cert", cert);
}

export function refreshDomainExpire(owner: string, name: string) {
  return request(
    "POST",
    `/api/update-cert-domain-expire?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function newCert(owner: string): Cert {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `cert_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Cert - ${rand}`,
    scope: "JWT",
    type: "x509",
    cryptoAlgorithm: "RS256",
    bitSize: 4096,
    expireInYears: 20,
    expireTime: "",
    domainExpireTime: "",
    provider: "",
    account: "",
    accessKey: "",
    accessSecret: "",
    certificate: "",
    privateKey: "",
  };
}
