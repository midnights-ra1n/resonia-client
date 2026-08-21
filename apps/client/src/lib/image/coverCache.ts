import { storage } from "../storage";
import { createBlobStore } from "../storage/blobStore";

const ROOT_DIR = "resonia-cover-cache";
const META_KEY = "resonia:coverCache:meta";
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024; // 100 Mb
const SIZE_NOTIFY_THROTTLE_MS = 300;

// Même backend que le cache audio (voir cacheStore/opfsStore) : OPFS sur le web, vrai
// système de fichiers via le plugin Tauri `fs` sur desktop. Un seul cache, une seule
// famille de stockage, plus robuste que l'ancienne Cache Storage API dont le quota suit
// les mêmes limites "best-effort" qu'OPFS sur les webviews desktop.
const store = createBlobStore(ROOT_DIR);

// Le cache de pochettes partage le même budget que le cache audio (voir settingsStore) :
// c'est un seul cache, une seule limite. `setCoverCacheMaxBytes` reçoit la part qui lui
// est réservée sur ce budget total.
let maxBytes = DEFAULT_MAX_BYTES;

export function setCoverCacheMaxBytes(bytes: number): void {
  maxBytes = bytes;
  enforceLimit();
}

const sizeListeners = new Set<(bytes: number) => void>();
let sizeNotifyTimer: number | null = null;

function scheduleSizeNotify() {
  if (sizeListeners.size === 0 || sizeNotifyTimer !== null) return;
  sizeNotifyTimer = window.setTimeout(async () => {
    sizeNotifyTimer = null;
    const bytes = await currentCoverCacheSize();
    sizeListeners.forEach((cb) => cb(bytes));
  }, SIZE_NOTIFY_THROTTLE_MS);
}

/** S'abonne aux variations de la taille du cache de pochettes (throttled, voir cacheStore). */
export function onCoverCacheSizeChange(cb: (bytes: number) => void): () => void {
  sizeListeners.add(cb);
  return () => sizeListeners.delete(cb);
}

interface CacheEntryMeta {
  key: string;
  size: number;
  contentType: string;
  lastAccessedAt: number;
}

function cacheKeyFor(serverId: string, coverArtId: string, size: number): string {
  return `${serverId}:${coverArtId}:${size}`;
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
    meta.push({ key, size: size ?? 0, contentType: contentType ?? "application/octet-stream", lastAccessedAt: Date.now() });
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

/** Object URL locale si la pochette est déjà en cache, sinon null (pas d'appel réseau ici). */
export async function getCachedCoverUrl(
  serverId: string,
  coverArtId: string,
  size: number,
): Promise<string | null> {
  const key = cacheKeyFor(serverId, coverArtId, size);
  try {
    const cached = await readCachedCover(key);
    if (!cached) return null;
    await touchEntry(key);
    return URL.createObjectURL(cached.blob);
  } catch (err) {
    console.warn(`[coverCache] Lecture du cache impossible pour ${key}`, err);
    return null;
  }
}

/** Télécharge la pochette (cache si absente) et retourne une Object URL prête à afficher. */
export async function loadAndCacheCover(
  serverId: string,
  coverArtId: string,
  size: number,
  fetchUrl: string,
): Promise<string> {
  const key = cacheKeyFor(serverId, coverArtId, size);

  try {
    const cached = await readCachedCover(key);
    if (cached) {
      await touchEntry(key);
      return URL.createObjectURL(cached.blob);
    }
  } catch (err) {
    console.warn(`[coverCache] Lecture du cache impossible pour ${key}`, err);
  }

  const response = await fetch(fetchUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Échec du téléchargement de la pochette (${response.status})`);
  }

  const blob = await response.blob();
  const contentType = blob.type || response.headers.get("content-type") || "application/octet-stream";

  (async () => {
    try {
      const writer = await store.createWriter(key);
      await writer.seek(0);
      await writer.write(await blob.arrayBuffer());
      await writer.close();
      await touchEntry(key, blob.size, contentType);
      await enforceLimit();
    } catch (err) {
      console.warn(`[coverCache] Écriture du cache impossible pour ${key}`, err);
    }
  })();

  return URL.createObjectURL(blob);
}

export async function currentCoverCacheSize(): Promise<number> {
  const meta = await readMeta();
  return meta.reduce((sum, e) => sum + e.size, 0);
}

export async function clearCoverCache(): Promise<void> {
  const meta = await readMeta();
  for (const entry of meta) {
    await store.deleteFile(entry.key);
  }
  await writeMeta([]);
}
