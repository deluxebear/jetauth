import { api } from "../../api/client";
import type { ResolveSigninRequest, ResolveSigninPayload, ResolveSigninResponse } from "./types";

export async function resolveSigninMethods(
  req: ResolveSigninRequest
): Promise<ResolveSigninPayload> {
  const res = await api.post<ResolveSigninResponse>("/api/resolve-signin-methods", req);
  if (res.status !== "ok" || !res.data) {
    throw new Error(res.msg || "failed to resolve signin methods");
  }
  return res.data;
}
