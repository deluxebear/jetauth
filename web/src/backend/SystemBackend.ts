import { request } from "./request";

export interface SystemInfo {
  cpuUsage: number[];
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  networkSent: number;
  networkRecv: number;
  networkTotal: number;
}

export interface VersionInfo {
  version: string;
  commitId: string;
  commitOffset: number;
}

export interface ApiLatencyItem {
  method: string;
  name: string;
  count: number;
  latency: string;
}

export interface ApiThroughputItem {
  method: string;
  name: string;
  throughput: number;
}

export interface PrometheusInfo {
  apiThroughput: ApiThroughputItem[];
  apiLatency: ApiLatencyItem[];
  totalThroughput: number;
}

export function getSystemInfo() {
  return request<SystemInfo>("GET", "/api/get-system-info");
}

export function getVersionInfo() {
  return request<VersionInfo>("GET", "/api/get-version-info");
}

export function getPrometheusInfo() {
  return request<PrometheusInfo>("GET", "/api/get-prometheus-info");
}
