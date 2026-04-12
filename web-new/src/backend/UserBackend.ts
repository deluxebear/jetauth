import { request, paginationQuery } from "./request";

export interface User {
  owner: string;
  name: string;
  createdTime: string;
  id: string;
  type: string;
  password: string;
  passwordSalt: string;
  displayName: string;
  firstName: string;
  lastName: string;
  avatar: string;
  email: string;
  phone: string;
  countryCode: string;
  region: string;
  location: string;
  address: string[];
  affiliation: string;
  title: string;
  homepage: string;
  bio: string;
  tag: string;
  language: string;
  gender: string;
  birthday: string;
  education: string;
  realName: string;
  idCardType: string;
  idCard: string;
  isAdmin: boolean;
  isGlobalAdmin: boolean;
  isForbidden: boolean;
  isDeleted: boolean;
  isVerified: boolean;
  signupApplication: string;
  registerType: string;
  registerSource: string;
  score: number;
  karma: number;
  ranking: number;
  balance: number;
  balanceCredit: number;
  balanceCurrency: string;
  ipWhitelist: string;
  properties: Record<string, string>;
  groups: string[];
  [key: string]: unknown;
}

export function getGlobalUsers(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  // For global users, only pass pagination params (no owner filter)
  const { owner, ...rest } = params;
  const qs = Object.entries(rest)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return request<User[]>("GET", `/api/get-global-users?${qs}`);
}

export function getUsers(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
  groupName?: string;
}) {
  const qs = paginationQuery(params);
  return request<User[]>("GET", `/api/get-users?${qs}`);
}

export function getUser(owner: string, name: string) {
  return request<User>(
    "GET",
    `/api/get-user?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addUser(user: Partial<User>) {
  return request("POST", "/api/add-user", user);
}

export function updateUser(owner: string, name: string, user: User) {
  return request(
    "POST",
    `/api/update-user?id=${owner}/${encodeURIComponent(name)}`,
    user
  );
}

export function setPassword(userOwner: string, userName: string, oldPassword: string, newPassword: string) {
  const formData = new FormData();
  formData.append("userOwner", userOwner);
  formData.append("userName", userName);
  formData.append("oldPassword", oldPassword);
  formData.append("newPassword", newPassword);
  return fetch("/api/set-password", {
    method: "POST",
    credentials: "include",
    body: formData,
  }).then((res) => res.json());
}

export function deleteUser(user: User) {
  return request("POST", "/api/delete-user", user);
}

export async function impersonateUser(owner: string, name: string) {
  const formData = new FormData();
  formData.append("username", `${owner}/${name}`);
  const res = await fetch("/api/impersonate-user", {
    method: "POST",
    credentials: "include",
    body: formData,
    headers: {
      "Accept-Language": localStorage.getItem("locale") ?? navigator.language ?? "en",
    },
  });
  return res.json();
}

export async function exitImpersonateUser() {
  const res = await fetch("/api/exit-impersonate-user", {
    method: "POST",
    credentials: "include",
  });
  return res.json();
}

export async function verifyIdentification(owner: string, name: string, provider = "") {
  const params = new URLSearchParams();
  if (owner && name) { params.set("owner", owner); params.set("name", name); }
  if (provider) params.set("provider", provider);
  const res = await fetch(`/api/verify-identification?${params.toString()}`, {
    method: "POST",
    credentials: "include",
    headers: { "Accept-Language": localStorage.getItem("locale") ?? navigator.language ?? "en" },
  });
  return res.json();
}

export async function removeUserFromGroup(params: { owner: string; name: string; groupName: string }) {
  const formData = new FormData();
  formData.append("owner", params.owner);
  formData.append("name", params.name);
  formData.append("groupName", params.groupName);
  const res = await fetch("/api/remove-user-from-group", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  return res.json();
}

export function generateRandomPassword(length = 8): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  // Ensure at least one of each category
  let pwd = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = pwd.length; i < length; i++) {
    pwd.push(all[Math.floor(Math.random() * all.length)]);
  }
  // Shuffle
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join("");
}

export function newUser(orgName: string): Partial<User> {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner: orgName,
    name: `user_${rand}`,
    createdTime: new Date().toISOString(),
    type: "normal-user",
    password: generateRandomPassword(),
    passwordSalt: "",
    displayName: `New User - ${rand}`,
    avatar: "https://cdn.casbin.org/img/casbin.svg",
    email: "",
    phone: "",
    countryCode: "",
    address: [],
    groups: [],
    affiliation: "Example Inc.",
    tag: "staff",
    region: "",
    realName: "",
    isVerified: false,
    isAdmin: orgName === "built-in",
    isForbidden: false,
    isDeleted: false,
    score: 0,
    properties: {},
    signupApplication: "",
    registerType: "Add User",
    balanceCurrency: "USD",
  };
}
