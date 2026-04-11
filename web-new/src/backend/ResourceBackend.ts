import { request, paginationQuery } from "./request";

export interface Resource {
  owner: string;
  name: string;
  createdTime: string;
  user: string;
  provider: string;
  application: string;
  tag: string;
  parent: string;
  fileName: string;
  fileType: string;
  fileFormat: string;
  fileSize: number;
  url: string;
  description: string;
  [key: string]: unknown;
}

export function getResources(params: {
  owner: string;
  user?: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Resource[]>("GET", `/api/get-resources?${paginationQuery(params)}`);
}

export function getResource(owner: string, name: string) {
  return request<Resource>(
    "GET",
    `/api/get-resource?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function deleteResource(resource: Resource, provider = "") {
  return request("POST", `/api/delete-resource?provider=${provider}`, resource);
}

export function uploadResource(
  owner: string,
  user: string,
  tag: string,
  parent: string,
  fullFilePath: string,
  file: File,
  provider = ""
): Promise<{ status: string; msg?: string; data?: string; data2?: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams({
    owner,
    user,
    application: "app-built-in",
    tag,
    parent,
    fullFilePath,
    provider,
  });

  return fetch(`/api/upload-resource?${params.toString()}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  }).then((res) => res.json());
}
