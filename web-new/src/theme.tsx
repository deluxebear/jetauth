import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { deriveThemeVars, type ThemeVars } from "./lib/theme-utils";

type Theme = "dark" | "light";

interface OrgThemeData {
  themeType: string;
  colorPrimary: string;
  borderRadius: number;
  isCompact: boolean;
}

interface ThemeContextType {
  theme: Theme;
  toggle: () => void;
  applyOrgTheme: (themeData: OrgThemeData | null) => void;
  clearOrgTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>(null!);

function getSystemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialTheme(): Theme {
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") return saved;
  return "dark";
}

const THEME_VAR_KEYS: (keyof ThemeVars)[] = [
  "--accent",
  "--accent-hover",
  "--accent-subtle",
  "--shadow-glow",
  "--gradient-from",
  "--gradient-to",
  "--gradient-blob",
  "--radius",
];

function applyVars(colorPrimary: string, resolvedTheme: Theme, borderRadius: number) {
  const vars = deriveThemeVars(colorPrimary, resolvedTheme, borderRadius);
  const root = document.documentElement;
  for (const key of THEME_VAR_KEYS) {
    root.style.setProperty(key, vars[key]);
  }
}

function removeVars() {
  const root = document.documentElement;
  for (const key of THEME_VAR_KEYS) {
    root.style.removeProperty(key);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const orgThemeRef = useRef<OrgThemeData | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      // Re-derive org theme CSS variables for the new mode
      if (orgThemeRef.current) {
        applyVars(orgThemeRef.current.colorPrimary, next, orgThemeRef.current.borderRadius);
      }
      return next;
    });
  }, []);

  const clearOrgTheme = useCallback(() => {
    orgThemeRef.current = null;
    removeVars();
    setTheme(getInitialTheme());
  }, []);

  const applyOrgTheme = useCallback(
    (themeData: OrgThemeData | null) => {
      if (!themeData) {
        clearOrgTheme();
        return;
      }

      orgThemeRef.current = themeData;

      const resolvedTheme: Theme = themeData.themeType === "system"
        ? getSystemTheme()
        : themeData.themeType === "dark" ? "dark" : "light";
      setTheme(resolvedTheme);
      applyVars(themeData.colorPrimary, resolvedTheme, themeData.borderRadius);
    },
    [clearOrgTheme]
  );

  return (
    <ThemeContext.Provider value={{ theme, toggle, applyOrgTheme, clearOrgTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
