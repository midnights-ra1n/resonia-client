import { create } from "zustand";
import {
  DEFAULT_QUALITY_ID,
  getAvailableQualities,
  getQualityById,
} from "../lib/audio/qualityOptions";
import { currentReleaseChannel, resolveBetaUpdatesEnabled, type BetaUpdatesChoice } from "../lib/app/appVersion";
import { getPlatform } from "../lib/platform";
import { storage } from "../lib/storage";
import { cacheStore } from "../lib/audio/cache/cacheStore";
import { setCoverCacheMaxBytes } from "../lib/image/coverCache";
import { setAudioDebugEnabled } from "../lib/audio/debug/audioDebugLogger";
import { decryptPassword, encryptPassword, type EncryptedPassword } from "../lib/security/passwordVault";

export type PlaylistSortBy = "default" | "title" | "artist" | "album";
export type PlaylistSortDirection = "asc" | "desc";
/** Source des métadonnées Spotify de la page artiste. "off" (défaut) : aucune requête ne part
 *  vers Spotify. "official" : API Web avec le Client ID/Secret de l'utilisateur. "unofficial" :
 *  API privée du lecteur web (approche SpotAPI), bureau uniquement. */
export type SpotifyMetadataMode = "off" | "official" | "unofficial";

interface SettingsState {
  audioQualityId: string;
  lastfmApiKey: string;
  spotifyMetadataMode: SpotifyMetadataMode;
  spotifyClientId: string;
  spotifyClientSecret: string;
  animatedArtworkBaseUrl: string;
  cacheMaxBytes: number;
  playlistSortBy: PlaylistSortBy;
  playlistSortDirection: PlaylistSortDirection;
  devModeEnabled: boolean;
  /** Forme d'onde dans la barre de lecture (voir lib/audio/waveform). */
  showWaveform: boolean;
  checkUpdatesOnLaunch: boolean;
  betaUpdatesEnabled: boolean;
  /** Version que l'utilisateur a explicitement choisi de reporter ("Plus tard" dans la pop-up
   *  de mise à jour, voir UpdateNotifier.tsx) — évite de la re-proposer à chaque lancement tant
   *  qu'aucune version plus récente n'est sortie. */
  dismissedUpdateVersion: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAudioQuality: (id: string) => Promise<void>;
  setLastfmApiKey: (key: string) => Promise<void>;
  setSpotifyMetadataMode: (mode: SpotifyMetadataMode) => Promise<void>;
  setSpotifyCredentials: (clientId: string, clientSecret: string) => Promise<void>;
  setAnimatedArtworkBaseUrl: (url: string) => Promise<void>;
  setCacheMaxBytes: (bytes: number) => Promise<void>;
  setPlaylistSort: (
    by: PlaylistSortBy,
    direction: PlaylistSortDirection,
  ) => Promise<void>;
  setDevModeEnabled: (enabled: boolean) => Promise<void>;
  setShowWaveform: (enabled: boolean) => Promise<void>;
  setCheckUpdatesOnLaunch: (enabled: boolean) => Promise<void>;
  setBetaUpdatesEnabled: (enabled: boolean) => Promise<void>;
  setDismissedUpdateVersion: (version: string | null) => Promise<void>;
}

const STORAGE_KEY = "resonia:settings:audioQuality";
const LASTFM_API_KEY_STORAGE_KEY = "resonia:settings:lastfmApiKey";
const SPOTIFY_MODE_STORAGE_KEY = "resonia:settings:spotifyMetadataMode";
const SPOTIFY_CLIENT_ID_STORAGE_KEY = "resonia:settings:spotifyClientId";
// Chiffré (AES-GCM, voir passwordVault) : jamais de secret en clair dans le stockage.
const SPOTIFY_CLIENT_SECRET_STORAGE_KEY = "resonia:settings:spotifyClientSecret";
const ANIMATED_ARTWORK_BASE_URL_STORAGE_KEY =
  "resonia:settings:animatedArtworkBaseUrl";
const CACHE_MAX_BYTES_STORAGE_KEY = "resonia:settings:cacheMaxBytes";
const PLAYLIST_SORT_BY_STORAGE_KEY = "resonia:settings:playlistSortBy";
const PLAYLIST_SORT_DIRECTION_STORAGE_KEY =
  "resonia:settings:playlistSortDirection";
const DEV_MODE_ENABLED_STORAGE_KEY = "resonia:settings:devModeEnabled";
const SHOW_WAVEFORM_STORAGE_KEY = "resonia:settings:showWaveform";
const CHECK_UPDATES_ON_LAUNCH_STORAGE_KEY =
  "resonia:settings:checkUpdatesOnLaunch";
// Ancien format (booléen seul, sans le canal sur lequel le choix a été fait) : repris une fois,
// comme un choix fait sur le canal actuel, puis remplacé par BETA_UPDATES_CHOICE_STORAGE_KEY.
const LEGACY_BETA_UPDATES_ENABLED_STORAGE_KEY = "resonia:settings:betaUpdatesEnabled";
const BETA_UPDATES_CHOICE_STORAGE_KEY = "resonia:settings:betaUpdatesChoice";

/** Choix bêta enregistré, en migrant l'ancien booléen (voir LEGACY_BETA_UPDATES_ENABLED_STORAGE_KEY). */
function readBetaUpdatesChoice(stored: BetaUpdatesChoice | null): BetaUpdatesChoice | null {
  if (stored) return stored;
  const legacy = storage.getSync<boolean>(LEGACY_BETA_UPDATES_ENABLED_STORAGE_KEY);
  if (legacy === null) return null;
  const migrated: BetaUpdatesChoice = { enabled: legacy, channel: currentReleaseChannel() };
  void storage.set(BETA_UPDATES_CHOICE_STORAGE_KEY, migrated).then(() => storage.remove(LEGACY_BETA_UPDATES_ENABLED_STORAGE_KEY));
  return migrated;
}
const DISMISSED_UPDATE_VERSION_STORAGE_KEY = "resonia:settings:dismissedUpdateVersion";

export const GIGABYTE = 1024 * 1024 * 1024;
export const DEFAULT_CACHE_MAX_BYTES = 2 * GIGABYTE;

// Cache unique et partagé entre musiques et pochettes (une seule limite réglable) : les pochettes
// se réservent une part fixe du budget total, le reste va à l'audio qui domine largement le
// volume de données. Les pochettes animées ne sont pas mises en cache sur disque (voir
// useAnimatedAlbumCover.ts / AnimatedAlbumCoverVideo.tsx : lues via un vrai lecteur HLS plutôt
// qu'un fichier téléchargé à plat), donc pas de réserve dédiée pour elles.
const COVER_CACHE_RESERVE_BYTES = 100 * 1024 * 1024;

function splitCacheBudget(totalBytes: number): {
  audioBytes: number;
  coverBytes: number;
} {
  const coverBytes = Math.min(
    COVER_CACHE_RESERVE_BYTES,
    Math.floor(totalBytes / 2),
  );
  return { audioBytes: totalBytes - coverBytes, coverBytes };
}

function applyCacheMaxBytes(totalBytes: number) {
  const { audioBytes, coverBytes } = splitCacheBudget(totalBytes);
  cacheStore.setMaxBytes(audioBytes);
  setCoverCacheMaxBytes(coverBytes);
}

function isSpotifyMode(value: unknown): value is SpotifyMetadataMode {
  return value === "off" || value === "official" || value === "unofficial";
}

export const useSettingsStore = create<SettingsState>((set) => ({
  audioQualityId: DEFAULT_QUALITY_ID,
  lastfmApiKey: "",
  spotifyMetadataMode: "off",
  spotifyClientId: "",
  spotifyClientSecret: "",
  animatedArtworkBaseUrl: "",
  cacheMaxBytes: DEFAULT_CACHE_MAX_BYTES,
  playlistSortBy: "default",
  playlistSortDirection: "asc",
  devModeEnabled: false,
  showWaveform: false,
  checkUpdatesOnLaunch: true,
  betaUpdatesEnabled: false,
  dismissedUpdateVersion: null,
  hydrated: false,

  // Lecture SYNCHRONE, appelée dans main.tsx avant le premier rendu (voir serversStore.hydrate).
  hydrate: async () => {
    const [
      stored,
      lastfmApiKey,
      animatedArtworkBaseUrl,
      cacheMaxBytes,
      playlistSortBy,
      playlistSortDirection,
      devModeEnabled,
      checkUpdatesOnLaunch,
      betaUpdatesChoice,
      dismissedUpdateVersion,
      spotifyMode,
      spotifyClientId,
      spotifyClientSecret,
      showWaveform,
    ] = [
      storage.getSync<string>(STORAGE_KEY),
      storage.getSync<string>(LASTFM_API_KEY_STORAGE_KEY),
      storage.getSync<string>(ANIMATED_ARTWORK_BASE_URL_STORAGE_KEY),
      storage.getSync<number>(CACHE_MAX_BYTES_STORAGE_KEY),
      storage.getSync<PlaylistSortBy>(PLAYLIST_SORT_BY_STORAGE_KEY),
      storage.getSync<PlaylistSortDirection>(PLAYLIST_SORT_DIRECTION_STORAGE_KEY),
      storage.getSync<boolean>(DEV_MODE_ENABLED_STORAGE_KEY),
      storage.getSync<boolean>(CHECK_UPDATES_ON_LAUNCH_STORAGE_KEY),
      storage.getSync<BetaUpdatesChoice>(BETA_UPDATES_CHOICE_STORAGE_KEY),
      storage.getSync<string>(DISMISSED_UPDATE_VERSION_STORAGE_KEY),
      storage.getSync<string>(SPOTIFY_MODE_STORAGE_KEY),
      storage.getSync<string>(SPOTIFY_CLIENT_ID_STORAGE_KEY),
      storage.getSync<EncryptedPassword>(SPOTIFY_CLIENT_SECRET_STORAGE_KEY),
      storage.getSync<boolean>(SHOW_WAVEFORM_STORAGE_KEY),
    ] as const;
    const platform = getPlatform();
    const available = getAvailableQualities(platform);
    // If the stored quality is no longer available on this platform
    // (e.g., desktop profile -> opened one day on the web), we fall back to the default.
    const isValid = stored && available.some((q) => q.id === stored);
    const resolvedCacheMaxBytes = cacheMaxBytes ?? DEFAULT_CACHE_MAX_BYTES;

    applyCacheMaxBytes(resolvedCacheMaxBytes);
    setAudioDebugEnabled(devModeEnabled ?? false);

    set({
      audioQualityId: isValid ? stored! : DEFAULT_QUALITY_ID,
      lastfmApiKey: lastfmApiKey ?? "",
      animatedArtworkBaseUrl: animatedArtworkBaseUrl ?? "",
      cacheMaxBytes: resolvedCacheMaxBytes,
      playlistSortBy: playlistSortBy ?? "default",
      playlistSortDirection: playlistSortDirection ?? "asc",
      devModeEnabled: devModeEnabled ?? false,
      showWaveform: showWaveform ?? false,
      checkUpdatesOnLaunch: checkUpdatesOnLaunch ?? true,
      betaUpdatesEnabled: resolveBetaUpdatesEnabled(readBetaUpdatesChoice(betaUpdatesChoice), currentReleaseChannel()),
      dismissedUpdateVersion: dismissedUpdateVersion ?? null,
      spotifyMetadataMode: isSpotifyMode(spotifyMode) ? spotifyMode : "off",
      spotifyClientId: spotifyClientId ?? "",
      hydrated: true,
    });

    // Déchiffrement asynchrone, après le premier rendu : seule la page artiste en a besoin.
    if (spotifyClientSecret) {
      decryptPassword(spotifyClientSecret)
        .then((secret) => set({ spotifyClientSecret: secret }))
        .catch((err) => console.warn("[settings] Secret Spotify illisible", err));
    }
  },

  setAudioQuality: async (id) => {
    if (!getQualityById(id)) return;
    await storage.set(STORAGE_KEY, id);
    set({ audioQualityId: id });
  },

  setLastfmApiKey: async (key) => {
    await storage.set(LASTFM_API_KEY_STORAGE_KEY, key);
    set({ lastfmApiKey: key });
  },

  setSpotifyMetadataMode: async (mode) => {
    await storage.set(SPOTIFY_MODE_STORAGE_KEY, mode);
    set({ spotifyMetadataMode: mode });
  },

  setSpotifyCredentials: async (clientId, clientSecret) => {
    const id = clientId.trim();
    const secret = clientSecret.trim();
    await storage.set(SPOTIFY_CLIENT_ID_STORAGE_KEY, id);
    if (secret) await storage.set(SPOTIFY_CLIENT_SECRET_STORAGE_KEY, await encryptPassword(secret));
    else await storage.remove(SPOTIFY_CLIENT_SECRET_STORAGE_KEY);
    set({ spotifyClientId: id, spotifyClientSecret: secret });
  },

  setAnimatedArtworkBaseUrl: async (url) => {
    // Vide == retour à l'instance par défaut (DEFAULT_ANIMATED_ARTWORK_BASE_URL), pas d'URL invalide stockée.
    const trimmed = url.trim().replace(/\/+$/, "");
    await storage.set(ANIMATED_ARTWORK_BASE_URL_STORAGE_KEY, trimmed);
    set({ animatedArtworkBaseUrl: trimmed });
  },

  setCacheMaxBytes: async (bytes) => {
    await storage.set(CACHE_MAX_BYTES_STORAGE_KEY, bytes);
    applyCacheMaxBytes(bytes);
    set({ cacheMaxBytes: bytes });
  },

  setPlaylistSort: async (by, direction) => {
    await Promise.all([
      storage.set(PLAYLIST_SORT_BY_STORAGE_KEY, by),
      storage.set(PLAYLIST_SORT_DIRECTION_STORAGE_KEY, direction),
    ]);
    set({ playlistSortBy: by, playlistSortDirection: direction });
  },

  setDevModeEnabled: async (enabled) => {
    await storage.set(DEV_MODE_ENABLED_STORAGE_KEY, enabled);
    setAudioDebugEnabled(enabled);
    set({ devModeEnabled: enabled });
  },

  setShowWaveform: async (enabled) => {
    await storage.set(SHOW_WAVEFORM_STORAGE_KEY, enabled);
    set({ showWaveform: enabled });
  },

  setCheckUpdatesOnLaunch: async (enabled) => {
    await storage.set(CHECK_UPDATES_ON_LAUNCH_STORAGE_KEY, enabled);
    set({ checkUpdatesOnLaunch: enabled });
  },

  setBetaUpdatesEnabled: async (enabled) => {
    const choice: BetaUpdatesChoice = { enabled, channel: currentReleaseChannel() };
    await storage.set(BETA_UPDATES_CHOICE_STORAGE_KEY, choice);
    set({ betaUpdatesEnabled: enabled });
  },
  setDismissedUpdateVersion: async (version) => {
    if (version === null) await storage.remove(DISMISSED_UPDATE_VERSION_STORAGE_KEY);
    else await storage.set(DISMISSED_UPDATE_VERSION_STORAGE_KEY, version);
    set({ dismissedUpdateVersion: version });
  },
}));
