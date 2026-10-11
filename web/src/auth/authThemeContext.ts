import { createContext, useContext } from "react";
import type { ResolvedTheme } from "./api/types";

export const AuthThemeContext = createContext<ResolvedTheme | null>(null);

export function useAuthTheme(): ResolvedTheme | null {
  return useContext(AuthThemeContext);
}
