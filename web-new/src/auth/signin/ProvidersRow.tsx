import type { ResolvedProvider, AuthApplication } from "../api/types";
import { useTranslation } from "../../i18n";

interface ProvidersRowProps {
  application: AuthApplication;
  providers: ResolvedProvider[];
  redirectUri?: string;
  state?: string;
}

/**
 * Renders a row of branded OAuth provider buttons.
 * - Up to 3 providers shown directly as buttons
 * - 4+ providers: extra ones collapse into a <details>-based "More" menu
 * - Empty list: renders nothing (no divider, no empty row)
 *
 * Each button navigates via window.location.assign to the application's
 * OAuth-authorize route (`/api/login/oauth/authorize/<providerName>?...`),
 * which the backend already handles.
 */
export default function ProvidersRow({
  application,
  providers,
  redirectUri,
  state,
}: ProvidersRowProps) {
  const { t } = useTranslation();
  if (providers.length === 0) return null;

  const visible = providers.slice(0, 3);
  const overflow = providers.slice(3);

  const buildAuthorizeUrl = (p: ResolvedProvider): string => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams({
      client_id: p.clientId,
      response_type: "code",
      redirect_uri: redirectUri ?? `${origin}/callback`,
      scope: "profile",
      state: state ?? application.name,
    });
    return `/api/login/oauth/authorize/${encodeURIComponent(p.name)}?${params.toString()}`;
  };

  const go = (p: ResolvedProvider) => {
    window.location.assign(buildAuthorizeUrl(p));
  };

  return (
    <>
      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] text-text-muted">
          {t("auth.providers.divider")}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {visible.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => go(p)}
            title={t("auth.providers.continueWith").replace("{name}", p.displayName)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-1 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
          >
            <img src={p.logoUrl} alt={p.displayName} className="h-4 w-4" />
            <span className="truncate">{p.displayName}</span>
          </button>
        ))}
        {overflow.length > 0 && (
          <details className="relative col-span-3 text-[12px]">
            <summary className="cursor-pointer list-none rounded-lg border border-border bg-surface-1 py-2 text-center text-text-secondary hover:bg-surface-2">
              {t("auth.providers.moreMenu")} ({overflow.length})
            </summary>
            <div className="absolute left-0 right-0 mt-1 rounded-lg border border-border bg-surface-1 p-1 shadow-[var(--shadow-elevated)] z-10">
              {overflow.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => go(p)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-text-secondary hover:bg-surface-2"
                >
                  <img src={p.logoUrl} alt={p.displayName} className="h-4 w-4" />
                  <span className="truncate">{p.displayName}</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  );
}
