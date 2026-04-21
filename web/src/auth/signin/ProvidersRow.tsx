import type {
  ResolvedProvider,
  AuthApplication,
  SigninItemProvider,
} from "../api/types";
import { useTranslation } from "../../i18n";
import { useTheme } from "../../theme";
import { getAuthUrl } from "../providerAuth";

/**
 * Picks the right logo for the active theme. Falls back to the light URL
 * when the dark one is missing (the backend already mirrors light→dark, but
 * we keep this guard so callers can't render a broken image).
 */
function logoFor(p: ResolvedProvider, theme: "light" | "dark"): string {
  if (theme === "dark" && p.logoUrlDark) return p.logoUrlDark;
  return p.logoUrl;
}

interface ProvidersRowProps {
  application: AuthApplication;
  providers: ResolvedProvider[];
  /**
   * Per-provider display config from the app's signinItems[name="Providers"].
   * When undefined/empty, falls back to legacy behavior (all providers in
   * server order, uniform compact size, 3-per-row with a "More" overflow).
   *
   * When set:
   *  - Only providers listed here are rendered (in the order given)
   *  - Entries where `visible === false` are skipped
   *  - "primary" group renders first, then "secondary" below a thin divider
   *  - "large" entries are full-width buttons with the display name;
   *    "small" entries are compact icon-only tiles wrapped in a flex row
   *  - Providers listed in config but not present in the live `providers`
   *    prop (e.g. removed from the Providers tab) are silently skipped
   */
  config?: SigninItemProvider[];
}

/**
 * Renders a row of branded OAuth provider buttons.
 *
 * - Default (no config): up to 3 providers shown directly as compact tiles,
 *   4+ collapse into a <details>-based "More" menu. Empty list renders nothing.
 * - With admin config: only listed providers render; ordering, visibility,
 *   size (large / small), and grouping (primary / secondary) come from config.
 *
 * On click, builds the provider's own authorize URL (e.g. GitHub's
 * https://github.com/login/oauth/authorize?...) via getAuthUrl, stashes a
 * PKCE verifier keyed by the state param, and navigates there. The return
 * leg lands on /callback where AuthCallback swaps code+state for a session.
 */
export default function ProvidersRow({
  application,
  providers,
  config,
}: ProvidersRowProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  if (providers.length === 0) return null;

  const go = async (p: ResolvedProvider) => {
    // Both login and signup buttons send method="signup" — matches legacy
    // Casdoor. The backend's /api/login "signup" branch already handles
    // both cases (existing GitHub binding → log in, no binding + signup
    // allowed → create user). The "signin" method is the ACCOUNT-LINKING
    // flow (requires an active session) and 404s unauthenticated callers.
    const url = await getAuthUrl(application, p, "signup");
    if (!url) return;
    window.location.assign(url);
  };

  // ─── Configured path ───────────────────────────────────────────────────────
  // Admin explicitly listed providers → honor the config strictly. Providers
  // missing from `providers` (removed from the Providers tab) are skipped
  // silently. Providers missing from `config` (newly added to the tab) are
  // NOT auto-shown — admins must opt them in by adding them here.
  if (config && config.length > 0) {
    const byName = new Map(providers.map((p) => [p.name, p]));

    type Entry = { provider: ResolvedProvider; cfg: SigninItemProvider };
    const entries: Entry[] = [];
    for (const cfg of config) {
      if (cfg.visible === false) continue;
      const provider = byName.get(cfg.name);
      if (!provider) continue; // admin removed it from Providers tab
      entries.push({ provider, cfg });
    }
    if (entries.length === 0) return null;

    const primary = entries.filter((e) => e.cfg.group !== "secondary");
    const secondary = entries.filter((e) => e.cfg.group === "secondary");

    return (
      <>
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] text-text-muted">
            {t("auth.providers.divider")}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        {primary.length > 0 && (
          <ProvidersGroup entries={primary} onPick={go} t={t} theme={theme} />
        )}
        {secondary.length > 0 && (
          <>
            {primary.length > 0 && (
              <div className="my-3 h-px bg-border-subtle" aria-hidden="true" />
            )}
            <ProvidersGroup entries={secondary} onPick={go} t={t} theme={theme} />
          </>
        )}
      </>
    );
  }

  // ─── Legacy path ───────────────────────────────────────────────────────────
  // No config → render all providers in server order, uniform compact tiles,
  // 3-per-row with overflow collapse. Preserves pre-Pass-2 behavior.
  const visible = providers.slice(0, 3);
  const overflow = providers.slice(3);

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
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-1 py-2.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
          >
            <img src={logoFor(p, theme)} alt={p.displayName} className="h-4 w-4" />
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
                  <img src={logoFor(p, theme)} alt={p.displayName} className="h-4 w-4" />
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

/**
 * Renders a single group (primary or secondary) of configured providers.
 *
 * "large" entries stack vertically at full width with the display name;
 * "small" entries collapse into a flex-wrap row of icon-only tiles. Mixed
 * groups render the large entries first, then all smalls in a wrap row below
 * them — this keeps the visual weight predictable.
 */
function ProvidersGroup({
  entries,
  onPick,
  t,
  theme,
}: {
  entries: Array<{ provider: ResolvedProvider; cfg: SigninItemProvider }>;
  onPick: (p: ResolvedProvider) => void;
  t: (k: string) => string;
  theme: "light" | "dark";
}) {
  const large = entries.filter((e) => e.cfg.size === "large");
  const small = entries.filter((e) => e.cfg.size !== "large");

  return (
    <div className="space-y-2">
      {large.length > 0 && (
        <div className="space-y-2">
          {large.map(({ provider: p }) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onPick(p)}
              title={t("auth.providers.continueWith").replace("{name}", p.displayName)}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-1 py-2.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
            >
              <img src={logoFor(p, theme)} alt={p.displayName} className="h-4 w-4" />
              <span className="truncate">
                {t("auth.providers.continueWith").replace("{name}", p.displayName)}
              </span>
            </button>
          ))}
        </div>
      )}
      {small.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {small.map(({ provider: p }) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onPick(p)}
              aria-label={t("auth.providers.continueWith").replace("{name}", p.displayName)}
              title={t("auth.providers.continueWith").replace("{name}", p.displayName)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-1 text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
            >
              <img src={logoFor(p, theme)} alt={p.displayName} className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
