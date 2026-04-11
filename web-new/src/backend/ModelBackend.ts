import { request, paginationQuery } from "./request";

export interface Model {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  description: string;
  modelText: string;
  isEnabled: boolean;
  [key: string]: unknown;
}

const defaultRbacModel = `[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act`;

export function getModels(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Model[]>("GET", `/api/get-models?${paginationQuery(params)}`);
}

export function getModel(owner: string, name: string) {
  return request<Model>(
    "GET",
    `/api/get-model?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addModel(model: Model) {
  return request("POST", "/api/add-model", model);
}

export function updateModel(owner: string, name: string, model: Model) {
  return request(
    "POST",
    `/api/update-model?id=${owner}/${encodeURIComponent(name)}`,
    model
  );
}

export function deleteModel(model: Model) {
  return request("POST", "/api/delete-model", model);
}

export function newModel(owner: string): Model {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `model_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Model - ${rand}`,
    description: "",
    modelText: defaultRbacModel,
    isEnabled: true,
  };
}
