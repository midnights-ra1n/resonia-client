import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storage } from "../storage";
import { resolveTranslation } from "./resolvePath";
import { translations } from "./translations";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale, type Locale } from "./types";

const STORAGE_KEY = "resonia:locale";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  supportedLocales: Locale[];
  t: (key: string, vars?: Record<string, string | number>) => string;
  ready: boolean;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

function detectBrowserLocale(): Locale {
  const browserLang = navigator.language.split("-")[0];
  return isSupportedLocale(browserLang) ? browserLang : DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await storage.get<Locale>(STORAGE_KEY);
      setLocaleState(stored && isSupportedLocale(stored) ? stored : detectBrowserLocale());
      setReady(true);
    })();
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    storage.set(STORAGE_KEY, next);
  };

  const t = useMemo(() => {
    const currentDict = translations[locale];
    const fallbackDict = translations[DEFAULT_LOCALE];
    return (key: string, vars?: Record<string, string | number>) =>
      resolveTranslation(currentDict, fallbackDict, key, vars);
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, supportedLocales: SUPPORTED_LOCALES, t, ready }}>
      {children}
    </I18nContext.Provider>
  );
}
