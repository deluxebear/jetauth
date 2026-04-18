import { api } from "../../api/client";
import type { AppLoginResponse, AuthApplication, ResolvedProvider } from "./types";

export interface LoadedApp {
  application: AuthApplication;
  providers: ResolvedProvider[];
}

export async function getAppLogin(appId: string): Promise<LoadedApp> {
  const res = await api.get<AppLoginResponse>(
    `/api/get-app-login?id=${encodeURIComponent(appId)}`
  );
  if (res.status !== "ok" || !res.data) {
    throw new Error(res.msg || "failed to load application");
  }
  return {
    application: res.data,
    providers: res.providersResolved ?? [],
  };
}
