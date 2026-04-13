import { request, paginationQuery } from "./request";

export interface Product {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  image: string;
  detail: string;
  description: string;
  tag: string;
  currency: string;
  price: number;
  quantity: number;
  sold: number;
  isRecharge: boolean;
  rechargeOptions: number[];
  disableCustomRecharge: boolean;
  providers: string[];
  successUrl: string;
  state: string;
  [key: string]: unknown;
}

export function getProducts(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Product[]>("GET", `/api/get-products?${paginationQuery(params)}`);
}

export function getProduct(owner: string, name: string) {
  return request<Product>(
    "GET",
    `/api/get-product?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addProduct(product: Product) {
  return request("POST", "/api/add-product", product);
}

export function updateProduct(owner: string, name: string, product: Product) {
  return request(
    "POST",
    `/api/update-product?id=${owner}/${encodeURIComponent(name)}`,
    product
  );
}

export function deleteProduct(product: Product) {
  return request("POST", "/api/delete-product", product);
}

export function newProduct(owner: string): Product {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `product_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Product - ${rand}`,
    image: "/img/logo.png",
    detail: "",
    description: "",
    tag: "",
    currency: "USD",
    price: 300,
    quantity: 99,
    sold: 10,
    isRecharge: false,
    rechargeOptions: [],
    disableCustomRecharge: false,
    providers: [],
    successUrl: "",
    state: "Published",
  };
}
