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
  // ReBAC-mode fields. Present on every row; `modelType` defaults to
  // "casbin" for legacy apps. `currentAuthorizationModelId` is set on
  // the first successful schema save for a ReBAC app.
  modelType?: "casbin" | "rebac";
  currentAuthorizationModelId?: string;
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

// Aggregated counters for a single role — used by the detail page overview
// to render stat cards without 4 separate list calls just for their lengths.
export interface BizRoleStats {
  roleId: number;
  memberCount: number;
  userMemberCount: number;
  groupMemberCount: number;
  parentRoleCount: number;
  childRoleCount: number;
  permissionCount: number;
  lastUpdatedTime: string;
}

export function getBizRoleStats(id: number) {
  return request<BizRoleStats>("GET", `/api/biz-get-role-stats?id=${id}`);
}

// Aggregated counters for a single permission — used by the detail page
// overview (grantees broken down by subject type, resource/action counts).
export interface BizPermissionStats {
  permissionId: number;
  granteeCount: number;
  userGranteeCount: number;
  groupGranteeCount: number;
  roleGranteeCount: number;
  resourceCount: number;
  actionCount: number;
  lastUpdatedTime: string;
}

export function getBizPermissionStats(id: number) {
  return request<BizPermissionStats>("GET", `/api/biz-get-permission-stats?id=${id}`);
}

// ── BizAppResource catalog ──

export type BizResourceMatchMode = "keyMatch" | "keyMatch2" | "regex";
export type BizResourceSource = "manual" | "openapi" | "template" | "paste";

export interface BizAppResource {
  id?: number;
  owner: string;
  appName: string;
  name: string;
  group: string;
  displayName: string;
  description: string;
  pattern: string;
  methods: string;
  matchMode: BizResourceMatchMode;
  source: BizResourceSource;
  sourceRef: string;
  deprecated: boolean;
  createdTime?: string;
  updatedTime?: string;
}

export function newBizAppResource(owner: string, appName: string): BizAppResource {
  return {
    owner,
    appName,
    name: `res_${Math.random().toString(36).slice(2, 8)}`,
    group: "",
    displayName: "",
    description: "",
    pattern: "",
    methods: "",
    matchMode: "keyMatch2",
    source: "manual",
    sourceRef: "",
    deprecated: false,
  };
}

export function listBizAppResources(owner: string, appName: string) {
  return request<BizAppResource[]>(
    "GET",
    `/api/biz-list-app-resources?owner=${encodeURIComponent(owner)}&appName=${encodeURIComponent(appName)}`,
  );
}

export function addBizAppResource(r: BizAppResource) {
  return request("POST", "/api/biz-add-app-resource", r);
}

export function updateBizAppResource(id: number, r: BizAppResource) {
  return request("POST", `/api/biz-update-app-resource?id=${id}`, r);
}

export function deleteBizAppResource(id: number) {
  return request("POST", `/api/biz-delete-app-resource?id=${id}`);
}

// ── Resource catalog import (parse preview + apply) ──

export type BizResourceImportFormat = "openapi" | "csv" | "yaml" | "json" | "paste";
export type BizResourceImportPathParamMode = "colon" | "star" | "keep";

export interface BizResourceImportOptions {
  pathParamMode: BizResourceImportPathParamMode;
  defaultMatchMode: BizResourceMatchMode;
  defaultGroup: string;
  fullReplace: boolean;
}

export interface BizResourceImportRequest {
  owner: string;
  appName: string;
  format: BizResourceImportFormat;
  content: string;
  options: BizResourceImportOptions;
}

export type BizResourceImportRowKind = "new" | "update" | "deprecated" | "error";

export interface BizResourceImportRow {
  kind: BizResourceImportRowKind;
  lineNo?: number;
  error?: string;
  proposed: BizAppResource;
  existing?: BizAppResource;
}

export interface BizResourceImportPreview {
  owner: string;
  appName: string;
  format: BizResourceImportFormat;
  options: BizResourceImportOptions;
  rows: BizResourceImportRow[];
  newCount: number;
  updateCount: number;
  deprecatedCount: number;
  errorCount: number;
}

export interface BizResourceImportApplyResult {
  added: number;
  updated: number;
  deprecated: number;
  failed: number;
  errors?: string[];
}

export function parseBizResourceImport(req: BizResourceImportRequest) {
  return request<BizResourceImportPreview>("POST", "/api/biz-parse-resource-import", req);
}

export function importBizAppResources(owner: string, appName: string, rows: BizResourceImportRow[]) {
  return request<BizResourceImportApplyResult>("POST", "/api/biz-import-app-resources", {
    owner, appName, rows,
  });
}

// ── Permission match test ──

export interface BizPermissionMatchRequest {
  permissionId: number;
  testMethod: string;
  testUrl: string;
}

export interface BizPermissionMatchResult {
  match: boolean;
  effect: "Allow" | "Deny";
  resourceHit?: string;
  actionHit?: string;
  resourceChecks: string[];
  actionChecks: string[];
  reason: string;
  enabled: boolean;
  state: string;
}

export function testBizPermissionMatch(req: BizPermissionMatchRequest) {
  return request<BizPermissionMatchResult>("POST", "/api/biz-test-permission-match", req);
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

// Per-id outcome of a bulk delete. `ok=false` means the row is still there
// and `error` holds a localized explanation (e.g. "inherited by …").
export interface BizRoleBulkDeleteItem {
  id: number;
  ok: boolean;
  error?: string;
}

export interface BizRoleBulkDeleteResult {
  results: BizRoleBulkDeleteItem[];
  succeeded: number;
  failed: number;
  total: number;
}

export function bulkDeleteBizRoles(ids: number[]) {
  return request<BizRoleBulkDeleteResult>("POST", "/api/biz-bulk-delete-role", { ids });
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

export interface BizPermissionBulkDeleteItem {
  id: number;
  ok: boolean;
  error?: string;
}

export interface BizPermissionBulkDeleteResult {
  results: BizPermissionBulkDeleteItem[];
  succeeded: number;
  failed: number;
  total: number;
}

export function bulkDeleteBizPermissions(ids: number[]) {
  return request<BizPermissionBulkDeleteResult>("POST", "/api/biz-bulk-delete-permission", { ids });
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

// ── ReBAC (Phase 2 — OpenFGA-compatible) ──
//
// Frontend types mirror the backend contracts documented in
// docs/rebac-spec.md §7.1 ("routes") and §6 ("engine"). Every wrapper
// here targets one of the 10 endpoints spec §7.1 enumerates.

export interface BizTupleKey {
  object: string;
  relation: string;
  user: string;
}

/**
 * BizAuthorizationModel — a single immutable schema version for a
 * ReBAC-mode app (spec §4.2). `schemaJson` holds the parsed
 * representation; `schemaDsl` is the raw OpenFGA DSL.
 */
export interface BizAuthorizationModel {
  id: string;
  owner: string;
  appName: string;
  schemaDsl: string;
  schemaJson: string;
  schemaHash: string;
  createdTime: string;
  createdBy: string;
}

/**
 * SaveAuthorizationModelResult — spec §4.2 write outcomes.
 *   - `unchanged`: DSL identical to current model; same id returned.
 *   - `advanced`:  new model row inserted, app pointer updated.
 *   - `conflict`:  destructive schema drops a type/relation still
 *                  referenced by tuples; no write happened.
 */
export type SaveAuthorizationModelOutcome = "unchanged" | "advanced" | "conflict";

export interface BizSchemaConflict {
  tupleId: number;
  object: string;
  relation: string;
  user: string;
  reason: string;
}

export interface SaveAuthorizationModelResult {
  outcome: SaveAuthorizationModelOutcome;
  authorizationModelId?: string;
  // Populated on unchanged/advanced — lets the visual editor ingest
  // the parsed model without a second request after a DSL edit.
  schemaJson?: string;
  conflicts?: BizSchemaConflict[];
}

/** BizTuple — persisted relationship. CreatedTime comes from the row. */
export interface BizTuple {
  storeId: string;
  owner: string;
  appName: string;
  object: string;
  relation: string;
  user: string;
  conditionName?: string;
  conditionContext?: string;
  authorizationModelId: string;
  createdTime: string;
}

export interface BizCheckRequest {
  appId: string;
  authorizationModelId?: string;
  tupleKey: BizTupleKey;
  contextualTuples?: BizTupleKey[];
  context?: Record<string, unknown>;
}

export interface BizCheckResponse {
  allowed: boolean;
  resolution?: string;
}

export interface BizBatchCheckItem {
  tupleKey: BizTupleKey;
  contextualTuples?: BizTupleKey[];
  context?: Record<string, unknown>;
}

export interface BizBatchCheckRequest {
  appId: string;
  authorizationModelId?: string;
  checks: BizBatchCheckItem[];
}

export interface BizBatchCheckResultItem {
  allowed: boolean;
  resolution?: string;
  error?: string;
}

export interface BizBatchCheckResponse {
  results: BizBatchCheckResultItem[];
}

export interface BizWriteTupleIn {
  object: string;
  relation: string;
  user: string;
  conditionName?: string;
  conditionContext?: string;
}

export interface BizWriteTuplesRequest {
  appId: string;
  authorizationModelId?: string;
  writes?: BizWriteTupleIn[];
  deletes?: BizTupleKey[];
}

export interface BizWriteTuplesResponse {
  written: number;
  deleted: number;
}

export interface BizListObjectsRequest {
  appId: string;
  authorizationModelId?: string;
  objectType: string;
  relation: string;
  user: string;
  contextualTuples?: BizTupleKey[];
  context?: Record<string, unknown>;
  pageSize?: number;
  continuationToken?: string;
}

export interface BizListObjectsResult {
  objects: string[];
  continuationToken?: string;
}

export interface BizListUsersRequest {
  appId: string;
  authorizationModelId?: string;
  object: string;
  relation: string;
  userFilter?: string;
  contextualTuples?: BizTupleKey[];
  context?: Record<string, unknown>;
  pageSize?: number;
  continuationToken?: string;
}

export interface BizListUsersResult {
  users: string[];
  continuationToken?: string;
}

export interface BizExpandObjectRelation {
  object?: string;
  relation: string;
}

export interface BizExpandTupleToUserset {
  tupleset: BizExpandObjectRelation;
  computed: BizExpandObjectRelation;
}

/**
 * BizExpandNode mirrors the recursive ExpandNode from the Go engine.
 * `kind` tags the rewrite; exactly one of the other fields is
 * populated per node (`Users` for `this`, `Computed` for
 * `computed_userset`, etc. — see docs/rebac-spec.md §6.2).
 */
export interface BizExpandNode {
  kind: string;
  users?: string[];
  computed?: BizExpandObjectRelation;
  tupleToUserset?: BizExpandTupleToUserset;
  children?: BizExpandNode[];
  base?: BizExpandNode;
  subtract?: BizExpandNode;
  truncated?: boolean;
}

export interface BizExpandResult {
  root: BizExpandNode;
}

// 1. biz-write-authorization-model
// When dryRun is true, backend runs parse + conflict-scan and returns the
// same outcome envelope without inserting a row — used by the DSL editor
// for inline validation.
export function saveBizAuthorizationModel(
  appId: string,
  schemaDsl: string,
  dryRun = false,
) {
  const q = new URLSearchParams({ appId });
  if (dryRun) q.set("dryRun", "true");
  return request<SaveAuthorizationModelResult>(
    "POST",
    `/api/biz-write-authorization-model?${q.toString()}`,
    { schemaDsl },
  );
}

// 2. biz-read-authorization-model
export function getBizAuthorizationModel(appId: string, id?: string) {
  const q = id
    ? `appId=${encodeURIComponent(appId)}&id=${encodeURIComponent(id)}`
    : `appId=${encodeURIComponent(appId)}`;
  return request<BizAuthorizationModel>("GET", `/api/biz-read-authorization-model?${q}`);
}

// 3. biz-list-authorization-models
export function listBizAuthorizationModels(appId: string) {
  return request<BizAuthorizationModel[]>(
    "GET",
    `/api/biz-list-authorization-models?appId=${encodeURIComponent(appId)}`,
  );
}

// 4. biz-check
export function bizCheck(req: BizCheckRequest) {
  return request<BizCheckResponse>("POST", "/api/biz-check", req);
}

// 5. biz-batch-check
export function bizBatchCheck(req: BizBatchCheckRequest) {
  return request<BizBatchCheckResponse>("POST", "/api/biz-batch-check", req);
}

// 6. biz-write-tuples
export function writeBizTuples(req: BizWriteTuplesRequest) {
  return request<BizWriteTuplesResponse>("POST", "/api/biz-write-tuples", req);
}

// 7. biz-read-tuples
export function readBizTuples(
  appId: string,
  filter: { object?: string; relation?: string; user?: string } = {},
) {
  const params = new URLSearchParams({ appId });
  if (filter.object) params.set("object", filter.object);
  if (filter.relation) params.set("relation", filter.relation);
  if (filter.user) params.set("user", filter.user);
  return request<BizTuple[]>("GET", `/api/biz-read-tuples?${params.toString()}`);
}

// 8. biz-list-objects
export function bizListObjects(req: BizListObjectsRequest) {
  return request<BizListObjectsResult>("POST", "/api/biz-list-objects", req);
}

// 9. biz-list-users
export function bizListUsers(req: BizListUsersRequest) {
  return request<BizListUsersResult>("POST", "/api/biz-list-users", req);
}

// 10. biz-expand
export function bizExpand(appId: string, object: string, relation: string, id?: string) {
  const params = new URLSearchParams({ appId, object, relation });
  if (id) params.set("id", id);
  return request<BizExpandResult>("GET", `/api/biz-expand?${params.toString()}`);
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
