import { request, paginationQuery } from "./request";

export interface Order {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  products: string[];
  productInfos: { owner: string; name: string; displayName: string; price: number; quantity: number; currency?: string }[];
  user: string;
  payment: string;
  price: number;
  currency: string;
  state: string;
  message: string;
  [key: string]: unknown;
}

export function getOrders(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Order[]>("GET", `/api/get-orders?${paginationQuery(params)}`);
}

export function getOrder(owner: string, name: string) {
  return request<Order>(
    "GET",
    `/api/get-order?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addOrder(order: Order) {
  return request("POST", "/api/add-order", order);
}

export function updateOrder(owner: string, name: string, order: Order) {
  return request(
    "POST",
    `/api/update-order?id=${owner}/${encodeURIComponent(name)}`,
    order
  );
}

export function deleteOrder(order: Order) {
  return request("POST", "/api/delete-order", order);
}

export function cancelOrder(owner: string, name: string) {
  return request(
    "POST",
    `/api/cancel-order?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function newOrder(owner: string): Order {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `order_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Order - ${rand}`,
    products: [],
    productInfos: [],
    user: "",
    payment: "",
    price: 0,
    currency: "USD",
    state: "Created",
    message: "",
  };
}
