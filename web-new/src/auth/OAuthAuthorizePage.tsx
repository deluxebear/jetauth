import { useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import {
  buildOAuthCodeQuery,
  buildOAuthRedirectUrl,
  type LoginApiResponse,
} from "./authPost";
import type { AppLoginResponse } from "./api/types";

interface Props {
  /**
   * true → user already has a JetAuth session; POST /api/login with the
   * session cookie to mint an auth code and redirect directly.
   * false → hand off to AuthShell at /login/<org>/<app> for credential entry.
   */
  authed: boolean;
}

/**
 * Entry for OAuth/OIDC authorize (/login/oauth/authorize?client_id=...).
 * Resolves client_id via the backend into an application, then either
 * exchanges directly for an auth code (authed) or hands off to AuthShell
 * (anon). SigninPage.handleOAuthRedirect completes the anon path.
 */
export default function OAuthAuthorizePage({ authed }: Props) {
  const [searchParams] = useSearchParams();
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState("");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const clientId = searchParams.get("client_id");
    const redirectUri = searchParams.get("redirect_uri") ?? "";
    const state = searchParams.get("state") ?? "";
    if (!clientId || !redirectUri) {
      setError("Missing client_id or redirect_uri");
      return;
    }

    const oauthQs = buildOAuthCodeQuery(searchParams);
    (async () => {
      try {
        const res = await api.get<AppLoginResponse>(`/api/get-app-login?type=code&${oauthQs}`);
        if (res.status !== "ok" || !res.data) {
          setError(res.msg || "Failed to resolve application");
          return;
        }
        const org = res.data.organization ?? "";
        const name = res.data.name ?? "";
        if (!org || !name) {
          setError("Resolved application is missing organization/name");
          return;
        }

        if (!authed) {
          // AuthShell + SigninPage complete login; force type=code so the
          // OAuth branch fires, keep the rest of the incoming query intact.
          const fwd = new URLSearchParams(searchParams);
          fwd.set("type", "code");
          setTarget(`/login/${encodeURIComponent(org)}/${encodeURIComponent(name)}?${fwd.toString()}`);
          return;
        }

        const login = await api.post<LoginApiResponse>(`/api/login?${oauthQs}`, {
          application: name,
          organization: org,
          type: "code",
        });
        if (login.status !== "ok" || !login.data) {
          setError(login.msg || "Authorization failed");
          return;
        }
        window.location.replace(buildOAuthRedirectUrl(redirectUri, login.data, state));
      } catch (e: unknown) {
        setError((e as Error).message ?? "network error");
      }
    })();
  }, [authed, searchParams]);

  if (error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          <div className="font-semibold mb-1">OAuth authorize failed</div>
          <div className="opacity-80 break-all">{error}</div>
        </div>
      </div>
    );
  }
  if (target) {
    return <Navigate to={target} replace />;
  }
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-[13px] text-text-muted">
      Authorizing…
    </div>
  );
}
