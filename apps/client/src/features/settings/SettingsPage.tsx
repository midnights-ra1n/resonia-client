import { useEffect, useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import {
  checkAnimatedArtworkHealth,
  DEFAULT_ANIMATED_ARTWORK_BASE_URL,
} from "@resonia/api-client";
import { useTranslation, type Locale } from "../../lib/i18n";
import { useSettingsStore, GIGABYTE } from "../../stores/settingsStore";
import { getPlatform, isTauri } from "../../lib/platform";
import { cacheStore } from "../../lib/audio/cache/cacheStore";
import {
  currentCoverCacheSize,
  clearCoverCache,
  onCoverCacheSizeChange,
} from "../../lib/image/coverCache";
import { clearAnimatedCoverResolutionCache } from "../album/useAnimatedAlbumCover";

// Voir useAnimatedAlbumCover.ts : même raison (CORS/robustesse), même fallback web.
const platformFetch: typeof fetch = async (input, init) => {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(input as string, init);
  }
  return fetch(input, init);
};

/** Accepte http:// (y compris IP locale, ex. http://192.168.30.2:6767/) et https://, rejette tout
 *  le reste (schéma manquant, invalide, ou autre que http/https). */
function isValidAnimatedArtworkUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

type AnimatedArtworkHealth = "idle" | "checking" | "ok" | "error";

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
  const animatedArtworkBaseUrl = useSettingsStore(
    (s) => s.animatedArtworkBaseUrl,
  );
  const setAnimatedArtworkBaseUrl = useSettingsStore(
    (s) => s.setAnimatedArtworkBaseUrl,
  );
  const cacheMaxBytes = useSettingsStore((s) => s.cacheMaxBytes);
  const setCacheMaxBytes = useSettingsStore((s) => s.setCacheMaxBytes);
  const devModeEnabled = useSettingsStore((s) => s.devModeEnabled);
  const setDevModeEnabled = useSettingsStore((s) => s.setDevModeEnabled);

  const [lastfmInput, setLastfmInput] = useState(lastfmApiKey);
  const [animatedArtworkBaseUrlInput, setAnimatedArtworkBaseUrlInput] =
    useState(animatedArtworkBaseUrl);
  const [animatedArtworkUrlError, setAnimatedArtworkUrlError] = useState(false);
  const [animatedArtworkHealth, setAnimatedArtworkHealth] =
    useState<AnimatedArtworkHealth>("idle");
  const [forcingAnimatedArtworkRefresh, setForcingAnimatedArtworkRefresh] =
    useState(false);
  const isDesktop = getPlatform() === "desktop";

  const [audioCacheBytes, setAudioCacheBytes] = useState<number | null>(null);
  const [coverCacheBytes, setCoverCacheBytes] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  // Abonnement temps réel : cacheStore/coverCache notifient (throttled) à chaque téléchargement,
  // éviction ou purge, donc la taille affichée reste à jour sans polling. Les pochettes animées ne
  // sont plus mises en cache sur disque (voir useAnimatedAlbumCover.ts / AnimatedAlbumCoverVideo.tsx :
  // lues via un vrai lecteur HLS — natif ou hls.js — plutôt qu'un fichier téléchargé à plat), donc
  // rien à additionner ici pour elles.
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

  const cacheSize =
    audioCacheBytes === null || coverCacheBytes === null
      ? null
      : audioCacheBytes + coverCacheBytes;
  const cacheFillPercent =
    cacheSize === null || cacheMaxBytes === 0
      ? 0
      : Math.min(100, (cacheSize / cacheMaxBytes) * 100);
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
  useEffect(
    () => setAnimatedArtworkBaseUrlInput(animatedArtworkBaseUrl),
    [animatedArtworkBaseUrl],
  );

  // Teste l'instance effectivement utilisée (personnalisée si renseignée, sinon celle par
  // défaut) au montage et à chaque changement de réglage persisté — pas à chaque frappe.
  useEffect(() => {
    let cancelled = false;
    const urlToTest =
      animatedArtworkBaseUrl || DEFAULT_ANIMATED_ARTWORK_BASE_URL;

    (async () => {
      setAnimatedArtworkHealth("checking");
      const ok = await checkAnimatedArtworkHealth(urlToTest, platformFetch);
      if (!cancelled) setAnimatedArtworkHealth(ok ? "ok" : "error");
    })();

    return () => {
      cancelled = true;
    };
  }, [animatedArtworkBaseUrl]);

  const handleAnimatedArtworkBaseUrlBlur = () => {
    const trimmed = animatedArtworkBaseUrlInput.trim();
    if (trimmed === "") {
      setAnimatedArtworkUrlError(false);
      void setAnimatedArtworkBaseUrl("");
      return;
    }
    if (!isValidAnimatedArtworkUrl(trimmed)) {
      setAnimatedArtworkUrlError(true);
      return;
    }
    setAnimatedArtworkUrlError(false);
    void setAnimatedArtworkBaseUrl(trimmed);
  };

  // Sans ça, une pochette animée déjà résolue (URL de playlist HLS en cache) reste servie telle
  // quelle indéfiniment, même après un changement d'instance ou une correction côté API : ce
  // bouton vide le cache de résolution pour forcer une requête réseau neuve au prochain affichage
  // de chaque album.
  const handleForceRefreshAnimatedCovers = async () => {
    setForcingAnimatedArtworkRefresh(true);
    try {
      await clearAnimatedCoverResolutionCache();
    } finally {
      setForcingAnimatedArtworkRefresh(false);
    }
  };

  return (
    <div className="p-8 text-white">
      <h1 className="mb-6 text-2xl font-bold">{t("settings.title")}</h1>

      <section className="max-w-xl">
        <h2 className="text-lg font-semibold">{t("settings.general")}</h2>

        <div className="mt-6 flex flex-col gap-6">
          <div>
            <label
              htmlFor="language-select"
              className="block text-sm font-medium text-white"
            >
              {t("settings.language")}
            </label>
            <p className="mt-1 text-xs text-neutral-500">
              {t("settings.languageDescription")}
            </p>
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
        <p className="mt-1 text-sm text-neutral-400">
          {t("settings.integrationsDescription")}
        </p>

        <div className="mt-6 flex flex-col gap-6">
          <div>
            <label
              htmlFor="lastfm-api-key"
              className="block text-sm font-medium text-white"
            >
              {t("settings.lastfmApiKey")}
            </label>
            <p className="mt-1 text-xs text-neutral-500">
              {t("settings.lastfmApiKeyDescription")}
            </p>
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

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="animated-artwork-base-url"
                className="block text-sm font-medium text-white"
              >
                {t("settings.animatedArtworkBaseUrl")}
              </label>
              <span
                title={t(
                  animatedArtworkHealth === "ok"
                    ? "settings.animatedArtworkStatusOk"
                    : animatedArtworkHealth === "error"
                      ? "settings.animatedArtworkStatusError"
                      : "settings.animatedArtworkStatusChecking",
                )}
              >
                {animatedArtworkHealth === "checking" && (
                  <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
                )}
                {animatedArtworkHealth === "ok" && (
                  <Check className="h-4 w-4 text-emerald-500" />
                )}
                {animatedArtworkHealth === "error" && (
                  <X className="h-4 w-4 text-red-500" />
                )}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {t("settings.animatedArtworkBaseUrlDescription")}
            </p>
            <input
              id="animated-artwork-base-url"
              type="text"
              inputMode="url"
              value={animatedArtworkBaseUrlInput}
              onChange={(e) => {
                setAnimatedArtworkBaseUrlInput(e.target.value);
                setAnimatedArtworkUrlError(false);
              }}
              onBlur={handleAnimatedArtworkBaseUrlBlur}
              placeholder={t("settings.animatedArtworkBaseUrlPlaceholder")}
              aria-invalid={animatedArtworkUrlError}
              className="mt-2 w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all aria-[invalid=true]:border-red-500"
            />
            {animatedArtworkUrlError && (
              <p className="mt-1 text-xs text-red-400">
                {t("settings.animatedArtworkBaseUrlInvalid")}
              </p>
            )}
            <button
              type="button"
              onClick={handleForceRefreshAnimatedCovers}
              disabled={forcingAnimatedArtworkRefresh}
              className="mt-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-all hover:border-emerald-500 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {forcingAnimatedArtworkRefresh
                ? t("settings.animatedArtworkForceRefreshing")
                : t("settings.animatedArtworkForceRefresh")}
            </button>
            <p className="mt-1 text-xs text-neutral-500">
              {t("settings.animatedArtworkForceRefreshDescription")}
            </p>
          </div>
        </div>
      </section>

      {isDesktop && (
        <section className="mt-10 max-w-xl">
          <h2 className="text-lg font-semibold">{t("settings.cache")}</h2>
          <p className="mt-1 text-sm text-neutral-400">
            {t("settings.cacheDescription")}
          </p>

          <div className="mt-6 flex flex-col gap-6">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-white">
                  {t("settings.cacheSize")}
                </span>
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
              <label
                htmlFor="cache-limit-select"
                className="block text-sm font-medium text-white"
              >
                {t("settings.cacheLimit")}
              </label>
              <p className="mt-1 text-xs text-neutral-500">
                {t("settings.cacheLimitDescription")}
              </p>
              <select
                id="cache-limit-select"
                value={cacheMaxBytes / GIGABYTE}
                onChange={(e) =>
                  setCacheMaxBytes(Number(e.target.value) * GIGABYTE)
                }
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
                {clearing
                  ? t("settings.cacheClearing")
                  : t("settings.cacheClear")}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="mt-10 max-w-xl">
        <h2 className="text-lg font-semibold">{t("settings.developer")}</h2>
        <p className="mt-1 text-sm text-neutral-400">
          {t("settings.developerDescription")}
        </p>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => setDevModeEnabled(!devModeEnabled)}
            className="flex w-full items-center justify-between gap-2"
          >
            <span>
              <span className="block text-sm font-medium text-white">
                {t("settings.developerMode")}
              </span>
              <span className="mt-1 block text-xs text-neutral-500">
                {t("settings.developerModeDescription")}
              </span>
            </span>
            <span
              className={`relative inline-block shrink-0 w-9 h-5 rounded-full transition-colors ${devModeEnabled ? "bg-emerald-500" : "bg-neutral-700"
                }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${devModeEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
              />
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
