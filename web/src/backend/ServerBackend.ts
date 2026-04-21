import { request, paginationQuery } from "./request";

export interface Tool {
  name: string;
  description: string;
  inputSchema: unknown;
  isAllowed: boolean;
  [key: string]: unknown;
}

export interface Server {
  owner: string;
  name: string;
  createdTime: string;
  updatedTime: string;
  displayName: string;
  url: string;
  token: string;
  application: string;
  tools: Tool[];
  [key: string]: unknown;
}

export function getServers(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Server[]>("GET", `/api/get-servers?${paginationQuery(params)}`);
}

export function getServer(owner: string, name: string) {
  return request<Server>(
    "GET",
    `/api/get-server?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addServer(server: Server) {
  return request("POST", "/api/add-server", server);
}

export function updateServer(owner: string, name: string, server: Server) {
  return request(
    "POST",
    `/api/update-server?id=${owner}/${encodeURIComponent(name)}`,
    server
  );
}

export function deleteServer(server: Server) {
  return request("POST", "/api/delete-server", server);
}

export function syncMcpTool(owner: string, name: string, server: Server, isCleared = false) {
  return request(
    "POST",
    `/api/sync-mcp-tool?id=${owner}/${encodeURIComponent(name)}&isCleared=${isCleared ? "1" : "0"}`,
    server
  );
}

// Online MCP server from registry
export interface OnlineServer {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  website: string;
  categoriesRaw: string[];
  categoriesLower: string[];
  nameText: string;
}

// Intranet scan types
export interface ScanRequest {
  cidrs: string[];
  ports: string[];
  paths: string[];
  scheme?: string;
  timeoutMs?: number;
  maxConcurrency?: number;
}

export interface ScannedServer {
  host: string;
  port: number;
  path: string;
  url: string;
}

export interface ScanResult {
  cidrs: string[];
  scannedHosts: number;
  onlineHosts: string[];
  servers: ScannedServer[];
}

export function getOnlineServers() {
  return request<unknown>("GET", "/api/get-online-servers");
}

export function syncIntranetServers(scanRequest: ScanRequest) {
  return request<ScanResult>("POST", "/api/sync-intranet-servers", scanRequest);
}

export function newServer(owner: string): Server {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `server_${rand}`,
    createdTime: new Date().toISOString(),
    updatedTime: "",
    displayName: `New Server - ${rand}`,
    url: "",
    token: "",
    application: "",
    tools: [],
  };
}
