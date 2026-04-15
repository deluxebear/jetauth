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
  };
}
