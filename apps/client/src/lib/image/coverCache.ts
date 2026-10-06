import { electronFetch } from "../net/electronFetch";
import { storage } from "../storage";
import { createBlobStore } from "../storage/blobStore";
import { isElectron } from "../platform";

const ROOT_DIR = "resonia-cover-cache";
const META_KEY = "resonia:coverCache:meta";
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024; // 100 Mb
const SIZE_NOTIFY_THROTTLE_MS = 300;

// Même backend que le cache audio (voir cacheStore/opfsStore) : OPFS sur le web, vrai
// système de fichiers via IPC vers le process principal Electron sur desktop. Un seul cache,
// une seule famille de stockage, plus robuste que l'ancienne Cache Storage API dont le quota
// suit les mêmes limites "best-effort" qu'OPFS sur les webviews desktop.
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

/** Sur les grilles/carrousels non virtualisés (recherche, accueil), potentiellement des
 *  dizaines de pochettes deviennent "voulues" en même temps (voir `useInViewport` pour le
 *  filtre côté visibilité, qui réduit déjà beaucoup ce nombre mais ne le ramène pas à un
 *  téléchargement à la fois). Sans limite, elles partent toutes en parallèle : sur bureau
 *  chaque requête traverse en plus la frontière IPC Rust du plugin `http`, et le serveur
 *  Subsonic/Navidrome lui-même peut sérialiser ou ralentir un pic de requêtes simultanées —
 *  c'est ce qui produisait des pochettes visibles mettant 5 à 10 secondes à apparaître dans
 *  la recherche. Une petite file à concurrence bornée lisse la charge sans changer le
 *  résultat final (tout finit par se télécharger et se mettre en cache), juste son ordre
 *  d'arrivée — largement suffisant ici puisqu'aucune pochette individuelle n'est urgente au
 *  point de justifier une vraie priorisation par distance au viewport. */
// 3 et non 6 : Chromium n'ouvre que 6 connexions HTTP/1.1 par hôte (voir `disable-http2` dans
// electron/main/index.ts), partagées avec le flux de lecture et le préchargement audio — une grille
// de pochettes ne doit jamais toutes les occuper au moment où l'utilisateur lance une piste.
const MAX_CONCURRENT_COVER_FETCHES = 3;
let activeCoverFetches = 0;
const coverFetchQueue: Array<() => void> = [];

function runQueuedCoverFetch() {
  if (activeCoverFetches >= MAX_CONCURRENT_COVER_FETCHES) return;
  const next = coverFetchQueue.shift();
  if (!next) return;
  activeCoverFetches++;
  next();
}

function withCoverFetchLimit<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      task()
        .then(resolve, reject)
        .finally(() => {
          activeCoverFetches--;
          runQueuedCoverFetch();
        });
    };
    coverFetchQueue.push(run);
    runQueuedCoverFetch();
  });
}

/** `fetch` direct d'abord, en priorité basse (le flux de lecture passe avant) : Navidrome et les CDN
 *  d'artwork renvoient un en-tête CORS ouvert. Sur bureau, passer systématiquement par
 *  `electronFetch` faisait télécharger chaque pochette en entier par le process principal puis la
 *  recopier par IPC — un aller-retour et une copie de plus par image, tous sérialisés dans un seul
 *  process. Il ne sert plus que de repli pour un hôte qui refuse le CORS (échec réseau `TypeError`). */
async function fetchForCache(url: string): Promise<Response> {
  return withCoverFetchLimit(async () => {
    try {
      return await fetch(url, { priority: "low" });
    } catch (err) {
      if (isElectron() && err instanceof TypeError) return electronFetch(url);
      throw err;
    }
  });
}

// Métadonnées tenues EN MÉMOIRE (Map, accès O(1)), chargées une seule fois puis persistées
// par lots. Avant : chaque affichage de pochette relisait et re-parsait la liste complète
// (des milliers d'entrées, des centaines de Ko de JSON) depuis le stockage, deux fois, puis la
// re-sérialisait et la réécrivait entièrement — des Mo de JSON brassés par carrousel affiché,
// CPU et ramasse-miettes sollicités en continu pendant le défilement. Les écritures
// concurrentes (lecture-modification-écriture en parallèle) pouvaient aussi perdre des entrées.
const PERSIST_DELAY_MS = 1500;
let metaPromise: Promise<Map<string, CacheEntryMeta>> | null = null;
let totalBytes = 0;
let persistTimer: number | null = null;

function loadMeta(): Promise<Map<string, CacheEntryMeta>> {
  metaPromise ??= storage.get<CacheEntryMeta[]>(META_KEY).then((list) => {
    const map = new Map<string, CacheEntryMeta>();
    totalBytes = 0;
    for (const entry of list ?? []) {
      map.set(entry.key, entry);
      totalBytes += entry.size;
    }
    return map;
  });
  return metaPromise;
}

/** Persistance regroupée : une seule écriture du stockage par fenêtre de 1,5 s, quel que soit
 *  le nombre de pochettes affichées entre-temps. */
function schedulePersist() {
  scheduleSizeNotify();
  if (persistTimer !== null) return;
  persistTimer = window.setTimeout(async () => {
    persistTimer = null;
    const meta = await loadMeta();
    await storage.set(META_KEY, Array.from(meta.values()));
  }, PERSIST_DELAY_MS);
}

// Fermeture de l'onglet/fenêtre avec une persistance encore en attente : on écrit tout de suite
// (au mieux) plutôt que de perdre les entrées des dernières pochettes mises en cache — leurs
// fichiers resteraient sinon sur le disque sans être comptés dans la taille du cache.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (persistTimer === null || !metaPromise) return;
    window.clearTimeout(persistTimer);
    persistTimer = null;
    void metaPromise.then((meta) => storage.set(META_KEY, Array.from(meta.values())));
  });
}

async function touchEntry(key: string, size?: number, contentType?: string): Promise<void> {
  const meta = await loadMeta();
  const existing = meta.get(key);
  if (existing) {
    existing.lastAccessedAt = Date.now();
    if (size !== undefined) {
      totalBytes += size - existing.size;
      existing.size = size;
    }
    if (contentType !== undefined) existing.contentType = contentType;
  } else {
    meta.set(key, {
      key,
      size: size ?? 0,
      contentType: contentType ?? "application/octet-stream",
      lastAccessedAt: Date.now(),
    });
    totalBytes += size ?? 0;
  }
  schedulePersist();
}

async function enforceLimit(): Promise<void> {
  const meta = await loadMeta();
  if (totalBytes <= maxBytes) return;

  const oldestFirst = Array.from(meta.values()).sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  for (const entry of oldestFirst) {
    if (totalBytes <= maxBytes) break;
    meta.delete(entry.key);
    totalBytes -= entry.size;
    await store.deleteFile(entry.key);
  }
  schedulePersist();
}

/** Corps texte (XML/JSON/HTML) : réponse d'erreur, jamais une image. Pas de liste blanche
 *  `image/*` : certains proxys servent les pochettes en `application/octet-stream`. */
function isErrorContentType(contentType: string): boolean {
  return /^text\/|json/i.test(contentType) || (/xml/i.test(contentType) && !/svg/i.test(contentType));
}

/** Retire une entrée dont le fichier est absent ou incohérent, pour qu'elle soit retéléchargée. */
async function dropEntry(key: string): Promise<void> {
  const meta = await loadMeta();
  const entry = meta.get(key);
  if (entry) {
    meta.delete(key);
    totalBytes -= entry.size;
    schedulePersist();
  }
  await store.deleteFile(key).catch(() => {});
}

async function readCachedCover(key: string): Promise<{ blob: Blob; contentType: string } | null> {
  const entry = (await loadMeta()).get(key);
  if (!entry) return null;
  let blob = await store.readAsBlob(key, entry.contentType);
  // Taille différente de celle enregistrée à l'écriture : fichier tronqué (écriture interrompue)
  // ou suivi de restes d'une image précédente — une pochette cassée à l'affichage, et pour
  // toujours puisque servie depuis le cache. On la jette pour la retélécharger.
  // Type non image : réponse d'erreur du serveur mise en cache par une version précédente.
  if (!blob || (entry.size > 0 && blob.size !== entry.size) || isErrorContentType(entry.contentType)) {
    await dropEntry(key);
    return null;
  }
  // Sur OPFS, le Blob est le fichier disque lui-même : toute réécriture ou éviction ultérieure
  // de ce fichier rend illisible l'URL `blob:` encore affichée ailleurs (image cassée). Une
  // pochette ne pèse que quelques dizaines de Ko : on la copie en mémoire, comme le fait déjà
  // le backend bureau (lecture via IPC).
  if (!isElectron()) blob = new Blob([await blob.arrayBuffer()], { type: entry.contentType });
  return { blob, contentType: entry.contentType };
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

  return URL.createObjectURL(await downloadCover(key, fetchUrl));
}

/** Téléchargements en vol, par clé — jusqu'à la fin de leur écriture sur disque : plusieurs
 *  composants (ou le préchargement du lecteur, voir playerStore) demandant la même pochette en
 *  même temps partagent une seule requête et une seule écriture. Deux écritures concurrentes du même fichier pouvaient sinon s'entremêler et
 *  laisser une image corrompue en cache. */
const inFlightDownloads = new Map<string, Promise<Blob>>();

function downloadCover(key: string, fetchUrl: string): Promise<Blob> {
  let pending = inFlightDownloads.get(key);
  if (!pending) {
    pending = fetchAndStoreCover(key, fetchUrl, () => inFlightDownloads.delete(key));
    inFlightDownloads.set(key, pending);
  }
  return pending;
}

async function fetchAndStoreCover(key: string, fetchUrl: string, done: () => void): Promise<Blob> {
  let blob: Blob;
  let contentType: string;
  try {
    const response = await fetchForCache(fetchUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Échec du téléchargement de la pochette (${response.status})`);
    }
    blob = await response.blob();
    contentType = blob.type || response.headers.get("content-type") || "application/octet-stream";
    // L'API Subsonic renvoie ses erreurs (pochette introuvable, jeton expiré...) en HTTP 200 avec
    // un corps XML/JSON : à ne jamais mettre en cache comme image.
    if (isErrorContentType(contentType) || blob.size === 0) {
      throw new Error(`Réponse de pochette invalide (${contentType}, ${blob.size} octets)`);
    }
  } catch (err) {
    done();
    throw err;
  }

  void (async () => {
    try {
      // Fichier repris de zéro : les deux backends ouvrent un fichier existant SANS le tronquer
      // (reprise de téléchargement audio). Une image plus petite qu'un ancien fichier resté sur
      // le disque (métadonnées perdues avant leur persistance) en gardait sinon la fin.
      await store.deleteFile(key);
      const writer = await store.createWriter(key);
      await writer.seek(0);
      await writer.write(await blob.arrayBuffer());
      await writer.close();
      await touchEntry(key, blob.size, contentType);
      await enforceLimit();
    } catch (err) {
      console.warn(`[coverCache] Écriture du cache impossible pour ${key}`, err);
    } finally {
      done();
    }
  })();

  return blob;
}

export async function currentCoverCacheSize(): Promise<number> {
  await loadMeta();
  return totalBytes;
}

export async function clearCoverCache(): Promise<void> {
  const meta = await loadMeta();
  const keys = Array.from(meta.keys());
  meta.clear();
  totalBytes = 0;
  for (const key of keys) await store.deleteFile(key);
  await storage.set(META_KEY, []);
  scheduleSizeNotify();
}
