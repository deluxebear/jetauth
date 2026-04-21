import { request, paginationQuery } from "./request";

export interface Plan {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  description: string;
  price: number;
  currency: string;
  period: string;
  product: string;
  paymentProviders: string[];
  isEnabled: boolean;
  isExclusive: boolean;
  role: string;
  options: string[];
  [key: string]: unknown;
}

export function getPlans(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Plan[]>("GET", `/api/get-plans?${paginationQuery(params)}`);
}

export function getPlan(owner: string, name: string) {
  return request<Plan>(
    "GET",
    `/api/get-plan?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addPlan(plan: Plan) {
  return request("POST", "/api/add-plan", plan);
}

export function updatePlan(owner: string, name: string, plan: Plan) {
  return request(
    "POST",
    `/api/update-plan?id=${owner}/${encodeURIComponent(name)}`,
    plan
  );
}

export function deletePlan(plan: Plan) {
  return request("POST", "/api/delete-plan", plan);
}

export function newPlan(owner: string): Plan {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `plan_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Plan - ${rand}`,
    description: "",
    price: 10,
    currency: "USD",
    period: "Monthly",
    product: "",
    paymentProviders: [],
    isEnabled: true,
    isExclusive: false,
    role: "",
    options: [],
  };
}
