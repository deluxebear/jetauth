import { request, paginationQuery } from "./request";

export interface Session {
  owner: string;
  name: string;
  application: string;
  createdTime: string;
  sessionId: string[];
  [key: string]: unknown;
}

export function getSessions(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Session[]>("GET", `/api/get-sessions?${paginationQuery(params)}`);
}

export function deleteSession(session: Session, sessionId?: string) {
  const url = sessionId
    ? `/api/delete-session?sessionId=${encodeURIComponent(sessionId)}`
    : "/api/delete-session";
  return request("POST", url, session);
}
