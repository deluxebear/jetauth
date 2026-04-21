import { request, paginationQuery } from "./request";

export interface Header {
  name: string;
  value: string;
}

export interface Webhook {
  owner: string;
  name: string;
  createdTime: string;
  organization: string;
  url: string;
  method: string;
  contentType: string;
  headers: Header[];
  events: string[];
  tokenFields: string[];
  objectFields: string[];
  isUserExtended: boolean;
  singleOrgOnly: boolean;
  isEnabled: boolean;
  maxRetries: number;
  retryInterval: number;
  useExponentialBackoff: boolean;
  [key: string]: unknown;
}

export function getWebhooks(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Webhook[]>("GET", `/api/get-webhooks?${paginationQuery(params)}`);
}

export function getWebhook(owner: string, name: string) {
  return request<Webhook>(
    "GET",
    `/api/get-webhook?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addWebhook(webhook: Webhook) {
  return request("POST", "/api/add-webhook", webhook);
}

export function updateWebhook(owner: string, name: string, webhook: Webhook) {
  return request(
    "POST",
    `/api/update-webhook?id=${owner}/${encodeURIComponent(name)}`,
    webhook
  );
}

export function deleteWebhook(webhook: Webhook) {
  return request("POST", "/api/delete-webhook", webhook);
}

export function newWebhook(owner: string): Webhook {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner: "admin",
    name: `webhook_${rand}`,
    createdTime: new Date().toISOString(),
    organization: owner,
    url: "https://example.com/callback",
    method: "POST",
    contentType: "application/json",
    headers: [],
    events: ["signup", "login", "logout", "update-user"],
    tokenFields: [],
    objectFields: [],
    isUserExtended: false,
    singleOrgOnly: false,
    isEnabled: true,
    maxRetries: 3,
    retryInterval: 60,
    useExponentialBackoff: false,
  };
}
