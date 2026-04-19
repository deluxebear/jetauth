import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { decodeState, consumeCodeVerifier } from "./providerAuth";
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

    const code = searchParams.get("code") ?? searchParams.get("authCode") ?? searchParams.get("auth_code");
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
    const providerName = inner.get("provider") ?? "";
    // Fallback to "signup" (not "signin") if state decode lost the method —
    // on the backend "signin" means account-linking and requires an active
    // session; "signup" is the combined login-or-register branch, which is
    // what unauthenticated callback traffic always wants.
    const method = inner.get("method") ?? "signup";
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

    const body = {
      type: "login",
      application: applicationName,
      organization: "",
      provider: providerName,
      code,
      state: applicationName,
      redirectUri: `${window.location.origin}/callback`,
      method,
      codeVerifier: verifier,
    };

    api.post<{ status: string; msg?: string; data?: unknown }>("/api/login", body)
      .then((res) => {
        if (res.status === "ok") {
          // Hard navigation so App re-runs getAccount() against the fresh
          // session cookie and shows the authenticated shell.
          window.location.assign("/");
        } else {
          setMsg(res.msg || "Sign-in failed.");
        }
      })
      .catch((err) => {
        setMsg(String(err));
      });
  }, [searchParams]);

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
          <a href="/login" className="mt-3 inline-block text-accent hover:underline">
            Back to login
          </a>
        </div>
      )}
    </div>
  );
}
