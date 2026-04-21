import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getResolvedTheme, type AuthLookup } from "./api/getResolvedTheme";
import type { ResolvedTheme } from "./api/types";

const ThemeContext = createContext<ResolvedTheme | null>(null);

export function useAuthTheme(): ResolvedTheme | null {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  lookup: AuthLookup;
  children: ReactNode;
}

/**
 * Loads the resolved theme from /api/get-resolved-theme and injects its
 * CSS-variable payload into a <style data-auth-theme> tag on the document
 * head. Children receive the theme via the useAuthTheme() hook.
 *
 * Fetch failures are logged and tolerated — children fall back to Tailwind
 * defaults so the auth surface stays usable even if the theme endpoint is
 * down.
 */
export function ThemeProvider({ lookup, children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<ResolvedTheme | null>(null);
  // Serialize the lookup for the effect dependency array.
  const key = lookup.kind === "app" ? `app:${lookup.appId}` : `org:${lookup.orgName}`;

  useEffect(() => {
    let cancelled = false;
    getResolvedTheme(lookup)
      .then((payload) => {
        if (cancelled) return;
        setTheme(payload.theme);
        let tag = document.querySelector<HTMLStyleElement>("style[data-auth-theme]");
        if (!tag) {
          tag = document.createElement("style");
          tag.setAttribute("data-auth-theme", "");
          document.head.appendChild(tag);
        }
        tag.textContent = payload.css;
      })
      .catch((err) => {
        console.error("[ThemeProvider] failed to load theme:", err);
        // Leave theme as null — components fall back to tailwind defaults.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
