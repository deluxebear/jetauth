import { createContext, useContext } from "react";

export type Locale = "en" | "zh";

export interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  locales: { value: Locale; label: string }[];
}

export const I18nContext = createContext<I18nContextType>(null!);

export function useTranslation() {
  return useContext(I18nContext);
}
