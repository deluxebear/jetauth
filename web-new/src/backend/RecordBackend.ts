import { request } from "./request";

export interface Record {
  id: number;
  owner: string;
  name: string;
  createdTime: string;
  organization: string;
  clientIp: string;
  user: string;
  method: string;
  requestUri: string;
  action: string;
  language: string;
  object: string;
  response: string;
  statusCode: number;
  isTriggered: boolean;
  [key: string]: unknown;
}

export function getRecords(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  // The original API uses `organizationName` instead of `owner`
  const { owner, ...rest } = params;
  const queryParams = { organizationName: owner, ...rest };
  const qs = Object.entries(queryParams)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return request<Record[]>("GET", `/api/get-records?${qs}`);
}
