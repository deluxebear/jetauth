import { request, paginationQuery } from "./request";

export interface Pricing {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  description: string;
  plans: string[];
  isEnabled: boolean;
  trialDuration: number;
  application: string;
  [key: string]: unknown;
}

export function getPricings(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Pricing[]>("GET", `/api/get-pricings?${paginationQuery(params)}`);
}

export function getPricing(owner: string, name: string) {
  return request<Pricing>(
    "GET",
    `/api/get-pricing?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addPricing(pricing: Pricing) {
  return request("POST", "/api/add-pricing", pricing);
}

export function updatePricing(owner: string, name: string, pricing: Pricing) {
  return request(
    "POST",
    `/api/update-pricing?id=${owner}/${encodeURIComponent(name)}`,
    pricing
  );
}

export function deletePricing(pricing: Pricing) {
  return request("POST", "/api/delete-pricing", pricing);
}

export function newPricing(owner: string): Pricing {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `pricing_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Pricing - ${rand}`,
    description: "",
    plans: [],
    isEnabled: true,
    trialDuration: 7,
    application: "",
  };
}
