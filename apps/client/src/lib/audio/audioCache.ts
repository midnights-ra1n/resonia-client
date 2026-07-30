import { storage } from "../storage";

const CACHE_NAME = "resonia-audio-cache-v1";
const META_KEY = "resonia:audioCache:meta";
const DEFAULT_MAX_BYTES = 500 * 1024 * 1024; // 500 Mo, ajustable plus tard dans les paramètres

interface CacheEntryMeta {
  key: string; // `${trackId}:${qualityId}`
  size: number;
  lastAccessedAt: number;
}

function cacheKeyFor(trackId: string, qualityId: string): string {
  return `${trackId}:${qualityId}`;
}

// URL synthétique stable, indépendante du token d'auth (qui peut changer),
// utilisée uniquement comme clé d'entrée dans le Cache Storage.
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

const inFlight = new Set<string>();

/**
 * Vérifie si un titre est déjà en cache et retourne une Object URL locale si oui.
 * Met aussi à jour son horodatage de dernier accès (LRU).
 */
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

/**
 * Télécharge et met en cache un titre en arrière-plan, sans bloquer la lecture en cours.
 * Ne fait rien si déjà en cache ou déjà en cours de téléchargement.
 */
export async function cacheTrackInBackground(
  trackId: string,
  qualityId: string,
  streamUrl: string,
): Promise<void> {
  if (!("caches" in window)) return;

  const key = cacheKeyFor(trackId, qualityId);
  if (inFlight.has(key)) return;

  const cache = await caches.open(CACHE_NAME);
  const already = await cache.match(syntheticRequestFor(key));
  if (already) return;

  inFlight.add(key);

  try {
    const response = await fetch(streamUrl);
    if (!response.ok || !response.body) return;

    const blob = await response.clone().blob();
    await cache.put(syntheticRequestFor(key), response);
    await touchEntry(key, blob.size);
    await enforceLimit();
  } catch (err) {
    console.warn(`[audioCache] Échec de mise en cache pour ${trackId}`, err);
  } finally {
    inFlight.delete(key);
  }
}

export function isCachingInProgress(trackId: string, qualityId: string): boolean {
  return inFlight.has(cacheKeyFor(trackId, qualityId));
}
