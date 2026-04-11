import { request, paginationQuery } from "./request";

export interface Transaction {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  application: string;
  domain: string;
  category: string;
  type: string;
  subtype: string;
  provider: string;
  user: string;
  tag: string;
  amount: number;
  currency: string;
  payment: string;
  state: string;
  [key: string]: unknown;
}

export function getTransactions(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Transaction[]>("GET", `/api/get-transactions?${paginationQuery(params)}`);
}

export function getTransaction(owner: string, name: string) {
  return request<Transaction>(
    "GET",
    `/api/get-transaction?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addTransaction(transaction: Transaction) {
  return request("POST", "/api/add-transaction", transaction);
}

export function updateTransaction(owner: string, name: string, transaction: Transaction) {
  return request(
    "POST",
    `/api/update-transaction?id=${owner}/${encodeURIComponent(name)}`,
    transaction
  );
}

export function deleteTransaction(transaction: Transaction) {
  return request("POST", "/api/delete-transaction", transaction);
}

export function newTransaction(owner: string): Transaction {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `transaction_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: "",
    application: "",
    domain: "",
    category: "",
    type: "",
    subtype: "",
    provider: "",
    user: "",
    tag: "",
    amount: 0,
    currency: "USD",
    payment: "",
    state: "Paid",
  };
}
