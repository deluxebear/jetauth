import { createContext, useContext } from "react";

export type Theme = "dark" | "light";

export interface OrgThemeData {
  themeType: string;
  colorPrimary: string;
  borderRadius: number;
  isCompact: boolean;
}

export interface ThemeContextType {
  theme: Theme;
  toggle: () => void;
  applyOrgTheme: (themeData: OrgThemeData | null) => void;
  clearOrgTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType>(null!);

export function useTheme() {
  return useContext(ThemeContext);
}
