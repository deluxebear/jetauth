import { request, paginationQuery } from "./request";

export interface Enforcer {
  owner: string;
  name: string;
  createdTime: string;
  updatedTime: string;
  displayName: string;
  description: string;
  model: string;
  adapter: string;
  [key: string]: unknown;
}

export function getEnforcers(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Enforcer[]>("GET", `/api/get-enforcers?${paginationQuery(params)}`);
}

export function getEnforcer(owner: string, name: string) {
  return request<Enforcer>(
    "GET",
    `/api/get-enforcer?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addEnforcer(enforcer: Enforcer) {
  return request("POST", "/api/add-enforcer", enforcer);
}

export function updateEnforcer(owner: string, name: string, enforcer: Enforcer) {
  return request(
    "POST",
    `/api/update-enforcer?id=${owner}/${encodeURIComponent(name)}`,
    enforcer
  );
}

export function deleteEnforcer(enforcer: Enforcer) {
  return request("POST", "/api/delete-enforcer", enforcer);
}

export function newEnforcer(owner: string): Enforcer {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `enforcer_${rand}`,
    createdTime: new Date().toISOString(),
    updatedTime: "",
    displayName: `New Enforcer - ${rand}`,
    description: "",
    model: "",
    adapter: "",
  };
}
