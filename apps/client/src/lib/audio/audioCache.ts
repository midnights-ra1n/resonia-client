import { storage } from "../storage";

const CACHE_NAME = "resonia-audio-cache-v1";
const META_KEY = "resonia:audioCache:meta";
const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;

interface CacheEntryMeta {
  key: string;
  size: number;
  lastAccessedAt: number;
}

function cacheKeyFor(trackId: string, qualityId: string): string {
  return `${trackId}:${qualityId}`;
}

function syntheticRequestFor(key: string): Request {
  return new Request(`https://resonia.local/audio-cache/${encodeURIComponent(key)}`);
}

async function readMeta(): Promise<CacheEntryMeta[]> {
  return (await storage.get<CacheEntryMeta[]>(META_KEY)) ?? [];
}

async function writeMeta(entries: CacheEntryMeta[]): Promise<void> {
  await storage.set(META_KEY, entries);
}

async function touchEntry(key: string, size?: number): Promise<void> {
  const meta = await readMeta();
  const existing = meta.find((e) => e.key === key);
  if (existing) {
    existing.lastAccessedAt = Date.now();
    if (size !== undefined) existing.size = size;
  } else {
    meta.push({ key, size: size ?? 0, lastAccessedAt: Date.now() });
  }
  await writeMeta(meta);
}

async function enforceLimit(maxBytes: number = DEFAULT_MAX_BYTES): Promise<void> {
  const meta = await readMeta();
  const total = meta.reduce((sum, e) => sum + e.size, 0);
  if (total <= maxBytes) return;

  const cache = await caches.open(CACHE_NAME);
  const sorted = [...meta].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  let currentTotal = total;
  const remaining: CacheEntryMeta[] = [...meta];

  for (const entry of sorted) {
    if (currentTotal <= maxBytes) break;
    await cache.delete(syntheticRequestFor(entry.key));
    currentTotal -= entry.size;
    const idx = remaining.findIndex((e) => e.key === entry.key);
    if (idx !== -1) remaining.splice(idx, 1);
  }

  await writeMeta(remaining);
}

/** Object URL locale si le titre est déjà en cache (lecture instantanée), sinon null. */
export async function getCachedTrackUrl(trackId: string, qualityId: string): Promise<string | null> {
  if (!("caches" in window)) return null;
  const key = cacheKeyFor(trackId, qualityId);
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(syntheticRequestFor(key));
  if (!response) return null;

  await touchEntry(key);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/** Télécharge intégralement un titre (cache si déjà présent) et retourne son ArrayBuffer, pour décodage. */
export async function loadTrackArrayBuffer(
  trackId: string,
  qualityId: string,
  streamUrl: string,
): Promise<ArrayBuffer> {
  const key = cacheKeyFor(trackId, qualityId);
  const cache = await caches.open(CACHE_NAME);

  const cached = await cache.match(syntheticRequestFor(key));
  if (cached) {
    await touchEntry(key);
    return cached.arrayBuffer();
  }

  const response = await fetch(streamUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Échec du téléchargement (${response.status})`);
  }

  const buffer = await response.clone().arrayBuffer();

  cache.put(syntheticRequestFor(key), response).then(() => {
    touchEntry(key, buffer.byteLength).then(() => enforceLimit());
  });

  return buffer;
}
