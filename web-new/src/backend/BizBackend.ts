import { request } from "./request";

// ── Interfaces ──

export interface BizAppConfig {
  owner: string;
  appName: string;
  createdTime: string;
  updatedTime: string;
  displayName: string;
  description: string;
  modelText: string;
  policyTable: string;
  isEnabled: boolean;
  [key: string]: unknown;
}

export interface BizRole {
  owner: string;
  appName: string;
  name: string;
  createdTime: string;
  displayName: string;
  description: string;
  users: string[];
  groups: string[];
  roles: string[];
  properties: string;
  isEnabled: boolean;
  [key: string]: unknown;
}

export interface BizPermission {
  owner: string;
  appName: string;
  name: string;
  createdTime: string;
  displayName: string;
  description: string;
  users: string[];
  roles: string[];
  resources: string[];
  actions: string[];
  effect: string;
  isEnabled: boolean;
  submitter: string;
  approver: string;
  approveTime: string;
  state: string;
  [key: string]: unknown;
}

export interface SyncStats {
  policyCount: number;
  roleCount: number;
}

export interface PoliciesExport {
  modelText: string;
  policies: string[][];
  groupingPolicies: string[][];
  version: string;
}

export interface UserPermissionSummary {
  roles: string[];
  allowedResources: string[];
  allowedActions: string[];
  properties: Record<string, unknown>;
}

// ── BizAppConfig CRUD ──

export function getBizAppConfigs(owner: string) {
  return request<BizAppConfig[]>("GET", `/api/biz-get-app-configs?owner=${encodeURIComponent(owner)}`);
}

export function getBizAppConfig(id: string) {
  return request<BizAppConfig>("GET", `/api/biz-get-app-config?id=${encodeURIComponent(id)}`);
}

export function addBizAppConfig(config: BizAppConfig) {
  return request("POST", "/api/biz-add-app-config", config);
}

export function updateBizAppConfig(id: string, config: BizAppConfig) {
  return request("POST", `/api/biz-update-app-config?id=${encodeURIComponent(id)}`, config);
}

export function deleteBizAppConfig(config: BizAppConfig) {
  return request("POST", "/api/biz-delete-app-config", config);
}

// ── BizRole CRUD ──

export function getBizRoles(owner: string, appName: string) {
  return request<BizRole[]>("GET", `/api/biz-get-roles?owner=${encodeURIComponent(owner)}&app=${encodeURIComponent(appName)}`);
}

export function getBizRole(owner: string, appName: string, name: string) {
  return request<BizRole>("GET", `/api/biz-get-role?owner=${encodeURIComponent(owner)}&app=${encodeURIComponent(appName)}&name=${encodeURIComponent(name)}`);
}

export function addBizRole(role: BizRole) {
  return request("POST", "/api/biz-add-role", role);
}

export function updateBizRole(owner: string, appName: string, name: string, role: BizRole) {
  return request("POST", `/api/biz-update-role?owner=${encodeURIComponent(owner)}&app=${encodeURIComponent(appName)}&name=${encodeURIComponent(name)}`, role);
}

export function deleteBizRole(role: BizRole) {
  return request("POST", "/api/biz-delete-role", role);
}

// ── BizPermission CRUD ──

export function getBizPermissions(owner: string, appName: string) {
  return request<BizPermission[]>("GET", `/api/biz-get-permissions?owner=${encodeURIComponent(owner)}&app=${encodeURIComponent(appName)}`);
}

export function getBizPermission(owner: string, appName: string, name: string) {
  return request<BizPermission>("GET", `/api/biz-get-permission?owner=${encodeURIComponent(owner)}&app=${encodeURIComponent(appName)}&name=${encodeURIComponent(name)}`);
}

export function addBizPermission(perm: BizPermission) {
  return request("POST", "/api/biz-add-permission", perm);
}

export function updateBizPermission(owner: string, appName: string, name: string, perm: BizPermission) {
  return request("POST", `/api/biz-update-permission?owner=${encodeURIComponent(owner)}&app=${encodeURIComponent(appName)}&name=${encodeURIComponent(name)}`, perm);
}

export function deleteBizPermission(perm: BizPermission) {
  return request("POST", "/api/biz-delete-permission", perm);
}

// ── Enforce ──

export function bizEnforce(appId: string, casbinRequest: unknown[]) {
  return request<boolean>("POST", `/api/biz-enforce?appId=${encodeURIComponent(appId)}`, casbinRequest);
}

export function bizBatchEnforce(appId: string, casbinRequests: unknown[][]) {
  return request<boolean[]>("POST", `/api/biz-batch-enforce?appId=${encodeURIComponent(appId)}`, casbinRequests);
}

// ── Policies Export (for SDK) ──

export function bizGetPolicies(appId: string) {
  return request<PoliciesExport>("GET", `/api/biz-get-policies?appId=${encodeURIComponent(appId)}`);
}

// ── User Roles & Permissions ──

export function bizGetUserRoles(appId: string, userId: string) {
  return request<string[]>("GET", `/api/biz-get-user-roles?appId=${encodeURIComponent(appId)}&userId=${encodeURIComponent(userId)}`);
}

export function bizGetUserPermissions(appId: string, userId: string) {
  return request<UserPermissionSummary>("GET", `/api/biz-get-user-permissions?appId=${encodeURIComponent(appId)}&userId=${encodeURIComponent(userId)}`);
}

// ── Sync Policies ──

export function bizSyncPolicies(appId: string) {
  return request<SyncStats>("POST", `/api/biz-sync-policies?appId=${encodeURIComponent(appId)}`);
}

// ── Factory Functions ──

export const DEFAULT_RBAC_MODEL = `[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && keyMatch5(r.obj, p.obj) && regexMatch(r.act, p.act)`;

/** Preset model templates for the wizard */
export interface ModelPreset {
  id: string;
  labelKey: string;
  descKey: string;
  scenarioKey: string;
  badge: string;
  modelText: string;
  recommended?: boolean;
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: "rbac-api",
    labelKey: "authz.preset.rbacApi.label",
    descKey: "authz.preset.rbacApi.desc",
    scenarioKey: "authz.preset.rbacApi.scenario",
    badge: "RBAC",
    recommended: true,
    modelText: `[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && keyMatch5(r.obj, p.obj) && regexMatch(r.act, p.act)`,
  },
  {
    id: "rbac-deny",
    labelKey: "authz.preset.rbacDeny.label",
    descKey: "authz.preset.rbacDeny.desc",
    scenarioKey: "authz.preset.rbacDeny.scenario",
    badge: "RBAC + Deny",
    modelText: `[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act, eft

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = g(r.sub, p.sub) && keyMatch5(r.obj, p.obj) && regexMatch(r.act, p.act)`,
  },
  {
    id: "rbac-domain",
    labelKey: "authz.preset.rbacDomain.label",
    descKey: "authz.preset.rbacDomain.desc",
    scenarioKey: "authz.preset.rbacDomain.scenario",
    badge: "RBAC + Domain",
    modelText: `[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && keyMatch5(r.obj, p.obj) && regexMatch(r.act, p.act)`,
  },
  {
    id: "acl",
    labelKey: "authz.preset.acl.label",
    descKey: "authz.preset.acl.desc",
    scenarioKey: "authz.preset.acl.scenario",
    badge: "ACL",
    modelText: `[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = r.sub == p.sub && keyMatch5(r.obj, p.obj) && regexMatch(r.act, p.act)`,
  },
  {
    id: "custom",
    labelKey: "authz.preset.custom.label",
    descKey: "authz.preset.custom.desc",
    scenarioKey: "authz.preset.custom.scenario",
    badge: "Custom",
    modelText: "",
  },
];

export function newBizAppConfig(owner: string, appName: string): BizAppConfig {
  return {
    owner,
    appName,
    createdTime: new Date().toISOString(),
    updatedTime: new Date().toISOString(),
    displayName: "",
    description: "",
    modelText: DEFAULT_RBAC_MODEL,
    policyTable: `biz_${appName.replace(/-/g, "_")}_policy`,
    isEnabled: true,
  };
}

export function newBizRole(owner: string, appName: string): BizRole {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    appName,
    name: `role_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: "",
    description: "",
    users: [],
    groups: [],
    roles: [],
    properties: "",
    isEnabled: true,
  };
}

export function newBizPermission(owner: string, appName: string): BizPermission {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    appName,
    name: `perm_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: "",
    description: "",
    users: [],
    roles: [],
    resources: [],
    actions: [],
    effect: "Allow",
    isEnabled: true,
    submitter: "",
    approver: "",
    approveTime: "",
    state: "Approved",
  };
}

// ── Helpers ──

/** Parse policy_definition fields from model text. Returns field names like ["sub", "obj", "act"] */
export function parsePolicyFields(modelText: string): string[] {
  for (const line of modelText.split("\n")) {
    const trimmed = line.trim();
    // Match "p = sub, obj, act" but not "[policy_definition]" or "p2 = ..."
    if (/^p\s*=/.test(trimmed)) {
      return trimmed
        .split("=")[1]
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
    }
  }
  return ["sub", "obj", "act"]; // fallback
}
