import { request, paginationQuery } from "./request";

export interface FormItem {
  name: string;
  label: string;
  visible: boolean;
  required: boolean;
  prompted: boolean;
  type: string;
  rule: string;
  regex: string;
  [key: string]: unknown;
}

export interface Form {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  type: string;
  tag: string;
  formItems: FormItem[];
  [key: string]: unknown;
}

export function getGlobalForms() {
  return request<Form[]>("GET", "/api/get-global-forms");
}

export function getForms(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Form[]>("GET", `/api/get-forms?${paginationQuery(params)}`);
}

export function getForm(owner: string, name: string) {
  return request<Form>(
    "GET",
    `/api/get-form?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addForm(form: Form) {
  return request("POST", "/api/add-form", form);
}

export function updateForm(owner: string, name: string, form: Form) {
  return request(
    "POST",
    `/api/update-form?id=${owner}/${encodeURIComponent(name)}`,
    form
  );
}

export function deleteForm(form: Form) {
  return request("POST", "/api/delete-form", form);
}

export function newForm(owner: string): Form {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `form_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Form - ${rand}`,
    type: "",
    tag: "",
    formItems: [],
  };
}
