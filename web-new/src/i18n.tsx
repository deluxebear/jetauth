import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import en, { type TranslationKeys } from "./locales/en";
import zh from "./locales/zh";

type Locale = "en" | "zh";

const locales: Record<Locale, Record<string, string>> = { en, zh };

const localeLabels: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKeys) => string;
  locales: { value: Locale; label: string }[];
}

const I18nContext = createContext<I18nContextType>(null!);

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
    (key: TranslationKeys) => locales[locale]?.[key] ?? locales.en[key] ?? key,
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

export function useTranslation() {
  return useContext(I18nContext);
}
