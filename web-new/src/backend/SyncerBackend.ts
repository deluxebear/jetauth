import { request, paginationQuery } from "./request";

export interface TableColumn {
  name: string;
  type: string;
  casdoorName: string;
  isKey?: boolean;
  isHashed?: boolean;
  values: string[];
}

export interface Syncer {
  owner: string;
  name: string;
  createdTime: string;
  organization: string;
  type: string;
  databaseType: string;
  sslMode: string;
  sshType: string;
  host: string;
  port: number;
  user: string;
  password: string;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshPassword: string;
  cert: string;
  database: string;
  table: string;
  tableColumns: TableColumn[];
  affiliationTable: string;
  avatarBaseUrl: string;
  errorText: string;
  syncInterval: number;
  isReadOnly: boolean;
  isEnabled: boolean;
  [key: string]: unknown;
}

export function getSyncers(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Syncer[]>("GET", `/api/get-syncers?${paginationQuery(params)}`);
}

export function getSyncer(owner: string, name: string) {
  return request<Syncer>(
    "GET",
    `/api/get-syncer?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addSyncer(syncer: Syncer) {
  return request("POST", "/api/add-syncer", syncer);
}

export function updateSyncer(owner: string, name: string, syncer: Syncer) {
  return request(
    "POST",
    `/api/update-syncer?id=${owner}/${encodeURIComponent(name)}`,
    syncer
  );
}

export function deleteSyncer(syncer: Syncer) {
  return request("POST", "/api/delete-syncer", syncer);
}

export function testSyncerDb(syncer: Syncer) {
  return request("POST", "/api/test-syncer-db", syncer);
}

export function runSyncer(owner: string, name: string) {
  return request(
    "GET",
    `/api/run-syncer?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function newSyncer(owner: string): Syncer {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner: "admin",
    name: `syncer_${rand}`,
    createdTime: new Date().toISOString(),
    organization: owner,
    type: "Database",
    databaseType: "mysql",
    sslMode: "",
    sshType: "",
    host: "localhost",
    port: 3306,
    user: "root",
    password: "123456",
    sshHost: "",
    sshPort: 22,
    sshUser: "",
    sshPassword: "",
    cert: "",
    database: "dbName",
    table: "table_name",
    tableColumns: [],
    affiliationTable: "",
    avatarBaseUrl: "",
    errorText: "",
    syncInterval: 10,
    isReadOnly: false,
    isEnabled: false,
  };
}
