// Core request utility — all API calls go through here

export interface ApiResponse<T = unknown> {
  status: "ok" | "error";
  msg: string;
  data: T;
  data2?: unknown;
}

const SERVER_URL = "";

function getAcceptLanguage(): string {
  return localStorage.getItem("locale") ?? navigator.language ?? "en";
}

export async function request<T = unknown>(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const opts: RequestInit = {
    method,
    credentials: "include",
    headers: {
      "Accept-Language": getAcceptLanguage(),
    },
  };
  if (body) {
    (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${SERVER_URL}${path}`, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// Pagination query builder
export function paginationQuery(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
  [key: string]: string | number | undefined;
}): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs;
}
