import { useState } from "react";
import { ShieldCheck, Check } from "lucide-react";
import { api } from "../api/client";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";
import { buildOAuthErrorRedirectUrl, buildOAuthRedirectUrl } from "./authPost";
import type { AuthApplication } from "./api/types";

interface Props {
  application: Pick<AuthApplication, "name" | "displayName" | "logo" | "customScopes" | "organizationObj">;
  /** The OAuth authorize query (client_id, redirect_uri, scope, state, …). */
  searchParams: URLSearchParams;
}

/**
 * OAuth consent screen, shown when /api/login answers a code request with
 * `{ required: true }`. Allow → /api/grant-consent records the scopes and
 * returns the code; Deny → back to the client with error=access_denied. The
 * backend only reports "consent required" after validating redirect_uri, so
 * redirecting there on deny is safe.
 */
export default function OAuthConsentStep({ application, searchParams }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const clientId = searchParams.get("client_id") ?? "";
  const redirectUri = searchParams.get("redirect_uri") ?? "";
  const state = searchParams.get("state") ?? "";
  const scope = searchParams.get("scope") ?? "";

  // Show only the custom scopes this request asks for — the same set the
  // backend requires consent for and records on grant.
  const requested = new Set(scope.split(/\s+/).filter(Boolean));
  const scopes = (application.customScopes ?? []).filter((s) => s.scope && requested.has(s.scope));

  const appName = application.displayName || application.name;
  const logo =
    theme === "dark" && application.organizationObj?.logoDark
      ? application.organizationObj.logoDark
      : application.logo || application.organizationObj?.logo;

  const allow = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await api.post<{ status: string; msg?: string; data?: string }>("/api/grant-consent", {
        application: `admin/${application.name}`,
        grantedScopes: scopes.map((s) => s.scope),
        clientId,
        responseType: searchParams.get("response_type") ?? "code",
        redirectUri,
        scope,
        state,
        nonce: searchParams.get("nonce") ?? "",
        challenge: searchParams.get("code_challenge") ?? "",
        resource: searchParams.get("resource") ?? "",
      });
      if (res.status !== "ok" || !res.data) {
        setError(res.msg || t("oauth.consent.failed"));
        setSubmitting(false);
        return;
      }
      window.location.replace(buildOAuthRedirectUrl(redirectUri, res.data, state));
    } catch (e: unknown) {
      setError((e as Error).message || t("oauth.consent.failed"));
      setSubmitting(false);
    }
  };

  const deny = () => {
    setSubmitting(true);
    window.location.replace(buildOAuthErrorRedirectUrl(redirectUri, "access_denied", state));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          {logo ? (
            <img src={logo} alt="" className="h-12 max-w-[200px] object-contain" />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center">
              <ShieldCheck size={24} className="text-accent" />
            </div>
          )}
        </div>

        <h2 className="text-xl font-bold text-center text-text-primary mb-1">
          {t("oauth.consent.title").replace("{app}", appName)}
        </h2>
        <p className="text-[13px] text-center text-text-muted mb-6">{t("oauth.consent.subtitle")}</p>

        {error && (
          <div role="alert" className="login-card mb-4 border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
            {error}
          </div>
        )}

        <ul className="login-card mb-6 divide-y divide-border-subtle border border-border bg-surface-1">
          {scopes.map((s) => (
            <li key={s.scope} className="flex gap-3 px-4 py-3">
              <Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-text-primary">{s.displayName || s.scope}</div>
                {s.description && <div className="text-[12px] text-text-muted mt-0.5">{s.description}</div>}
              </div>
            </li>
          ))}
        </ul>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={deny}
            disabled={submitting}
            className="login-btn flex-1 border border-border bg-surface-1 py-2.5 text-[14px] font-medium text-text-primary hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {t("oauth.consent.deny")}
          </button>
          <button
            type="button"
            onClick={allow}
            disabled={submitting}
            className="login-btn flex-1 bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {t("oauth.consent.allow")}
          </button>
        </div>

        <p className="mt-4 text-[12px] text-center text-text-muted">{t("oauth.consent.note")}</p>
      </div>
    </div>
  );
}
