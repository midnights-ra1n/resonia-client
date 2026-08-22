import { storage } from "../storage";
import { createBlobStore } from "../storage/blobStore";
import { isTauri } from "../platform";

const ROOT_DIR = "resonia-animated-cover-cache";
const META_KEY = "resonia:animatedCoverCache:meta";
const DEFAULT_MAX_BYTES = 150 * 1024 * 1024; // 150 Mb
const SIZE_NOTIFY_THROTTLE_MS = 300;

// Même famille de stockage que coverCache/cacheStore (OPFS web, fs Tauri sur bureau) : un cache
// séparé de celui des pochettes statiques, car les pochettes animées (vidéo mp4) pèsent nettement
// plus lourd à l'unité et méritent leur propre budget/éviction LRU indépendants.
const store = createBlobStore(ROOT_DIR);

let maxBytes = DEFAULT_MAX_BYTES;

export function setAnimatedCoverCacheMaxBytes(bytes: number): void {
  maxBytes = bytes;
  enforceLimit();
}

const sizeListeners = new Set<(bytes: number) => void>();
let sizeNotifyTimer: number | null = null;

function scheduleSizeNotify() {
  if (sizeListeners.size === 0 || sizeNotifyTimer !== null) return;
  sizeNotifyTimer = window.setTimeout(async () => {
    sizeNotifyTimer = null;
    const bytes = await currentAnimatedCoverCacheSize();
    sizeListeners.forEach((cb) => cb(bytes));
  }, SIZE_NOTIFY_THROTTLE_MS);
}

/** S'abonne aux variations de la taille du cache de pochettes animées (throttled). */
export function onAnimatedCoverCacheSizeChange(cb: (bytes: number) => void): () => void {
  sizeListeners.add(cb);
  return () => sizeListeners.delete(cb);
}

interface CacheEntryMeta {
  key: string;
  size: number;
  contentType: string;
  lastAccessedAt: number;
}

function cacheKeyFor(albumKey: string): string {
  return albumKey;
}

async function readMeta(): Promise<CacheEntryMeta[]> {
  return (await storage.get<CacheEntryMeta[]>(META_KEY)) ?? [];
}

async function writeMeta(entries: CacheEntryMeta[]): Promise<void> {
  await storage.set(META_KEY, entries);
  scheduleSizeNotify();
}

async function touchEntry(key: string, size?: number, contentType?: string): Promise<void> {
  const meta = await readMeta();
  const existing = meta.find((e) => e.key === key);
  if (existing) {
    existing.lastAccessedAt = Date.now();
    if (size !== undefined) existing.size = size;
    if (contentType !== undefined) existing.contentType = contentType;
  } else {
    meta.push({ key, size: size ?? 0, contentType: contentType ?? "video/mp4", lastAccessedAt: Date.now() });
  }
  await writeMeta(meta);
}

async function enforceLimit(): Promise<void> {
  const meta = await readMeta();
  const total = meta.reduce((sum, e) => sum + e.size, 0);
  if (total <= maxBytes) return;

  const sorted = [...meta].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  let currentTotal = total;
  const remaining: CacheEntryMeta[] = [...meta];

  for (const entry of sorted) {
    if (currentTotal <= maxBytes) break;
    await store.deleteFile(entry.key);
    currentTotal -= entry.size;
    const idx = remaining.findIndex((e) => e.key === entry.key);
    if (idx !== -1) remaining.splice(idx, 1);
  }

  await writeMeta(remaining);
}

async function readCachedCover(key: string): Promise<{ blob: Blob; contentType: string } | null> {
  const meta = await readMeta();
  const entry = meta.find((e) => e.key === key);
  if (!entry) return null;
  const bytes = await store.readAll(key);
  if (!bytes) return null;
  return { blob: new Blob([bytes], { type: entry.contentType }), contentType: entry.contentType };
}

/** Voir coverCache.ts : certains hôtes (ici le CDN Apple mvod.itunes.apple.com) sont accessibles
 *  sans en-tête CORS explicite selon le contexte ; passer par le client HTTP natif de Tauri côté
 *  bureau évite d'en dépendre. */
async function fetchForCache(url: string): Promise<Response> {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(url);
  }
  return fetch(url);
}

/** Object URL locale si la pochette animée est déjà en cache, sinon null (pas d'appel réseau). */
export async function getCachedAnimatedCoverUrl(albumKey: string): Promise<string | null> {
  const key = cacheKeyFor(albumKey);
  try {
    const cached = await readCachedCover(key);
    if (!cached) return null;
    await touchEntry(key);
    return URL.createObjectURL(cached.blob);
  } catch (err) {
    console.warn(`[animatedCoverCache] Lecture du cache impossible pour ${key}`, err);
    return null;
  }
}

/** Télécharge la pochette animée (cache si absente) et retourne une Object URL prête à afficher. */
export async function loadAndCacheAnimatedCover(albumKey: string, videoUrl: string): Promise<string> {
  const key = cacheKeyFor(albumKey);

  try {
    const cached = await readCachedCover(key);
    if (cached) {
      await touchEntry(key);
      return URL.createObjectURL(cached.blob);
    }
  } catch (err) {
    console.warn(`[animatedCoverCache] Lecture du cache impossible pour ${key}`, err);
  }

  const response = await fetchForCache(videoUrl);
  if (!response.ok) {
    throw new Error(`Échec du téléchargement de la pochette animée (${response.status})`);
  }

  const blob = await response.blob();
  const contentType = blob.type || response.headers.get("content-type") || "video/mp4";

  (async () => {
    try {
      const writer = await store.createWriter(key);
      await writer.seek(0);
      await writer.write(await blob.arrayBuffer());
      await writer.close();
      await touchEntry(key, blob.size, contentType);
      await enforceLimit();
    } catch (err) {
      console.warn(`[animatedCoverCache] Écriture du cache impossible pour ${key}`, err);
    }
  })();

  return URL.createObjectURL(blob);
}

export async function currentAnimatedCoverCacheSize(): Promise<number> {
  const meta = await readMeta();
  return meta.reduce((sum, e) => sum + e.size, 0);
}

export async function clearAnimatedCoverCache(): Promise<void> {
  const meta = await readMeta();
  for (const entry of meta) {
    await store.deleteFile(entry.key);
  }
  await writeMeta([]);
}
