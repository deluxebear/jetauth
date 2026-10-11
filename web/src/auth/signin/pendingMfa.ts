import type { ComponentProps } from "react";
import type MfaVerify from "../../pages/MfaVerify";
import type { LoginApiResponse } from "../authPost";

type MfaProps = ComponentProps<typeof MfaVerify>["mfaProps"];

/**
 * A sign-in that /api/login answered with NextMfa (user has MFA enabled) or
 * RequiredMfa (the organization requires MFA and the user has none yet).
 * For verify, `baseBody` is the original request minus identity and credential
 * fields: /api/login only reaches its MFA branch when no username is sent, and
 * the remaining fields keep the OAuth / SAML context. Setup keeps the full
 * original request so it can sign in again once a factor is enrolled.
 */
export type PendingMfa =
  | { kind: "verify"; mfaProps: MfaProps; loginUrl: string; baseBody: Record<string, unknown> }
  | { kind: "setup"; userId: string; password: string; loginUrl: string; loginBody: Record<string, unknown> };

export function pendingMfaFrom(
  res: LoginApiResponse,
  loginUrl: string,
  body: Record<string, unknown>,
): PendingMfa | null {
  const { password, ...rest } = body;
  const baseBody = Object.fromEntries(
    // clientId is dropped too: the sign-in pages fill it with the app name,
    // while /api/login's MFA branch resolves it as an OAuth client id (OAuth
    // flows carry the real one in loginUrl's query string).
    Object.entries(rest).filter(([k]) => !["username", "code", "signinMethod", "faceIdImage", "clientId"].includes(k)),
  );
  const data2 = (res as { data2?: unknown }).data2;
  if (res.data === "NextMfa") {
    return { kind: "verify", mfaProps: (Array.isArray(data2) ? data2 : []) as MfaProps, loginUrl, baseBody };
  }
  // RequiredMfa carries the user id in data2 so setup works even when the
  // user signed in with an email or phone instead of the username. Setup
  // needs the password again, so it is only offered after a password login.
  if (res.data === "RequiredMfa" && typeof data2 === "string" && typeof password === "string") {
    return { kind: "setup", userId: data2, password, loginUrl, loginBody: body };
  }
  return null;
}
