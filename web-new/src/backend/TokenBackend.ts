import { request, paginationQuery } from "./request";

export interface Token {
  owner: string;
  name: string;
  createdTime: string;
  application: string;
  organization: string;
  user: string;
  code: string;
  accessToken: string;
  refreshToken: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  expiresIn: number;
  scope: string;
  tokenType: string;
  codeChallenge: string;
  codeIsUsed: boolean;
  codeExpireIn: number;
  resource: string;
  [key: string]: unknown;
}

export function getTokens(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
  organization?: string;
}) {
  return request<Token[]>("GET", `/api/get-tokens?${paginationQuery(params)}`);
}

export function getToken(owner: string, name: string) {
  return request<Token>(
    "GET",
    `/api/get-token?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addToken(token: Token) {
  return request("POST", "/api/add-token", token);
}

export function updateToken(owner: string, name: string, token: Token) {
  return request(
    "POST",
    `/api/update-token?id=${owner}/${encodeURIComponent(name)}`,
    token
  );
}

export function deleteToken(token: Token) {
  return request("POST", "/api/delete-token", token);
}

export function newToken(owner: string, organization: string): Token {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner: "admin",
    name: `token_${rand}`,
    createdTime: new Date().toISOString(),
    application: "app-built-in",
    organization,
    user: "admin",
    code: "",
    accessToken: "",
    refreshToken: "",
    accessTokenHash: "",
    refreshTokenHash: "",
    expiresIn: 7200,
    scope: "read",
    tokenType: "Bearer",
    codeChallenge: "",
    codeIsUsed: false,
    codeExpireIn: 0,
    resource: "",
  };
}
