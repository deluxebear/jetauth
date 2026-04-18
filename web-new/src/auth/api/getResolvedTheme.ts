import { api } from "../../api/client";
import type { ResolvedThemePayload } from "./types";

export async function getResolvedTheme(appId: string): Promise<ResolvedThemePayload> {
  const res = await api.get<{ status: string; msg?: string; data: ResolvedThemePayload }>(
    `/api/get-resolved-theme?app=${encodeURIComponent(appId)}`
  );
  if (res.status !== "ok" || !res.data) {
    throw new Error(res.msg || "failed to load resolved theme");
  }
  return res.data;
}
