import { request, paginationQuery } from "./request";

export interface Key {
  owner: string;
  name: string;
  createdTime: string;
  updatedTime: string;
  displayName: string;
  type: string;
  organization: string;
  application: string;
  user: string;
  accessKey: string;
  accessSecret: string;
  expireTime: string;
  state: string;
  [key: string]: unknown;
}

export function getKeys(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Key[]>("GET", `/api/get-keys?${paginationQuery(params)}`);
}

export function getKey(owner: string, name: string) {
  return request<Key>(
    "GET",
    `/api/get-key?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addKey(key: Key) {
  return request("POST", "/api/add-key", key);
}

export function updateKey(owner: string, name: string, key: Key) {
  return request(
    "POST",
    `/api/update-key?id=${owner}/${encodeURIComponent(name)}`,
    key
  );
}

export function deleteKey(key: Key) {
  return request("POST", "/api/delete-key", key);
}

export function newKey(owner: string): Key {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `key_${rand}`,
    createdTime: new Date().toISOString(),
    updatedTime: new Date().toISOString(),
    displayName: `New Key - ${rand}`,
    type: "Organization",
    organization: owner,
    application: "",
    user: "",
    accessKey: "",
    accessSecret: "",
    expireTime: "",
    state: "Active",
  };
}
