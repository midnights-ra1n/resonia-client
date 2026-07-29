import en from "./locales/en.json";
import fr from "./locales/fr.json";
import type { Locale } from "./types";

// Add a new language: 1 JSON file + 1 line here
export const translations: Record<Locale, unknown> = {
  en,
  fr,
  //es, example for adding spanish
};
