import { request, paginationQuery } from "./request";

export interface Adapter {
  owner: string;
  name: string;
  createdTime: string;
  table: string;
  useSameDb: boolean;
  type: string;
  databaseType: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  [key: string]: unknown;
}

export function getAdapters(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Adapter[]>("GET", `/api/get-adapters?${paginationQuery(params)}`);
}

export function getAdapter(owner: string, name: string) {
  return request<Adapter>(
    "GET",
    `/api/get-adapter?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addAdapter(adapter: Adapter) {
  return request("POST", "/api/add-adapter", adapter);
}

export function updateAdapter(owner: string, name: string, adapter: Adapter) {
  return request(
    "POST",
    `/api/update-adapter?id=${owner}/${encodeURIComponent(name)}`,
    adapter
  );
}

export function deleteAdapter(adapter: Adapter) {
  return request("POST", "/api/delete-adapter", adapter);
}

export function getPolicies(owner: string, name: string, adapterId: string = "") {
  return request(
    "GET",
    `/api/get-policies?id=${owner}/${encodeURIComponent(name)}&adapterId=${adapterId}`
  );
}

export function newAdapter(owner: string): Adapter {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `adapter_${rand}`,
    createdTime: new Date().toISOString(),
    table: "table_name",
    useSameDb: true,
    type: "",
    databaseType: "",
    host: "",
    port: 0,
    user: "",
    password: "",
    database: "",
  };
}
