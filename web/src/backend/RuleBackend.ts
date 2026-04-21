import { request, paginationQuery } from "./request";

export interface Expression {
  name: string;
  operator: string;
  value: string;
}

export interface Rule {
  owner: string;
  name: string;
  createdTime: string;
  updatedTime: string;
  type: string;
  expressions: Expression[];
  action: string;
  statusCode: number;
  reason: string;
  isVerbose: boolean;
  [key: string]: unknown;
}

export function getRules(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Rule[]>("GET", `/api/get-rules?${paginationQuery(params)}`);
}

export function getRule(owner: string, name: string) {
  return request<Rule>(
    "GET",
    `/api/get-rule?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addRule(rule: Rule) {
  return request("POST", "/api/add-rule", rule);
}

export function updateRule(owner: string, name: string, rule: Rule) {
  return request(
    "POST",
    `/api/update-rule?id=${owner}/${encodeURIComponent(name)}`,
    rule
  );
}

export function deleteRule(rule: Rule) {
  return request("POST", "/api/delete-rule", rule);
}

export function newRule(owner: string): Rule {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `rule_${rand}`,
    createdTime: new Date().toISOString(),
    updatedTime: "",
    type: "User-Agent",
    expressions: [],
    action: "Block",
    statusCode: 403,
    reason: "Your request is blocked.",
    isVerbose: false,
  };
}
