import { storage } from "../../storage";
import { TrackDownloader, type ChunkListener } from "./trackDownloader";
import { cacheKeyFor, type CacheEntryMeta, type DownloadPriority, type ProgressListener } from "./types";
import { opfsDelete, opfsReadAll } from "./opfsStore";

const META_KEY = "resonia:cache:meta";
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 Go

class CacheStore {
  private tasks = new Map<string, TrackDownloader>();
  private metaCache: Map<string, CacheEntryMeta> | null = null;
  private metaLoad: Promise<Map<string, CacheEntryMeta>> | null = null;
  // Piste active + fenêtre de préchargement en cours : jamais évincées tant qu'elles sont
  // dans cet ensemble, même si elles deviennent la moins récemment utilisées.
  private protectedKeys = new Set<string>();
  private maxBytes = DEFAULT_MAX_BYTES;

  setMaxBytes(bytes: number) {
    this.maxBytes = bytes;
  }

  setProtectedKeys(keys: string[]) {
    this.protectedKeys = new Set(keys);
  }

  private async loadMeta(): Promise<Map<string, CacheEntryMeta>> {
    if (this.metaCache) return this.metaCache;
    if (!this.metaLoad) {
      this.metaLoad = (async () => {
        const entries = (await storage.get<CacheEntryMeta[]>(META_KEY)) ?? [];
        const map = new Map(entries.map((e) => [e.key, e]));
        this.metaCache = map;
        return map;
      })();
    }
    return this.metaLoad;
  }

  private async persistMeta() {
    if (!this.metaCache) return;
    await storage.set(META_KEY, Array.from(this.metaCache.values()));
  }

  private async touch(key: string, patch: Partial<CacheEntryMeta>) {
    const meta = await this.loadMeta();
    const existing = meta.get(key) ?? {
      key,
      totalBytes: -1,
      bytesCached: 0,
      complete: false,
      lastAccessedAt: Date.now(),
    };
    meta.set(key, { ...existing, ...patch, lastAccessedAt: Date.now() });
    await this.persistMeta();
  }

  /** Récupère (ou crée) le downloader pour une clé donnée. Un seul writer OPFS par fichier. */
  private getOrCreateTask(trackId: string, qualityId: string, streamUrl: string): TrackDownloader {
    const key = cacheKeyFor(trackId, qualityId);
    let task = this.tasks.get(key);
    if (!task) {
      task = new TrackDownloader(key, streamUrl);
      task.onProgress((progress) => {
        this.touch(key, {
          bytesCached: progress.bytesCached,
          totalBytes: progress.totalBytes,
          complete: progress.complete,
        });
        if (progress.complete) this.enforceLimit();
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
      currentTotal -= entry.bytesCached;
    }
    await this.persistMeta();
  }

  async currentCacheSize(): Promise<number> {
    const meta = await this.loadMeta();
    return Array.from(meta.values()).reduce((sum, e) => sum + e.bytesCached, 0);
  }

  async clearAll() {
    const meta = await this.loadMeta();
    for (const key of meta.keys()) {
      this.tasks.get(key)?.cancel();
      await opfsDelete(key);
    }
    this.tasks.clear();
    this.metaCache = new Map();
    await this.persistMeta();
  }
}

export const cacheStore = new CacheStore();
