import { request, paginationQuery, type ApiResponse } from "./request";

export interface Group {
  owner: string;
  name: string;
  createdTime: string;
  updatedTime: string;
  displayName: string;
  manager: string;
  contactEmail: string;
  type: string;
  parentId: string;
  parentName: string;
  isTopGroup: boolean;
  users: string[];
  title: string;
  key: string;
  haveChildren: boolean;
  children: Group[];
  isEnabled: boolean;
  [key: string]: unknown;
}

export function getGroups(params: {
  owner: string;
  withTree?: boolean;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  const qs = paginationQuery(params);
  return request<Group[]>("GET", `/api/get-groups?${qs}`);
}

export function getGroup(owner: string, name: string) {
  return request<Group>(
    "GET",
    `/api/get-group?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addGroup(group: Group) {
  return request("POST", "/api/add-group", group);
}

export function updateGroup(owner: string, name: string, group: Group) {
  return request(
    "POST",
    `/api/update-group?id=${owner}/${encodeURIComponent(name)}`,
    group
  );
}

export function deleteGroup(group: Group) {
  return request("POST", "/api/delete-group", group);
}

export function newGroup(orgName: string): Group {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner: orgName,
    name: `group_${rand}`,
    createdTime: new Date().toISOString(),
    updatedTime: new Date().toISOString(),
    displayName: `New Group - ${rand}`,
    manager: "",
    contactEmail: "",
    type: "Virtual",
    parentId: orgName,
    parentName: "",
    isTopGroup: true,
    users: [],
    title: "",
    key: "",
    haveChildren: false,
    children: [],
    isEnabled: true,
  };
}
