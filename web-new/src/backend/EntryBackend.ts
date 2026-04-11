import { request, paginationQuery } from "./request";

export interface Entry {
  owner: string;
  name: string;
  createdTime: string;
  updatedTime: string;
  displayName: string;
  provider: string;
  application: string;
  type: string;
  clientIp: string;
  userAgent: string;
  message: string;
  [key: string]: unknown;
}

export function getEntries(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Entry[]>("GET", `/api/get-entries?${paginationQuery(params)}`);
}

export function getEntry(owner: string, name: string) {
  return request<Entry>(
    "GET",
    `/api/get-entry?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addEntry(entry: Entry) {
  return request("POST", "/api/add-entry", entry);
}

export function updateEntry(owner: string, name: string, entry: Entry) {
  return request(
    "POST",
    `/api/update-entry?id=${owner}/${encodeURIComponent(name)}`,
    entry
  );
}

export function deleteEntry(entry: Entry) {
  return request("POST", "/api/delete-entry", entry);
}

export function newEntry(owner: string): Entry {
  const rand = Math.random().toString(16).slice(2, 18);
  return {
    owner,
    name: rand,
    createdTime: new Date().toISOString(),
    updatedTime: "",
    displayName: rand,
    provider: "",
    application: "",
    type: "",
    clientIp: "",
    userAgent: "",
    message: "",
  };
}
