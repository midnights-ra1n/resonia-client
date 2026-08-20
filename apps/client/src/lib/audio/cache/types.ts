export type DownloadPriority = "active" | "prefetch";

export interface CacheKeyParts {
  trackId: string;
  qualityId: string;
}

export interface CacheEntryMeta {
  key: string; // `${trackId}:${qualityId}:v${CACHE_FORMAT_VERSION}`
  totalBytes: number; // -1 tant qu'inconnu (avant le premier Content-Range)
  bytesCached: number;
  complete: boolean;
  lastAccessedAt: number;
}

export interface DownloadProgress {
  bytesCached: number;
  totalBytes: number;
  complete: boolean;
}

export type ProgressListener = (progress: DownloadProgress) => void;

/** À incrémenter si le format des fichiers mis en cache change (ex: conteneur cible). */
export const CACHE_FORMAT_VERSION = 1;

export function cacheKeyFor(trackId: string, qualityId: string): string {
  return `${trackId}:${qualityId}:v${CACHE_FORMAT_VERSION}`;
}
