import { api } from "../../api/client";
import type { AppLoginResponse, AuthApplication, ResolvedProvider } from "./types";
import { lookupQueryString, type AuthLookup } from "./getResolvedTheme";

export type { AuthLookup };

export interface LoadedApp {
  application: AuthApplication;
  providers: ResolvedProvider[];
}

export async function getAppLogin(lookup: AuthLookup): Promise<LoadedApp> {
  const qs = lookupQueryString(lookup, "id");
  const res = await api.get<AppLoginResponse>(`/api/get-app-login?${qs}`);
  if (res.status !== "ok" || !res.data) {
    throw new Error(res.msg || "failed to load application");
  }
  return {
    application: res.data,
    providers: res.providersResolved ?? [],
  };
}
