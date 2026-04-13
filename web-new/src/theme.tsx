import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { deriveThemeVars, type ThemeVars } from "./lib/theme-utils";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggle: () => void;
  applyOrgTheme: (themeData: { themeType: string; colorPrimary: string; borderRadius: number; isCompact: boolean } | null) => void;
  clearOrgTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>(null!);

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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const clearOrgTheme = useCallback(() => {
    const root = document.documentElement;
    for (const key of THEME_VAR_KEYS) {
      root.style.removeProperty(key);
    }
    setTheme(getInitialTheme());
  }, []);

  const applyOrgTheme = useCallback(
    (themeData: { themeType: string; colorPrimary: string; borderRadius: number; isCompact: boolean } | null) => {
      if (!themeData) {
        clearOrgTheme();
        return;
      }

      const resolvedTheme = (themeData.themeType === "dark" ? "dark" : "light") as Theme;
      setTheme(resolvedTheme);

      const vars = deriveThemeVars(themeData.colorPrimary, themeData.themeType, themeData.borderRadius);
      const root = document.documentElement;
      for (const key of THEME_VAR_KEYS) {
        root.style.setProperty(key, vars[key]);
      }
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
