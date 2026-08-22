import { create } from "zustand";
import { DEFAULT_QUALITY_ID, getAvailableQualities, getQualityById } from "../lib/audio/qualityOptions";
import { getPlatform } from "../lib/platform";
import { storage } from "../lib/storage";
import { cacheStore } from "../lib/audio/cache/cacheStore";
import { setCoverCacheMaxBytes } from "../lib/image/coverCache";
import { setAnimatedCoverCacheMaxBytes } from "../lib/image/animatedCoverCache";

interface SettingsState {
  audioQualityId: string;
  lastfmApiKey: string;
  animatedArtworkBaseUrl: string;
  cacheMaxBytes: number;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAudioQuality: (id: string) => Promise<void>;
  setLastfmApiKey: (key: string) => Promise<void>;
  setAnimatedArtworkBaseUrl: (url: string) => Promise<void>;
  setCacheMaxBytes: (bytes: number) => Promise<void>;
}

const STORAGE_KEY = "resonia:settings:audioQuality";
const LASTFM_API_KEY_STORAGE_KEY = "resonia:settings:lastfmApiKey";
const ANIMATED_ARTWORK_BASE_URL_STORAGE_KEY = "resonia:settings:animatedArtworkBaseUrl";
const CACHE_MAX_BYTES_STORAGE_KEY = "resonia:settings:cacheMaxBytes";

export const GIGABYTE = 1024 * 1024 * 1024;
export const DEFAULT_CACHE_MAX_BYTES = 2 * GIGABYTE;

// Cache unique et partagé entre musiques, pochettes et pochettes animées (une seule limite
// réglable) : les pochettes (statiques et animées) se réservent une part fixe du budget total,
// le reste va à l'audio qui domine largement le volume de données.
const COVER_CACHE_RESERVE_BYTES = 100 * 1024 * 1024;
const ANIMATED_COVER_CACHE_RESERVE_BYTES = 150 * 1024 * 1024;

function splitCacheBudget(totalBytes: number): { audioBytes: number; coverBytes: number; animatedCoverBytes: number } {
  const reserve = Math.min(
    COVER_CACHE_RESERVE_BYTES + ANIMATED_COVER_CACHE_RESERVE_BYTES,
    Math.floor(totalBytes / 2),
  );
  const coverBytes = Math.floor((reserve * COVER_CACHE_RESERVE_BYTES) / (COVER_CACHE_RESERVE_BYTES + ANIMATED_COVER_CACHE_RESERVE_BYTES));
  const animatedCoverBytes = reserve - coverBytes;
  return { audioBytes: totalBytes - reserve, coverBytes, animatedCoverBytes };
}

function applyCacheMaxBytes(totalBytes: number) {
  const { audioBytes, coverBytes, animatedCoverBytes } = splitCacheBudget(totalBytes);
  cacheStore.setMaxBytes(audioBytes);
  setCoverCacheMaxBytes(coverBytes);
  setAnimatedCoverCacheMaxBytes(animatedCoverBytes);
}

export const useSettingsStore = create<SettingsState>((set) => ({
  audioQualityId: DEFAULT_QUALITY_ID,
  lastfmApiKey: "",
  animatedArtworkBaseUrl: "",
  cacheMaxBytes: DEFAULT_CACHE_MAX_BYTES,
  hydrated: false,

  hydrate: async () => {
    const [stored, lastfmApiKey, animatedArtworkBaseUrl, cacheMaxBytes] = await Promise.all([
      storage.get<string>(STORAGE_KEY),
      storage.get<string>(LASTFM_API_KEY_STORAGE_KEY),
      storage.get<string>(ANIMATED_ARTWORK_BASE_URL_STORAGE_KEY),
      storage.get<number>(CACHE_MAX_BYTES_STORAGE_KEY),
    ]);
    const platform = getPlatform();
    const available = getAvailableQualities(platform);
    // If the stored quality is no longer available on this platform
    // (e.g., desktop profile -> opened one day on the web), we fall back to the default.
    const isValid = stored && available.some((q) => q.id === stored);
    const resolvedCacheMaxBytes = cacheMaxBytes ?? DEFAULT_CACHE_MAX_BYTES;

    applyCacheMaxBytes(resolvedCacheMaxBytes);

    set({
      audioQualityId: isValid ? stored! : DEFAULT_QUALITY_ID,
      lastfmApiKey: lastfmApiKey ?? "",
      animatedArtworkBaseUrl: animatedArtworkBaseUrl ?? "",
      cacheMaxBytes: resolvedCacheMaxBytes,
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
}));
