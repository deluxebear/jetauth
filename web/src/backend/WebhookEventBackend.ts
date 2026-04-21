import { request } from "./request";

export interface WebhookEvent {
  owner: string;
  name: string;
  createdTime: string;
  updatedTime: string;
  webhookName: string;
  organization: string;
  eventType: string;
  status: string;
  payload: string;
  extendedUser: string;
  attemptCount: number;
  maxRetries: number;
  nextRetryTime: string;
  lastError: string;
  [key: string]: unknown;
}

export function getWebhookEvents(params: {
  owner?: string;
  organization?: string;
  p?: number;
  pageSize?: number;
  webhookName?: string;
  status?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  const qs = new URLSearchParams({
    owner: params.owner ?? "",
    organization: params.organization ?? "",
    p: String(params.p ?? ""),
    pageSize: String(params.pageSize ?? ""),
    webhookName: params.webhookName ?? "",
    status: params.status ?? "",
    sortField: params.sortField ?? "",
    sortOrder: params.sortOrder ?? "",
  });
  return request<WebhookEvent[]>("GET", `/api/get-webhook-events?${qs.toString()}`);
}

export function replayWebhookEvent(eventId: string) {
  return request("POST", `/api/replay-webhook-event?id=${encodeURIComponent(eventId)}`);
}
