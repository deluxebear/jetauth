import { request, paginationQuery } from "./request";

export interface Agent {
  owner: string;
  name: string;
  createdTime: string;
  updatedTime: string;
  displayName: string;
  url: string;
  token: string;
  application: string;
  [key: string]: unknown;
}

export function getAgents(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Agent[]>("GET", `/api/get-agents?${paginationQuery(params)}`);
}

export function getAgent(owner: string, name: string) {
  return request<Agent>(
    "GET",
    `/api/get-agent?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addAgent(agent: Agent) {
  return request("POST", "/api/add-agent", agent);
}

export function updateAgent(owner: string, name: string, agent: Agent) {
  return request(
    "POST",
    `/api/update-agent?id=${owner}/${encodeURIComponent(name)}`,
    agent
  );
}

export function deleteAgent(agent: Agent) {
  return request("POST", "/api/delete-agent", agent);
}

export function newAgent(owner: string): Agent {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `agent_${rand}`,
    createdTime: new Date().toISOString(),
    updatedTime: "",
    displayName: `New Agent - ${rand}`,
    url: "",
    token: "",
    application: "",
  };
}
