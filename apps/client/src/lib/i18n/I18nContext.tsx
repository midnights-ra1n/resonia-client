import { useMemo, useState, type ReactNode } from "react";
import { I18nContext } from "./context";
import { storage } from "../storage";
import { resolveTranslation } from "./resolvePath";
import { translations } from "./translations";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale, type Locale } from "./types";

const STORAGE_KEY = "resonia:locale";

function detectBrowserLocale(): Locale {
  const browserLang = navigator.language.split("-")[0];
  return isSupportedLocale(browserLang) ? browserLang : DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Lecture synchrone : la bonne langue dès le premier rendu, sans passer par l'anglais par défaut.
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = storage.getSync<Locale>(STORAGE_KEY);
    return stored && isSupportedLocale(stored) ? stored : detectBrowserLocale();
  });
  const ready = true;

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
