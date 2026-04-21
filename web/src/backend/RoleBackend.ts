import { request, paginationQuery } from "./request";

export interface Role {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  description: string;
  users: string[];
  groups: string[];
  roles: string[];
  domains: string[];
  isEnabled: boolean;
  [key: string]: unknown;
}

export function getRoles(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Role[]>("GET", `/api/get-roles?${paginationQuery(params)}`);
}

export function getRole(owner: string, name: string) {
  return request<Role>(
    "GET",
    `/api/get-role?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addRole(role: Role) {
  return request("POST", "/api/add-role", role);
}

export function updateRole(owner: string, name: string, role: Role) {
  return request(
    "POST",
    `/api/update-role?id=${owner}/${encodeURIComponent(name)}`,
    role
  );
}

export function deleteRole(role: Role) {
  return request("POST", "/api/delete-role", role);
}

export function newRole(owner: string): Role {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `role_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Role - ${rand}`,
    description: "",
    users: [],
    groups: [],
    roles: [],
    domains: [],
    isEnabled: true,
  };
}
