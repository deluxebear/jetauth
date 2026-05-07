import { request, paginationQuery } from "./request";

export interface Entry {
  owner: string;
  name: string;
  createdTime: string;
  updatedTime: string;
  displayName: string;
  provider: string;
  application: string;
  type: string;
  clientIp: string;
  userAgent: string;
  message: string;
  [key: string]: unknown;
}

// Mirrors object/openclaw_session_graph.go. The session graph reconstructs
// the full LLM agent behavior tree (task → tool_call → tool_result → final)
// from session-typed Entries that share the same anchor.
export interface OpenClawSessionGraphNode {
  id: string;
  parentId?: string;
  originalParentId?: string;
  entryId?: string;
  toolCallId?: string;
  kind: string;
  timestamp: string;
  summary: string;
  tool?: string;
  query?: string;
  url?: string;
  path?: string;
  ok?: boolean;
  error?: string;
  text?: string;
  isAnchor: boolean;
}

export interface OpenClawSessionGraphEdge {
  source: string;
  target: string;
}

export interface OpenClawSessionGraphStats {
  totalNodes: number;
  taskCount: number;
  toolCallCount: number;
  toolResultCount: number;
  finalCount: number;
  failedCount: number;
}

export interface OpenClawSessionGraph {
  nodes: OpenClawSessionGraphNode[];
  edges: OpenClawSessionGraphEdge[];
  stats: OpenClawSessionGraphStats;
}

export interface EntryAdvancedFilter {
  /** Comma-joined Entry.type values (trace, metrics, log, session). */
  types?: string;
  /** Exact match on provider name. */
  provider?: string;
  /** Exact match on application name. */
  application?: string;
  /** ISO timestamp lower bound for createdTime, inclusive. */
  startTime?: string;
  /** ISO timestamp upper bound for createdTime, inclusive. */
  endTime?: string;
  // Index signature so this slots into paginationQuery's untyped param map
  // (request.ts), which builds the URL from arbitrary string keys.
  [key: string]: string | number | boolean | undefined;
}

export function getEntries(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
} & EntryAdvancedFilter) {
  // paginationQuery drops empty/undefined values, so the URL stays compact
  // when no advanced filter is active.
  return request<Entry[]>("GET", `/api/get-entries?${paginationQuery(params)}`);
}

export function getEntry(owner: string, name: string) {
  return request<Entry>(
    "GET",
    `/api/get-entry?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addEntry(entry: Entry) {
  return request("POST", "/api/add-entry", entry);
}

export function updateEntry(owner: string, name: string, entry: Entry) {
  return request(
    "POST",
    `/api/update-entry?id=${owner}/${encodeURIComponent(name)}`,
    entry
  );
}

export function deleteEntry(entry: Entry) {
  return request("POST", "/api/delete-entry", entry);
}

// Fetches the rebuilt OpenClaw session graph anchored on this entry.
// Backend returns 200 with data:null when the entry isn't a session anchor.
export function getOpenClawSessionGraph(owner: string, name: string) {
  return request<OpenClawSessionGraph>(
    "GET",
    `/api/get-openclaw-session-graph?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function newEntry(owner: string): Entry {
  const rand = Math.random().toString(16).slice(2, 18);
  return {
    owner,
    name: rand,
    createdTime: new Date().toISOString(),
    updatedTime: "",
    displayName: rand,
    provider: "",
    application: "",
    type: "",
    clientIp: "",
    userAgent: "",
    message: "",
  };
}
