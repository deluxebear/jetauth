const BASE = "";

export async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const opts: RequestInit = {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  get: <T = unknown>(path: string) => request<T>("GET", path),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>("POST", path, body),
};

// Auth
export const login = (values: {
  application: string;
  organization: string;
  username: string;
  password: string;
  type: string;
}) => api.post("/api/login", values);

export const logout = () => api.post("/api/logout");
export const getAccount = () => api.get("/api/get-account");

// Generic CRUD
export const getItems = (type: string, owner: string, page: number, pageSize: number) =>
  api.get(`/api/get-${type}?owner=${owner}&p=${page}&pageSize=${pageSize}`);

export const getItem = (type: string, id: string) =>
  api.get(`/api/get-${type}?id=${id}`);

export const addItem = (type: string, body: unknown) =>
  api.post(`/api/add-${type}`, body);

export const updateItem = (type: string, id: string, body: unknown) =>
  api.post(`/api/update-${type}?id=${id}`, body);

export const deleteItem = (type: string, body: unknown) =>
  api.post(`/api/delete-${type}`, body);
