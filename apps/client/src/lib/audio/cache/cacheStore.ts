import { storage } from "../../storage";
import { TrackDownloader, type ChunkListener } from "./trackDownloader";
import { cacheKeyFor, type CacheEntryMeta, type DownloadPriority, type ProgressListener } from "./types";
import { audioCacheBlobStore, opfsDelete, opfsReadAll } from "./opfsStore";

// Ancien format (un seul tableau sous une seule clé) — encore lu pour migrer les installations
// existantes vers le format par-entrée ci-dessous, jamais plus écrit (voir `loadMeta`).
const LEGACY_META_KEY = "resonia:cache:meta";
// Format par-entrée : un index léger (juste les clés) + une entrée par piste sous sa propre
// clé `storage`. Sur le backend web (localStorage, synchrone — voir localStorageAdapter.ts),
// l'ancien format sérialisait et réécrivait TOUT le tableau à chaque flush, donc un JSON de
// plus en plus gros au fil des pistes mises en cache au fil des mois : sur une session de
// téléchargement actif (flush ~1x/s, voir persistMeta), ce `localStorage.setItem` synchrone
// pouvait geler le thread principal une fraction de seconde — perçu comme un petit décrochage
// de lecture. Avec une entrée par clé, chaque flush ne réécrit que les quelques pistes dont
// l'état a réellement changé depuis le dernier flush (typiquement une seule, ~100 octets),
// quelle que soit la taille totale de l'historique de cache.
const META_INDEX_KEY = "resonia:cache:meta:index";
const META_ENTRY_PREFIX = "resonia:cache:meta:entry:";
function metaEntryKey(key: string): string {
  return `${META_ENTRY_PREFIX}${key}`;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 Go

const SIZE_NOTIFY_THROTTLE_MS = 300;
const META_PERSIST_THROTTLE_MS = 1000;

class CacheStore {
  private tasks = new Map<string, TrackDownloader>();
  private metaCache: Map<string, CacheEntryMeta> | null = null;
  private metaLoad: Promise<Map<string, CacheEntryMeta>> | null = null;
  // Piste active + fenêtre de préchargement en cours : jamais évincées tant qu'elles sont
  // dans cet ensemble, même si elles deviennent la moins récemment utilisées.
  private protectedKeys = new Set<string>();
  private maxBytes = DEFAULT_MAX_BYTES;
  private sizeListeners = new Set<(bytes: number) => void>();
  private sizeNotifyTimer: number | null = null;
  private metaWriteTimer: number | null = null;
  // Entrées modifiées depuis le dernier flush (voir persistMeta/flushMetaToDisk) — seules
  // celles-ci sont réécrites, jamais l'intégralité du cache.
  private dirtyKeys = new Set<string>();
  private indexDirty = false;

  setMaxBytes(bytes: number) {
    this.maxBytes = bytes;
    this.enforceLimit();
  }

  setProtectedKeys(keys: string[]) {
    this.protectedKeys = new Set(keys);
  }

  /** S'abonne aux variations de la taille totale du cache (téléchargement, éviction, purge).
   *  Le callback est throttled : au plus un appel toutes les `SIZE_NOTIFY_THROTTLE_MS`. */
  onSizeChange(cb: (bytes: number) => void): () => void {
    this.sizeListeners.add(cb);
    return () => this.sizeListeners.delete(cb);
  }

  private scheduleSizeNotify() {
    if (this.sizeListeners.size === 0 || this.sizeNotifyTimer !== null) return;
    this.sizeNotifyTimer = window.setTimeout(async () => {
      this.sizeNotifyTimer = null;
      const bytes = await this.currentCacheSize();
      this.sizeListeners.forEach((cb) => cb(bytes));
    }, SIZE_NOTIFY_THROTTLE_MS);
  }

  private async loadMeta(): Promise<Map<string, CacheEntryMeta>> {
    if (this.metaCache) return this.metaCache;
    if (!this.metaLoad) {
      this.metaLoad = (async () => {
        const index = await storage.get<string[]>(META_INDEX_KEY);
        let map: Map<string, CacheEntryMeta>;

        if (index) {
          const entries = await Promise.all(index.map((k) => storage.get<CacheEntryMeta>(metaEntryKey(k))));
          map = new Map(
            index
              .map((k, i) => [k, entries[i]] as const)
              .filter((pair): pair is [string, CacheEntryMeta] => pair[1] !== null),
          );
        } else {
          // Migration ponctuelle depuis l'ancien format tableau unique (voir LEGACY_META_KEY) :
          // ne s'exécute qu'une fois, à la première ouverture après la mise à jour.
          const legacy = (await storage.get<CacheEntryMeta[]>(LEGACY_META_KEY)) ?? [];
          map = new Map(legacy.map((e) => [e.key, e]));
          if (legacy.length > 0) {
            await Promise.all(legacy.map((e) => storage.set(metaEntryKey(e.key), e)));
            await storage.set(META_INDEX_KEY, legacy.map((e) => e.key));
            await storage.remove(LEGACY_META_KEY);
          }
        }

        this.metaCache = map;
        return map;
      })();
    }
    return this.metaLoad;
  }

  /** Planifie l'écriture des métadonnées vers `storage` (throttled) — appelée à chaque
   *  chunk téléchargé (~24-32 fois par piste). `this.metaCache` est déjà à jour en
   *  mémoire à l'appel : tout ce qui lit l'état du cache (currentCacheSize, enforceLimit,
   *  isFullyCached...) reste donc exact immédiatement. Le flush lui-même ne réécrit que les
   *  entrées marquées "dirty" (voir touch/enforceLimit) ; un throttle ramène en plus sa
   *  fréquence à ~1 appel/seconde en téléchargement continu. */
  private persistMeta() {
    if (!this.metaCache) return;
    this.scheduleSizeNotify();
    if (this.metaWriteTimer !== null) return;
    this.metaWriteTimer = window.setTimeout(() => {
      this.metaWriteTimer = null;
      this.flushMetaToDisk();
    }, META_PERSIST_THROTTLE_MS);
  }

  /** N'écrit que ce qui a changé depuis le dernier flush (voir `dirtyKeys`/`indexDirty`) —
   *  jamais l'intégralité de l'historique de cache, quelle que soit sa taille. */
  private flushMetaToDisk(): Promise<void> {
    if (!this.metaCache) return Promise.resolve();
    const writes: Promise<void>[] = [];

    if (this.indexDirty) {
      this.indexDirty = false;
      writes.push(storage.set(META_INDEX_KEY, Array.from(this.metaCache.keys())));
    }

    const keys = Array.from(this.dirtyKeys);
    this.dirtyKeys.clear();
    for (const key of keys) {
      const entry = this.metaCache.get(key);
      writes.push(entry ? storage.set(metaEntryKey(key), entry) : storage.remove(metaEntryKey(key)));
    }

    return Promise.all(writes).then(() => undefined);
  }

  private async touch(key: string, patch: Partial<CacheEntryMeta>) {
    const meta = await this.loadMeta();
    const existing = meta.get(key);
    if (!existing) this.indexDirty = true;
    meta.set(
      key,
      existing
        ? { ...existing, ...patch, lastAccessedAt: Date.now() }
        : { key, totalBytes: -1, bytesCached: 0, complete: false, lastAccessedAt: Date.now(), ...patch },
    );
    this.dirtyKeys.add(key);
    this.persistMeta();
  }

  /** Récupère (ou crée) le downloader pour une clé donnée. Un seul writer OPFS par fichier. */
  private getOrCreateTask(trackId: string, qualityId: string, streamUrl: string): TrackDownloader {
    const key = cacheKeyFor(trackId, qualityId);
    let task = this.tasks.get(key);
    if (!task) {
      task = new TrackDownloader(key, streamUrl, audioCacheBlobStore);
      task.onProgress((progress) => {
        // enforceLimit() à chaque chunk (pas seulement en fin de téléchargement) : si le
        // cache est déjà plein pendant qu'on écrit une nouvelle piste, les entrées les plus
        // anciennes (non protégées) sont évincées au fil de l'eau plutôt qu'en une seule
        // fois à la complétion, pour ne jamais dépasser durablement `maxBytes`.
        this.touch(key, {
          bytesCached: progress.bytesCached,
          totalBytes: progress.totalBytes,
          complete: progress.complete,
        }).then(() => this.enforceLimit());
      });
      this.tasks.set(key, task);
    }
    return task;
  }

  /**
   * Demande le téléchargement d'une piste à une priorité donnée.
   * priority "active"   : bande passante illimitée, protégée de l'éviction par l'appelant.
   * priority "prefetch" : budget en octets, interrompu si non atteint.
   */
  request(trackId: string, qualityId: string, streamUrl: string, priority: DownloadPriority, budgetBytes?: number): TrackDownloader {
    const task = this.getOrCreateTask(trackId, qualityId, streamUrl);
    task.setPriority(priority, budgetBytes);
    task.run(); // no-op si déjà en cours ou déjà complet
    return task;
  }

  onChunk(trackId: string, qualityId: string, cb: ChunkListener): (() => void) | null {
    const task = this.tasks.get(cacheKeyFor(trackId, qualityId));
    return task ? task.onChunk(cb) : null;
  }

  onProgress(trackId: string, qualityId: string, cb: ProgressListener): (() => void) | null {
    const task = this.tasks.get(cacheKeyFor(trackId, qualityId));
    return task ? task.onProgress(cb) : null;
  }

  getTask(trackId: string, qualityId: string): TrackDownloader | null {
    return this.tasks.get(cacheKeyFor(trackId, qualityId)) ?? null;
  }

  /** Arrête un téléchargement en cours sans supprimer les octets déjà en cache (reprise possible). */
  pause(trackId: string, qualityId: string) {
    this.tasks.get(cacheKeyFor(trackId, qualityId))?.pause();
  }

  async readCachedFull(trackId: string, qualityId: string): Promise<ArrayBuffer | null> {
    return opfsReadAll(cacheKeyFor(trackId, qualityId));
  }

  async isFullyCached(trackId: string, qualityId: string): Promise<boolean> {
    const meta = await this.loadMeta();
    return meta.get(cacheKeyFor(trackId, qualityId))?.complete ?? false;
  }

  /** URL de lecture instantanée : blob local si la piste est déjà entièrement en cache,
   *  sinon `null` (l'appelant doit alors retomber sur le streaming réseau brut). */
  async resolvePlaybackUrl(trackId: string, qualityId: string, format: "aac" | "opus" | "mp3"): Promise<string | null> {
    const cachedFull = await this.readCachedFull(trackId, qualityId);
    if (!cachedFull || cachedFull.byteLength === 0) return null;
    const mime = { aac: "audio/aac", opus: "audio/ogg", mp3: "audio/mpeg" }[format];
    return URL.createObjectURL(new Blob([cachedFull], { type: mime }));
  }

  /** Éviction LRU : ne touche jamais aux clés protégées (piste active + fenêtre de préchargement). */
  private async enforceLimit() {
    const meta = await this.loadMeta();
    const total = Array.from(meta.values()).reduce((sum, e) => sum + e.bytesCached, 0);
    if (total <= this.maxBytes) return;

    const evictable = Array.from(meta.values())
      .filter((e) => !this.protectedKeys.has(e.key))
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

    let currentTotal = total;
    for (const entry of evictable) {
      if (currentTotal <= this.maxBytes) break;
      this.tasks.get(entry.key)?.cancel();
      this.tasks.delete(entry.key);
      await opfsDelete(entry.key);
      meta.delete(entry.key);
      this.dirtyKeys.add(entry.key); // flush écrira sa suppression (voir flushMetaToDisk)
      this.indexDirty = true;
      currentTotal -= entry.bytesCached;
    }
    this.persistMeta();
  }

  async currentCacheSize(): Promise<number> {
    const meta = await this.loadMeta();
    return Array.from(meta.values()).reduce((sum, e) => sum + e.bytesCached, 0);
  }

  get maxCacheBytes(): number {
    return this.maxBytes;
  }

  /** Instantané des téléchargements suivis (actifs ou terminés depuis le dernier `clearAll`) —
   *  consommé uniquement par le panneau développeur (voir features/player/debug), en polling :
   *  pas la peine d'un mécanisme réactif dédié pour un outil de diagnostic. */
  debugListTasks(): Array<{
    key: string;
    bytesCached: number;
    totalBytes: number;
    complete: boolean;
    protected: boolean;
    error: string | null;
  }> {
    return Array.from(this.tasks.entries()).map(([key, task]) => ({
      key,
      ...task.progress,
      protected: this.protectedKeys.has(key),
      error: task.error?.message ?? null,
    }));
  }

  async clearAll() {
    const meta = await this.loadMeta();
    const keys = Array.from(meta.keys());
    for (const key of keys) {
      this.tasks.get(key)?.cancel();
      await opfsDelete(key);
    }
    this.tasks.clear();
    this.metaCache = new Map();
    this.dirtyKeys.clear();
    this.indexDirty = false;
    if (this.metaWriteTimer !== null) {
      window.clearTimeout(this.metaWriteTimer);
      this.metaWriteTimer = null;
    }
    await Promise.all([storage.set(META_INDEX_KEY, []), ...keys.map((key) => storage.remove(metaEntryKey(key)))]);
    this.scheduleSizeNotify();
  }
}

export const cacheStore = new CacheStore();
