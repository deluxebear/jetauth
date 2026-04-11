import { request } from "./request";

export interface Ldap {
  id: string;
  owner: string;
  createdTime: string;
  serverName: string;
  host: string;
  port: number;
  enableSsl: boolean;
  allowSelfSignedCert: boolean;
  username: string;
  password: string;
  baseDn: string;
  filter: string;
  filterFields: string[];
  defaultGroup: string;
  passwordType: string;
  customAttributes: Record<string, string>;
  autoSync: number;
  lastSync: string;
  enableGroups: boolean;
}

export interface LdapUser {
  uidNumber: string;
  uid: string;
  cn: string;
  gidNumber: string;
  uuid: string;
  userPrincipalName: string;
  displayName: string;
  email: string;
  mobile: string;
  country: string;
  countryName: string;
  groupId: string;
  address: string;
  memberOf: string[];
  attributes: Record<string, string>;
}

export interface LdapResp {
  users: LdapUser[];
  existUuids: string[];
}

export interface LdapSyncResp {
  exist: LdapUser[];
  failed: LdapUser[];
}

export function getLdaps(owner: string) {
  return request<Ldap[]>("GET", `/api/get-ldaps?owner=${owner}`);
}

export function getLdap(owner: string, name: string) {
  return request<Ldap>("GET", `/api/get-ldap?id=${owner}/${encodeURIComponent(name)}`);
}

export function addLdap(body: Partial<Ldap>) {
  return request<Ldap>("POST", "/api/add-ldap", body);
}

export function updateLdap(body: Ldap) {
  return request<boolean>("POST", "/api/update-ldap", body);
}

export function deleteLdap(body: Partial<Ldap>) {
  return request<boolean>("POST", "/api/delete-ldap", body);
}

export function getLdapUsers(owner: string, name: string) {
  return request<LdapResp>("GET", `/api/get-ldap-users?id=${owner}/${encodeURIComponent(name)}`);
}

export function syncLdapUsers(owner: string, name: string, users: LdapUser[]) {
  return request<LdapSyncResp>("POST", `/api/sync-ldap-users?id=${owner}/${encodeURIComponent(name)}`, users);
}
