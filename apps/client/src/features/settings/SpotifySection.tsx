import { useEffect, useState } from "react";
import { Check, CircleNotch, X } from "../../components/icons";
import { useTranslation } from "../../lib/i18n";
import {
  clearSpotifyData,
  isSpotifyModeAvailable,
  testSpotifyConnection,
  type SpotifyTestResult,
} from "../../lib/spotify/spotifyService";
import { useSettingsStore, type SpotifyMetadataMode } from "../../stores/settingsStore";

const MODES: SpotifyMetadataMode[] = ["off", "official", "unofficial"];

const MODE_LABEL_KEYS: Record<SpotifyMetadataMode, string> = {
  off: "settings.spotifyModeOff",
  official: "settings.spotifyModeOfficial",
  unofficial: "settings.spotifyModeUnofficial",
};

const MODE_DESCRIPTION_KEYS: Record<SpotifyMetadataMode, string> = {
  off: "settings.spotifyModeOffDescription",
  official: "settings.spotifyModeOfficialDescription",
  unofficial: "settings.spotifyModeUnofficialDescription",
};

const INPUT_CLASS =
  "mt-2 w-full rounded-full bg-neutral-900 border border-neutral-700 px-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-[color,background-color,border-color,box-shadow]";

/** Métadonnées Spotify de la page artiste — désactivées par défaut, voir lib/spotify/spotifyService. */
export function SpotifySection() {
  const { t } = useTranslation();
  const mode = useSettingsStore((s) => s.spotifyMetadataMode);
  const setMode = useSettingsStore((s) => s.setSpotifyMetadataMode);
  const clientId = useSettingsStore((s) => s.spotifyClientId);
  const clientSecret = useSettingsStore((s) => s.spotifyClientSecret);
  const setCredentials = useSettingsStore((s) => s.setSpotifyCredentials);

  const [clientIdInput, setClientIdInput] = useState(clientId);
  const [clientSecretInput, setClientSecretInput] = useState(clientSecret);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SpotifyTestResult | null>(null);

  // Le secret est déchiffré après l'hydratation du store (voir settingsStore) : resynchronisation.
  useEffect(() => setClientIdInput(clientId), [clientId]);
  useEffect(() => setClientSecretInput(clientSecret), [clientSecret]);

  const handleModeChange = async (next: SpotifyMetadataMode) => {
    if (next === mode) return;
    setTestResult(null);
    await clearSpotifyData();
    await setMode(next);
  };

  const handleCredentialsBlur = async () => {
    if (clientIdInput.trim() === clientId && clientSecretInput.trim() === clientSecret) return;
    setTestResult(null);
    await clearSpotifyData();
    await setCredentials(clientIdInput, clientSecretInput);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testSpotifyConnection(mode));
    } finally {
      setTesting(false);
    }
  };

  const canTest = mode !== "off" && (mode !== "official" || (clientId !== "" && clientSecret !== ""));

  return (
    <div>
      <span className="block text-sm font-medium text-white">{t("settings.spotify")}</span>
      <p className="mt-1 text-xs text-neutral-500">{t("settings.spotifyDescription")}</p>

      <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label={t("settings.spotify")}>
        {MODES.map((option) => {
          const available = isSpotifyModeAvailable(option);
          const selected = mode === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!available}
              onClick={() => void handleModeChange(option)}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-[color,background-color,border-color] disabled:cursor-not-allowed disabled:opacity-50 ${
                selected ? "border-accent bg-neutral-900" : "border-neutral-800 hover:border-neutral-600"
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  selected ? "border-accent" : "border-neutral-500"
                }`}
              >
                {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
              </span>
              <span>
                <span className="block text-sm font-medium text-white">{t(MODE_LABEL_KEYS[option])}</span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  {available ? t(MODE_DESCRIPTION_KEYS[option]) : t("settings.spotifyDesktopOnly")}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {mode === "official" && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-xs text-neutral-500">
            {t("settings.spotifyCredentialsHelp")}{" "}
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              developer.spotify.com/dashboard
            </a>
          </p>
          <div>
            <label htmlFor="spotify-client-id" className="block text-sm font-medium text-white">
              {t("settings.spotifyClientId")}
            </label>
            <input
              id="spotify-client-id"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={clientIdInput}
              onChange={(e) => setClientIdInput(e.target.value)}
              onBlur={() => void handleCredentialsBlur()}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="spotify-client-secret" className="block text-sm font-medium text-white">
              {t("settings.spotifyClientSecret")}
            </label>
            <input
              id="spotify-client-secret"
              type="password"
              autoComplete="off"
              value={clientSecretInput}
              onChange={(e) => setClientSecretInput(e.target.value)}
              onBlur={() => void handleCredentialsBlur()}
              className={INPUT_CLASS}
            />
          </div>
        </div>
      )}

      {mode === "unofficial" && (
        <p className="mt-3 text-xs text-amber-400">{t("settings.spotifyUnofficialWarning")}</p>
      )}

      {mode !== "off" && (
        <>
          <p className="mt-3 text-xs text-neutral-500">{t("settings.spotifyPrivacy")}</p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={!canTest || testing}
              className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition-[color,background-color,border-color,box-shadow] hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? t("settings.spotifyTesting") : t("settings.spotifyTest")}
            </button>
            {testing && <CircleNotch className="h-4 w-4 animate-spin text-neutral-500" />}
            {testResult?.ok && (
              <span className="flex items-center gap-1 text-xs text-accent">
                <Check className="h-4 w-4" />
                {t("settings.spotifyTestOk", { artist: testResult.artistName })}
              </span>
            )}
            {testResult && !testResult.ok && (
              <span className="flex min-w-0 items-center gap-1 text-xs text-red-400" title={testResult.message}>
                <X className="h-4 w-4 shrink-0" />
                <span className="truncate">{t("settings.spotifyTestError", { error: testResult.message })}</span>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
