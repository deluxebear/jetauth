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
  /**
   * Backend-computed: true iff the current modelText has both a p_eft
   * field and a policy_effect referencing p.eft == deny. When false,
   * Deny permissions are silently ignored at enforce time — frontend
   * should hide or disable the Deny option.
   */
  supportsDeny?: boolean;
  [key: string]: unknown;
}

// Role scope: "app" (visible only to the owning app) vs "org" (org-wide, reusable across apps)
export type BizRoleScopeKind = "app" | "org";

export interface BizRole {
  id?: number;
  organization: string;
  appName: string;
  name: string;
  scopeKind: BizRoleScopeKind;
  displayName: string;
  description: string;
  properties: string;
  isEnabled: boolean;
  createdTime?: string;
  updatedTime?: string;
  // Derived stats populated by backend list response; present on list rows only.
  memberCount?: number;
  permissionCount?: number;
  parentNames?: string[];
  [key: string]: unknown;
}

// Role member subject — "userset" is reserved for Phase 2 (ReBAC)
export type BizRoleMemberSubjectType = "user" | "group" | "userset";

export interface BizRoleMember {
  roleId: number;
  subjectType: BizRoleMemberSubjectType;
  subjectId: string;
  addedTime?: string;
  addedBy?: string;
}

export interface BizPermission {
  id?: number;
  owner: string;
  appName: string;
  name: string;
  createdTime?: string;
  updatedTime?: string;
  displayName: string;
  description: string;
  resources: string[];
  actions: string[];
  effect: "Allow" | "Deny";
  isEnabled: boolean;
  submitter?: string;
  approver?: string;
  approveTime?: string;
  state?: "Approved" | "Pending" | "Rejected";
  granteeCount?: number;
  [key: string]: unknown;
}

// Permission grantee subject — "role" allows granting a permission to a role (RBAC style);
// "userset" is reserved for Phase 2.
export type BizPermissionGranteeSubjectType = "user" | "group" | "role" | "userset";

export interface BizPermissionGrantee {
  permissionId: number;
  subjectType: BizPermissionGranteeSubjectType;
  subjectId: string;
  addedTime?: string;
  addedBy?: string;
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

// ── BizRole CRUD (id-based) ──

export function getBizRoles(organization: string, appName: string) {
  return request<BizRole[]>(
    "GET",
    `/api/biz-get-roles?organization=${encodeURIComponent(organization)}&appName=${encodeURIComponent(appName)}`,
  );
}

export function getBizRole(id: number) {
  return request<BizRole>("GET", `/api/biz-get-role?id=${id}`);
}

export function addBizRole(role: BizRole) {
  return request("POST", "/api/biz-add-role", role);
}

export function updateBizRole(id: number, role: BizRole) {
  return request("POST", `/api/biz-update-role?id=${id}`, role);
}

export function deleteBizRole(id: number) {
  return request("POST", `/api/biz-delete-role?id=${id}`);
}

// ── BizRole membership ──

export interface BizRoleMemberListResponse {
  members: BizRoleMember[];
  total: number;
}

export function listBizRoleMembers(roleId: number, offset = 0, limit = 50) {
  return request<BizRoleMemberListResponse>(
    "GET",
    `/api/biz-list-role-members?roleId=${roleId}&offset=${offset}&limit=${limit}`,
  );
}

export function addBizRoleMember(m: BizRoleMember) {
  return request("POST", "/api/biz-add-role-member", m);
}

export function removeBizRoleMember(m: BizRoleMember) {
  return request("POST", "/api/biz-remove-role-member", m);
}

export function listUserRoles(organization: string, userId: string) {
  return request<BizRole[]>(
    "GET",
    `/api/biz-list-user-roles?organization=${encodeURIComponent(organization)}&userId=${encodeURIComponent(userId)}`,
  );
}

// ── BizRole inheritance ──

export function listRoleParents(roleId: number) {
  return request<BizRole[]>("GET", `/api/biz-list-role-parents?roleId=${roleId}`);
}

export function listRoleChildren(roleId: number) {
  return request<BizRole[]>("GET", `/api/biz-list-role-children?roleId=${roleId}`);
}

export function addBizRoleInheritance(parentRoleId: number, childRoleId: number) {
  return request("POST", "/api/biz-add-role-inheritance", { parentRoleId, childRoleId });
}

export function removeBizRoleInheritance(parentRoleId: number, childRoleId: number) {
  return request("POST", "/api/biz-remove-role-inheritance", { parentRoleId, childRoleId });
}

// ── BizPermission CRUD (id-based) ──

export function getBizPermissions(organization: string, appName: string) {
  return request<BizPermission[]>(
    "GET",
    `/api/biz-get-permissions?organization=${encodeURIComponent(organization)}&appName=${encodeURIComponent(appName)}`,
  );
}

export function getBizPermission(id: number) {
  return request<BizPermission>("GET", `/api/biz-get-permission?id=${id}`);
}

export function addBizPermission(perm: BizPermission) {
  return request("POST", "/api/biz-add-permission", perm);
}

export function updateBizPermission(id: number, perm: BizPermission) {
  return request("POST", `/api/biz-update-permission?id=${id}`, perm);
}

export function deleteBizPermission(id: number) {
  return request("POST", `/api/biz-delete-permission?id=${id}`);
}

// ── BizPermission grantees ──

export interface BizPermissionGranteeListResponse {
  grantees: BizPermissionGrantee[];
  total: number;
}

export function listBizPermissionGrantees(permissionId: number, offset = 0, limit = 50) {
  return request<BizPermissionGranteeListResponse>(
    "GET",
    `/api/biz-list-permission-grantees?permissionId=${permissionId}&offset=${offset}&limit=${limit}`,
  );
}

export function addBizPermissionGrantee(g: BizPermissionGrantee) {
  return request("POST", "/api/biz-add-permission-grantee", g);
}

export function removeBizPermissionGrantee(g: BizPermissionGrantee) {
  return request("POST", "/api/biz-remove-permission-grantee", g);
}

// Reverse-lookup: the business win of this refactor.
export function listPermissionsByRole(organization: string, roleName: string) {
  return request<BizPermission[]>(
    "GET",
    `/api/biz-list-permissions-by-role?organization=${encodeURIComponent(organization)}&roleName=${encodeURIComponent(roleName)}`,
  );
}

export function listPermissionsByUser(organization: string, userId: string) {
  return request<BizPermission[]>(
    "GET",
    `/api/biz-list-permissions-by-user?organization=${encodeURIComponent(organization)}&userId=${encodeURIComponent(userId)}`,
  );
}

// ── Enforce ──

export function bizEnforce(appId: string, casbinRequest: unknown[]) {
  return request<boolean>("POST", `/api/biz-enforce?appId=${encodeURIComponent(appId)}`, casbinRequest);
}

export interface EnforceTraceResult {
  allowed: boolean;
  /** The p-rule that caused the decision (or empty when nothing matched). */
  matchedPolicy: string[];
  /** Transitive role closure of the subject — useful for debugging "why didn't this match?". */
  subjectRoles: string[];
  /**
   * Human-readable summary. Already localized by the backend based on the
   * request's Accept-Language header (via i18n.Translate).
   */
  reason: string;
}

export function bizEnforceEx(appId: string, casbinRequest: unknown[]) {
  return request<EnforceTraceResult>("POST", `/api/biz-enforce-ex?appId=${encodeURIComponent(appId)}`, casbinRequest);
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

export function newBizRole(organization: string, appName: string): BizRole {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    organization,
    appName,
    name: `role_${rand}`,
    scopeKind: "app",
    createdTime: new Date().toISOString(),
    displayName: "",
    description: "",
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
