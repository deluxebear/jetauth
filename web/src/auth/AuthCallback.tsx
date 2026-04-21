import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { decodeState, consumeCodeVerifier, submitProviderLogin } from "./providerAuth";
import { submitSamlResponse, buildOAuthCodeQuery, buildOAuthRedirectUrl, type LoginApiResponse } from "./authPost";
import { api } from "../api/client";

/**
 * Handles the return leg of "Sign in with GitHub / Google / ..." flows.
 *
 * The provider redirects here with ?code=...&state=...; we POST that plus any
 * PKCE verifier to /api/login and let the backend exchange the code and set
 * the session cookie. On success we hard-redirect to "/" so the top-level App
 * remounts, calls getAccount, and lands on the authenticated view.
 */
export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const [msg, setMsg] = useState<string | null>(null);
  // OAuth codes are single-use: the provider invalidates the code on first
  // exchange, so React 18 StrictMode's intentional double-mount of this effect
  // in dev would otherwise fire /api/login twice and race the success path
  // against a guaranteed "Bad credentials" on the second call. Guard with a
  // ref so the first-mount's fetch wins uncontested.
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;

    // Steam uses OpenID 2.0 — returns openid.* params instead of a code. Pack
    // the full query string as the "code" the backend Steam IdP expects.
    // DingTalk uses "authCode", WeCom historically used "auth_code".
    const isSteam = searchParams.has("openid.mode");
    const code = isSteam
      ? window.location.search
      : (searchParams.get("code") ?? searchParams.get("authCode") ?? searchParams.get("auth_code"));
    const state = searchParams.get("state") ?? "";
    const errorParam = searchParams.get("error_description") ?? searchParams.get("error");

    if (errorParam) {
      setMsg(errorParam);
      return;
    }
    if (!code || !state) {
      setMsg("Missing code or state in callback URL.");
      return;
    }

    const inner = decodeState(state);
    const applicationName = inner.get("application") ?? "";
    const organizationName = inner.get("organization") ?? "";
    const providerName = inner.get("provider") ?? "";
    // The original login URL (e.g. /login/jetems/ERP?invitationCode=ABC)
    // had its query string packed into state by encodeState, so the code
    // the user typed into the invite link round-trips through GitHub.
    const invitationCode = inner.get("invitationCode") ?? "";
    // Whitelist the method before forwarding — an attacker who could both
    // forge state (bypassing the verifier check below) and inject a custom
    // method would otherwise drive whichever backend branch they wanted.
    // Fall back to "signup" (the combined login-or-register branch) for
    // anything unexpected; "signin" is account-linking and requires a
    // session we don't have here.
    const rawMethod = inner.get("method");
    const method = rawMethod === "signup" || rawMethod === "signin" || rawMethod === "link"
      ? rawMethod
      : "signup";
    const verifier = consumeCodeVerifier(state);

    // CSRF guard: state carries a crypto-random nonce and is stored keyed on
    // itself at authorize time via `storeCodeVerifier`. If no entry exists for
    // this exact state, either the user never initiated this flow in this tab
    // (forged callback) or the flow was started in a different tab. Either
    // way, refuse to exchange the code.
    if (verifier === null) {
      setMsg("Sign-in state could not be verified. Start a new sign-in from the login page.");
      return;
    }

    // State carries the original /login query — if the flow began at an SP
    // (SAML or OAuth authorize), we still owe that SP a response after
    // provider login sets our session cookie.
    const samlRequest = inner.get("SAMLRequest") ?? inner.get("samlRequest") ?? "";
    const relayState = inner.get("RelayState") ?? inner.get("relayState") ?? "";
    const inboundClientId = inner.get("client_id") ?? "";
    const inboundRedirectUri = inner.get("redirect_uri") ?? "";
    const inboundSpState = inner.get("state") ?? "";

    submitProviderLogin({ applicationName, providerName, code, method, codeVerifier: verifier, invitationCode })
      .then(async (res) => {
        if (res.status !== "ok") {
          setMsg(res.msg || "Sign-in failed.");
          return;
        }
        if (samlRequest) {
          try {
            const samlRes = await api.post<LoginApiResponse>("/api/login", {
              application: applicationName,
              organization: organizationName,
              type: "saml",
              signinMethod: "Password",
              clientId: applicationName,
              samlRequest,
              relayState,
            });
            if (samlRes.status !== "ok" || !samlRes.data || !samlRes.data2?.redirectUrl) {
              setMsg(samlRes.msg ?? "SAML response failed");
              return;
            }
            submitSamlResponse({
              samlResponse: samlRes.data,
              redirectUrl: samlRes.data2.redirectUrl,
              method: samlRes.data2.method,
              relayState,
            });
            return;
          } catch (err) {
            setMsg(String(err));
            return;
          }
        }
        if (inboundClientId && inboundRedirectUri) {
          try {
            const oauthQs = buildOAuthCodeQuery(inner);
            const codeRes = await api.post<LoginApiResponse>(`/api/login?${oauthQs}`, {
              application: applicationName,
              organization: organizationName,
              type: "code",
            });
            if (codeRes.status !== "ok" || !codeRes.data) {
              setMsg(codeRes.msg ?? "Authorization failed");
              return;
            }
            window.location.replace(buildOAuthRedirectUrl(inboundRedirectUri, codeRes.data, inboundSpState));
            return;
          } catch (err) {
            setMsg(String(err));
            return;
          }
        }
        // Hard navigation so App re-runs getAccount() against the fresh
        // session cookie and shows the authenticated shell.
        window.location.assign("/");
      })
      .catch((err) => {
        setMsg(String(err));
      });
  }, [searchParams]);

  // Prefer the app-scoped login URL so the user lands on the same branded
  // page they started from (`/login/{org}/{app}`). Both fields were packed
  // into state at authorize time; fall back to the generic `/login` if
  // anything is missing (old callback links, tampered state).
  const state = searchParams.get("state") ?? "";
  const decoded = state ? decodeState(state) : new URLSearchParams();
  const backOrg = decoded.get("organization") ?? "";
  const backApp = decoded.get("application") ?? "";
  const backToLoginUrl = backOrg && backApp ? `/login/${backOrg}/${backApp}` : "/login";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-1 p-6">
      {msg === null ? (
        <div className="flex flex-col items-center gap-3 text-text-muted">
          <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
          <span className="text-[13px] font-mono">Signing in...</span>
        </div>
      ) : (
        <div className="max-w-md rounded-lg border border-danger/30 bg-danger/10 p-4 text-[13px] text-danger">
          <div className="font-semibold mb-1">Sign-in failed</div>
          <div className="opacity-80 break-all">{msg}</div>
          <a href={backToLoginUrl} className="mt-3 inline-block text-accent hover:underline">
            Back to login
          </a>
        </div>
      )}
    </div>
  );
}
