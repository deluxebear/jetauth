import { request, paginationQuery } from "./request";

export interface Payment {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  provider: string;
  type: string;
  products: string[];
  productsDisplayName: string;
  detail: string;
  currency: string;
  price: number;
  user: string;
  personName: string;
  personIdCard: string;
  personEmail: string;
  personPhone: string;
  invoiceType: string;
  invoiceTitle: string;
  invoiceTaxId: string;
  invoiceRemark: string;
  invoiceUrl: string;
  order: string;
  outOrderId: string;
  payUrl: string;
  successUrl: string;
  state: string;
  message: string;
  [key: string]: unknown;
}

export function getPayments(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Payment[]>("GET", `/api/get-payments?${paginationQuery(params)}`);
}

export function getPayment(owner: string, name: string) {
  return request<Payment>(
    "GET",
    `/api/get-payment?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addPayment(payment: Payment) {
  return request("POST", "/api/add-payment", payment);
}

export function updatePayment(owner: string, name: string, payment: Payment) {
  return request(
    "POST",
    `/api/update-payment?id=${owner}/${encodeURIComponent(name)}`,
    payment
  );
}

export function deletePayment(payment: Payment) {
  return request("POST", "/api/delete-payment", payment);
}

export function notifyPayment(owner: string, name: string) {
  return request<Payment>("POST", `/api/notify-payment/${owner}/${name}`);
}

export function invoicePayment(owner: string, name: string) {
  return request(
    "POST",
    `/api/invoice-payment?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function newPayment(owner: string): Payment {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `payment_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Payment - ${rand}`,
    provider: "",
    type: "",
    products: [],
    productsDisplayName: "",
    detail: "",
    currency: "USD",
    price: 0,
    user: "",
    personName: "",
    personIdCard: "",
    personEmail: "",
    personPhone: "",
    invoiceType: "",
    invoiceTitle: "",
    invoiceTaxId: "",
    invoiceRemark: "",
    invoiceUrl: "",
    order: "",
    outOrderId: "",
    payUrl: "",
    successUrl: "",
    state: "Created",
    message: "",
  };
}
