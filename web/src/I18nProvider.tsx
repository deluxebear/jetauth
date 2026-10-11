import { useState, useCallback, type ReactNode } from "react";
import en from "./locales/en";
import zh from "./locales/zh";
import { I18nContext, type I18nContextType, type Locale } from "./i18n";

const locales: Record<Locale, Record<string, string>> = { en, zh };

const localeLabels: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};

function getInitialLocale(): Locale {
  const saved = localStorage.getItem("locale");
  if (saved === "en" || saved === "zh") return saved;
  const browser = navigator.language.toLowerCase();
  if (browser.startsWith("zh")) return "zh";
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("locale", l);
    document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let str = locales[locale]?.[key] ?? locales.en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        }
      }
      return str;
    },
    [locale]
  );

  const value: I18nContextType = {
    locale,
    setLocale,
    t,
    locales: Object.entries(localeLabels).map(([value, label]) => ({
      value: value as Locale,
      label,
    })),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
