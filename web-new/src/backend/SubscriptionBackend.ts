import { request, paginationQuery } from "./request";

export interface Subscription {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  description: string;
  user: string;
  pricing: string;
  plan: string;
  payment: string;
  startTime: string;
  endTime: string;
  period: string;
  state: string;
  [key: string]: unknown;
}

export function getSubscriptions(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Subscription[]>("GET", `/api/get-subscriptions?${paginationQuery(params)}`);
}

export function getSubscription(owner: string, name: string) {
  return request<Subscription>(
    "GET",
    `/api/get-subscription?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addSubscription(subscription: Subscription) {
  return request("POST", "/api/add-subscription", subscription);
}

export function updateSubscription(owner: string, name: string, subscription: Subscription) {
  return request(
    "POST",
    `/api/update-subscription?id=${owner}/${encodeURIComponent(name)}`,
    subscription
  );
}

export function deleteSubscription(subscription: Subscription) {
  return request("POST", "/api/delete-subscription", subscription);
}

export function newSubscription(owner: string): Subscription {
  const rand = Math.random().toString(36).substring(2, 8);
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 30);
  return {
    owner,
    name: `sub_${rand}`,
    createdTime: now.toISOString(),
    displayName: `New Subscription - ${rand}`,
    description: "",
    user: "",
    pricing: "",
    plan: "",
    payment: "",
    startTime: now.toISOString(),
    endTime: endDate.toISOString(),
    period: "Monthly",
    state: "Active",
  };
}
