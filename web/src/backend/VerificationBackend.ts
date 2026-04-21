import { request, paginationQuery } from "./request";

export interface Verification {
  owner: string;
  name: string;
  createdTime: string;
  remoteAddr: string;
  type: string;
  user: string;
  provider: string;
  receiver: string;
  code: string;
  time: number;
  isUsed: boolean;
  [key: string]: unknown;
}

export function getVerifications(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Verification[]>("GET", `/api/get-verifications?${paginationQuery(params)}`);
}
