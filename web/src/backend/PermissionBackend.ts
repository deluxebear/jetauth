import { request, paginationQuery } from "./request";

export interface Permission {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  description: string;
  users: string[];
  groups: string[];
  roles: string[];
  domains: string[];
  model: string;
  adapter: string;
  resourceType: string;
  resources: string[];
  actions: string[];
  effect: string;
  isEnabled: boolean;
  submitter: string;
  approver: string;
  approveTime: string;
  state: string;
  rejectReason?: string;
  /** Server-computed fingerprint of the policy-affecting fields; echoed back on approve/reject. */
  contentHash?: string;
  [key: string]: unknown;
}

export function getPermissions(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Permission[]>("GET", `/api/get-permissions?${paginationQuery(params)}`);
}

export type PermissionState = "Pending" | "Approved" | "Rejected";

export interface PermissionApprovalLog {
  id: number;
  owner: string;
  permissionName: string;
  createdTime: string;
  operator: string;
  fromState: string;
  toState: string;
  reason: string;
}

/** Pending approval queue: permissions of the owner whose state is Pending. */
export function getPendingPermissions(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: string;
}) {
  return getPermissions({ ...params, field: "state", value: "Pending" });
}

/** Permissions submitted by the signed-in user. */
export function getPermissionsBySubmitter() {
  return request<Permission[]>("GET", "/api/get-permissions-by-submitter");
}

/** Approving is bound to the reviewed content: contentHash must be the one the reviewer saw. */
export function approvePermission(owner: string, name: string, contentHash: string) {
  return request(
    "POST",
    `/api/approve-permission?id=${owner}/${encodeURIComponent(name)}&contentHash=${encodeURIComponent(contentHash)}`
  );
}

export function rejectPermission(owner: string, name: string, reason: string, contentHash?: string) {
  return request("POST", `/api/reject-permission?id=${owner}/${encodeURIComponent(name)}`, { reason, contentHash });
}

/** True when the stored content no longer matches the fingerprint the reviewer saw. */
export async function hasPermissionContentChanged(owner: string, name: string, seenHash: string | undefined) {
  try {
    const fresh = await getPermission(owner, name);
    return fresh.status === "ok" && !!fresh.data && fresh.data.contentHash !== seenHash;
  } catch {
    return false;
  }
}

export function getPermissionApprovalLogs(owner: string, name: string) {
  return request<PermissionApprovalLog[]>(
    "GET",
    `/api/get-permission-approval-logs?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function getPermission(owner: string, name: string) {
  return request<Permission>(
    "GET",
    `/api/get-permission?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addPermission(permission: Permission) {
  return request("POST", "/api/add-permission", permission);
}

export function updatePermission(owner: string, name: string, permission: Permission) {
  return request(
    "POST",
    `/api/update-permission?id=${owner}/${encodeURIComponent(name)}`,
    permission
  );
}

export function deletePermission(permission: Permission) {
  return request("POST", "/api/delete-permission", permission);
}

export function getPermissionsByRole(roleId: string) {
  return request<Permission[]>(
    "GET",
    `/api/get-permissions-by-role?id=${encodeURIComponent(roleId)}`
  );
}

export function enforce(params: {
  permissionId?: string;
  modelId?: string;
  resourceId?: string;
  enforcerId?: string;
  owner?: string;
}, casbinRequest: unknown[]) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return request<boolean[]>("POST", `/api/enforce?${qs}`, casbinRequest);
}

export function batchEnforce(params: {
  permissionId?: string;
  modelId?: string;
  owner?: string;
}, casbinRequests: unknown[][]) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return request<boolean[][]>("POST", `/api/batch-enforce?${qs}`, casbinRequests);
}

export function newPermission(owner: string): Permission {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `permission_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Permission - ${rand}`,
    description: "",
    users: [],
    groups: [],
    roles: [],
    domains: [],
    model: "",
    adapter: "",
    resourceType: "Application",
    resources: ["app-built-in"],
    actions: ["Read"],
    effect: "Allow",
    isEnabled: true,
    submitter: "",
    approver: "",
    approveTime: "",
    state: "Approved",
    rejectReason: "",
  };
}
