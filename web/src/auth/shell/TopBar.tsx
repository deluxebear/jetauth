import { Sun, Moon, Globe } from "lucide-react";
import { useTheme } from "../../theme";
import { useTranslation } from "../../i18n";

interface TopBarProps {
  hideLanguage?: boolean;
}

/**
 * TopBar: theme toggle + language picker, fixed to the top-right of the auth
 * surface. Reusable across signin / signup / forgot-password pages.
 *
 * @param hideLanguage - when true, hides the language picker (controlled by
 *   application.signinItems["Languages"].visible=false).
 */
export default function TopBar({ hideLanguage = false }: TopBarProps = {}) {
  const { theme, toggle } = useTheme();
  const { locale, setLocale, locales } = useTranslation();

  return (
    <div className="absolute top-4 right-4 z-20 flex items-center gap-1">
      <button
        onClick={toggle}
        aria-label="toggle theme"
        className="rounded-lg p-2 text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
      >
        {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      {!hideLanguage && (
        <div className="relative group" data-signinitem="languages" data-forgetitem="languages" data-signupitem="languages">
          <button
            aria-label="change language"
            className="flex items-center gap-1 rounded-lg p-2 text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
          >
            <Globe size={17} />
            <span className="text-[12px] font-mono font-medium uppercase">{locale}</span>
          </button>
          <div className="invisible group-hover:visible group-focus-within:visible absolute right-0 top-full mt-1 w-36 rounded-lg border border-border bg-surface-2 py-1 shadow-[var(--shadow-elevated)]">
            {locales.map((l) => (
              <button
                key={l.value}
                onClick={() => setLocale(l.value)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-[13px] transition-colors ${
                  locale === l.value
                    ? "text-accent bg-accent-subtle"
                    : "text-text-secondary hover:bg-surface-3"
                }`}
              >
                <span className="font-mono text-[12px] font-bold uppercase w-5">{l.value}</span>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
