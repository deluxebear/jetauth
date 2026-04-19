import type { FieldProps } from "../DynamicField";
import type { ResolvedProvider } from "../../api/types";
import { useTranslation } from "../../../i18n";

/**
 * Renders the third-party provider list on the signup page.
 *
 * The admin-configured `rule` on the Providers signupItem drives layout:
 *  - "big"   → full-width stacked buttons labeled "Continue with <provider>"
 *  - "small" → compact 40x40 icon tiles in a wrap row (default when rule is
 *              absent or any other value)
 *
 * On click, navigates to `/api/login/oauth/authorize/<providerName>` with
 * OAuth params — same URL shape as the signin-side ProvidersRow.
 *
 * Rendering rules:
 *  - If no providers are configured for the application, render nothing.
 *  - Providers with `canSignUp === false` are filtered out (backend already
 *    hints at whether a provider permits registration).
 *  - A thin divider with "Or sign up with" sits above the buttons.
 */
export default function ProvidersField({ schema, context }: FieldProps) {
  const providers: ResolvedProvider[] = context?.providers ?? [];
  const eligible = providers.filter((p) => p.canSignUp !== false);

  // Early return BEFORE useTranslation so tests that don't wrap in
  // I18nProvider (e.g. DynamicField unit tests with no context) can still
  // assert the "no providers → renders nothing" contract without crashing
  // on a missing context. Hooks order is preserved because the early-return
  // branch never calls any hooks.
  if (eligible.length === 0) return null;

  return <ProvidersFieldInner schema={schema} context={context} eligible={eligible} />;
}

function ProvidersFieldInner({
  schema,
  context,
  eligible,
}: {
  schema: FieldProps["schema"];
  context: FieldProps["context"];
  eligible: ResolvedProvider[];
}) {
  const { t } = useTranslation();
  const application = context?.application;
  const redirectUri = context?.redirectUri;
  const state = context?.state;

  const mode = schema.rule === "big" ? "big" : "small";

  const buildAuthorizeUrl = (p: ResolvedProvider): string => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const appName = application?.name ?? "";
    const params = new URLSearchParams({
      client_id: p.clientId,
      response_type: "code",
      redirect_uri: redirectUri ?? `${origin}/callback`,
      scope: "profile",
      state: state ?? appName,
    });
    return `/api/login/oauth/authorize/${encodeURIComponent(p.name)}?${params.toString()}`;
  };

  const go = (p: ResolvedProvider) => {
    window.location.assign(buildAuthorizeUrl(p));
  };

  return (
    <div className="space-y-2">
      <div className="my-2 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] text-text-muted">
          {t("auth.signup.providers.title")}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      {mode === "big" ? (
        <div className="space-y-2">
          {eligible.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => go(p)}
              title={t("auth.providers.continueWith").replace("{name}", p.displayName)}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-1 py-2.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
            >
              <img src={p.logoUrl} alt={p.displayName} className="h-4 w-4" />
              <span className="truncate">
                {t("auth.providers.continueWith").replace("{name}", p.displayName)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {eligible.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => go(p)}
              aria-label={t("auth.providers.continueWith").replace("{name}", p.displayName)}
              title={t("auth.providers.continueWith").replace("{name}", p.displayName)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-1 text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
            >
              <img src={p.logoUrl} alt={p.displayName} className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

