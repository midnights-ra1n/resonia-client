import { create } from "zustand";
import {
  DEFAULT_QUALITY_ID,
  getAvailableQualities,
  getQualityById,
} from "../lib/audio/qualityOptions";
import { getPlatform } from "../lib/platform";
import { storage } from "../lib/storage";
import { cacheStore } from "../lib/audio/cache/cacheStore";
import { setCoverCacheMaxBytes } from "../lib/image/coverCache";
import { setAudioDebugEnabled } from "../lib/audio/debug/audioDebugLogger";

export type PlaylistSortBy = "default" | "title" | "artist" | "album";
export type PlaylistSortDirection = "asc" | "desc";

interface SettingsState {
  audioQualityId: string;
  lastfmApiKey: string;
  animatedArtworkBaseUrl: string;
  cacheMaxBytes: number;
  playlistSortBy: PlaylistSortBy;
  playlistSortDirection: PlaylistSortDirection;
  devModeEnabled: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAudioQuality: (id: string) => Promise<void>;
  setLastfmApiKey: (key: string) => Promise<void>;
  setAnimatedArtworkBaseUrl: (url: string) => Promise<void>;
  setCacheMaxBytes: (bytes: number) => Promise<void>;
  setPlaylistSort: (
    by: PlaylistSortBy,
    direction: PlaylistSortDirection,
  ) => Promise<void>;
  setDevModeEnabled: (enabled: boolean) => Promise<void>;
}

const STORAGE_KEY = "resonia:settings:audioQuality";
const LASTFM_API_KEY_STORAGE_KEY = "resonia:settings:lastfmApiKey";
const ANIMATED_ARTWORK_BASE_URL_STORAGE_KEY =
  "resonia:settings:animatedArtworkBaseUrl";
const CACHE_MAX_BYTES_STORAGE_KEY = "resonia:settings:cacheMaxBytes";
const PLAYLIST_SORT_BY_STORAGE_KEY = "resonia:settings:playlistSortBy";
const PLAYLIST_SORT_DIRECTION_STORAGE_KEY =
  "resonia:settings:playlistSortDirection";
const DEV_MODE_ENABLED_STORAGE_KEY = "resonia:settings:devModeEnabled";

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

export const useSettingsStore = create<SettingsState>((set) => ({
  audioQualityId: DEFAULT_QUALITY_ID,
  lastfmApiKey: "",
  animatedArtworkBaseUrl: "",
  cacheMaxBytes: DEFAULT_CACHE_MAX_BYTES,
  playlistSortBy: "default",
  playlistSortDirection: "asc",
  devModeEnabled: false,
  hydrated: false,

  hydrate: async () => {
    const [
      stored,
      lastfmApiKey,
      animatedArtworkBaseUrl,
      cacheMaxBytes,
      playlistSortBy,
      playlistSortDirection,
      devModeEnabled,
    ] = await Promise.all([
      storage.get<string>(STORAGE_KEY),
      storage.get<string>(LASTFM_API_KEY_STORAGE_KEY),
      storage.get<string>(ANIMATED_ARTWORK_BASE_URL_STORAGE_KEY),
      storage.get<number>(CACHE_MAX_BYTES_STORAGE_KEY),
      storage.get<PlaylistSortBy>(PLAYLIST_SORT_BY_STORAGE_KEY),
      storage.get<PlaylistSortDirection>(PLAYLIST_SORT_DIRECTION_STORAGE_KEY),
      storage.get<boolean>(DEV_MODE_ENABLED_STORAGE_KEY),
    ]);
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
      hydrated: true,
    });
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
}));
