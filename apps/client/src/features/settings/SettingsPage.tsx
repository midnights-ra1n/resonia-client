import { useEffect, useState } from "react";
import { useTranslation, type Locale } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settingsStore";

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

export function SettingsPage() {
  const { t, locale, setLocale, supportedLocales } = useTranslation();
  const lastfmApiKey = useSettingsStore((s) => s.lastfmApiKey);
  const setLastfmApiKey = useSettingsStore((s) => s.setLastfmApiKey);

  const [lastfmInput, setLastfmInput] = useState(lastfmApiKey);

  // Le hydrate() du store est asynchrone (peut résoudre après le montage de cette page) :
  // on resynchronise le champ une fois la clé chargée depuis le stockage.
  useEffect(() => setLastfmInput(lastfmApiKey), [lastfmApiKey]);

  return (
    <div className="p-8 text-white">
      <h1 className="mb-6 text-2xl font-bold">{t("settings.title")}</h1>

      <section className="max-w-xl">
        <h2 className="text-lg font-semibold">{t("settings.general")}</h2>

        <div className="mt-6 flex flex-col gap-6">
          <div>
            <label htmlFor="language-select" className="block text-sm font-medium text-white">
              {t("settings.language")}
            </label>
            <p className="mt-1 text-xs text-neutral-500">{t("settings.languageDescription")}</p>
            <select
              id="language-select"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="mt-2 w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            >
              {supportedLocales.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABELS[l]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="mt-10 max-w-xl">
        <h2 className="text-lg font-semibold">{t("settings.integrations")}</h2>
        <p className="mt-1 text-sm text-neutral-400">{t("settings.integrationsDescription")}</p>

        <div className="mt-6 flex flex-col gap-6">
          <div>
            <label htmlFor="lastfm-api-key" className="block text-sm font-medium text-white">
              {t("settings.lastfmApiKey")}
            </label>
            <p className="mt-1 text-xs text-neutral-500">{t("settings.lastfmApiKeyDescription")}</p>
            <input
              id="lastfm-api-key"
              type="password"
              value={lastfmInput}
              onChange={(e) => setLastfmInput(e.target.value)}
              onBlur={() => setLastfmApiKey(lastfmInput.trim())}
              placeholder={t("settings.apiKeyPlaceholder")}
              className="mt-2 w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
