import { createContext } from "react";
import type { Locale } from "./types";

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  supportedLocales: Locale[];
  t: (key: string, vars?: Record<string, string | number>) => string;
  ready: boolean;
}

// Isolé du provider (qui importe les dictionnaires JSON) : modifier une traduction en dev
// ré-exécute I18nContext.tsx via le HMR de Vite, mais plus ce module — le contexte reste le
// même objet, sinon les pages chargées ensuite lisaient un contexte neuf sans provider.
export const I18nContext = createContext<I18nContextValue | null>(null);
