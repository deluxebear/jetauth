import { api } from "../../api/client";
import type { ResolvedThemePayload } from "./types";

/**
 * Identifies which application/org the auth surface is resolving theme for.
 * - `{ kind: "app", appId }` — exact application (e.g. `/login/org/app`)
 * - `{ kind: "org", orgName }` — org-level login (e.g. `/login/org`),
 *   backend resolves to `org.defaultApplication` or falls back to
 *   `admin/app-built-in`.
 */
export type AuthLookup =
  | { kind: "app"; appId: string }
  | { kind: "org"; orgName: string };

export function lookupQueryString(lookup: AuthLookup, appKey = "app"): string {
  if (lookup.kind === "app") {
    return `${appKey}=${encodeURIComponent(lookup.appId)}`;
  }
  return `organization=${encodeURIComponent(lookup.orgName)}`;
}

export async function getResolvedTheme(lookup: AuthLookup): Promise<ResolvedThemePayload> {
  const qs = lookupQueryString(lookup, "app");
  const res = await api.get<{ status: string; msg?: string; data: ResolvedThemePayload }>(
    `/api/get-resolved-theme?${qs}`
  );
  if (res.status !== "ok" || !res.data) {
    throw new Error(res.msg || "failed to load resolved theme");
  }
  return res.data;
}
