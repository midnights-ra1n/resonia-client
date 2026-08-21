import { useEffect, useState } from "react";
import { useTranslation, type Locale } from "../../lib/i18n";
import { useSettingsStore, GIGABYTE } from "../../stores/settingsStore";
import { getPlatform } from "../../lib/platform";
import { cacheStore } from "../../lib/audio/cache/cacheStore";
import { currentCoverCacheSize, clearCoverCache, onCoverCacheSizeChange } from "../../lib/image/coverCache";

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

const CACHE_LIMIT_OPTIONS_GB = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16];

function formatBytes(bytes: number, unitGb: string, unitMb: string): string {
  const gb = bytes / GIGABYTE;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} ${unitGb}`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} ${unitMb}`;
}

function fillBarColor(percent: number): string {
  if (percent >= 95) return "bg-red-500";
  if (percent >= 80) return "bg-amber-500";
  return "bg-emerald-500";
}

export function SettingsPage() {
  const { t, locale, setLocale, supportedLocales } = useTranslation();
  const lastfmApiKey = useSettingsStore((s) => s.lastfmApiKey);
  const setLastfmApiKey = useSettingsStore((s) => s.setLastfmApiKey);
  const cacheMaxBytes = useSettingsStore((s) => s.cacheMaxBytes);
  const setCacheMaxBytes = useSettingsStore((s) => s.setCacheMaxBytes);

  const [lastfmInput, setLastfmInput] = useState(lastfmApiKey);
  const isDesktop = getPlatform() === "desktop";

  const [audioCacheBytes, setAudioCacheBytes] = useState<number | null>(null);
  const [coverCacheBytes, setCoverCacheBytes] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  // Abonnement temps réel : cacheStore/coverCache notifient (throttled) à chaque
  // téléchargement, éviction ou purge, donc la taille affichée reste à jour sans polling.
  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    const syncAudio = (bytes: number) => {
      if (!cancelled) setAudioCacheBytes(bytes);
    };
    const syncCover = (bytes: number) => {
      if (!cancelled) setCoverCacheBytes(bytes);
    };
    cacheStore.currentCacheSize().then(syncAudio);
    currentCoverCacheSize().then(syncCover);
    const unsubAudio = cacheStore.onSizeChange(syncAudio);
    const unsubCover = onCoverCacheSizeChange(syncCover);
    return () => {
      cancelled = true;
      unsubAudio();
      unsubCover();
    };
  }, [isDesktop]);

  const cacheSize = audioCacheBytes === null || coverCacheBytes === null ? null : audioCacheBytes + coverCacheBytes;
  const cacheFillPercent =
    cacheSize === null || cacheMaxBytes === 0 ? 0 : Math.min(100, (cacheSize / cacheMaxBytes) * 100);
  const unitGb = t("settings.unitGb");
  const unitMb = t("settings.unitMb");

  const handleClearCache = async () => {
    setClearing(true);
    try {
      await Promise.all([cacheStore.clearAll(), clearCoverCache()]);
    } finally {
      setClearing(false);
    }
  };

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

      {isDesktop && (
        <section className="mt-10 max-w-xl">
          <h2 className="text-lg font-semibold">{t("settings.cache")}</h2>
          <p className="mt-1 text-sm text-neutral-400">{t("settings.cacheDescription")}</p>

          <div className="mt-6 flex flex-col gap-6">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-white">{t("settings.cacheSize")}</span>
                <span className="text-xs text-neutral-500">
                  {cacheSize === null
                    ? t("common.loading")
                    : `${formatBytes(cacheSize, unitGb, unitMb)} / ${formatBytes(cacheMaxBytes, unitGb, unitMb)}`}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={Math.round(cacheFillPercent)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-800"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${fillBarColor(cacheFillPercent)}`}
                  style={{ width: `${cacheFillPercent}%` }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="cache-limit-select" className="block text-sm font-medium text-white">
                {t("settings.cacheLimit")}
              </label>
              <p className="mt-1 text-xs text-neutral-500">{t("settings.cacheLimitDescription")}</p>
              <select
                id="cache-limit-select"
                value={cacheMaxBytes / GIGABYTE}
                onChange={(e) => setCacheMaxBytes(Number(e.target.value) * GIGABYTE)}
                className="mt-2 w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              >
                {CACHE_LIMIT_OPTIONS_GB.map((gb) => (
                  <option key={gb} value={gb}>
                    {gb} {unitGb}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <button
                type="button"
                onClick={handleClearCache}
                disabled={clearing}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-all hover:border-red-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {clearing ? t("settings.cacheClearing") : t("settings.cacheClear")}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
