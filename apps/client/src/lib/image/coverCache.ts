import { storage } from "../storage";

const CACHE_NAME = "resonia-cover-cache-v1";
const META_KEY = "resonia:coverCache:meta";
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024; // 100 Mb

interface CacheEntryMeta {
  key: string;
  size: number;
  lastAccessedAt: number;
}

function cacheKeyFor(serverId: string, coverArtId: string, size: number): string {
  return `${serverId}:${coverArtId}:${size}`;
}

function syntheticRequestFor(key: string): Request {
  return new Request(`https://resonia.local/cover-cache/${encodeURIComponent(key)}`);
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

/** Object URL locale si la pochette est déjà en cache, sinon null (pas d'appel réseau ici). */
export async function getCachedCoverUrl(
  serverId: string,
  coverArtId: string,
  size: number,
): Promise<string | null> {
  if (!("caches" in window)) return null;
  const key = cacheKeyFor(serverId, coverArtId, size);
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(syntheticRequestFor(key));
  if (!response) return null;

  await touchEntry(key);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/** Télécharge la pochette (cache si absente) et retourne une Object URL prête à afficher. */
export async function loadAndCacheCover(
  serverId: string,
  coverArtId: string,
  size: number,
  fetchUrl: string,
): Promise<string> {
  if (!("caches" in window)) {
    // Cache API indisponible (contexte non sécurisé, navigateur trop ancien...) : fallback URL live.
    return fetchUrl;
  }

  const key = cacheKeyFor(serverId, coverArtId, size);
  const cache = await caches.open(CACHE_NAME);

  const cached = await cache.match(syntheticRequestFor(key));
  if (cached) {
    await touchEntry(key);
    const blob = await cached.blob();
    return URL.createObjectURL(blob);
  }

  const response = await fetch(fetchUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Échec du téléchargement de la pochette (${response.status})`);
  }

  const blob = await response.clone().blob();

  cache.put(syntheticRequestFor(key), response).then(() => {
    touchEntry(key, blob.size).then(() => enforceLimit());
  });

  return URL.createObjectURL(blob);
}