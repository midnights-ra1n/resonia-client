import { storage } from "../storage";
import { TrackDownloader } from "../audio/cache/trackDownloader";
import { getQualityById } from "../audio/qualityOptions";
import { downloadBlobStore } from "./downloadBlobStore";
import { resolveDownloadSource } from "./resolveDownloadSource";
import { downloadKeyFor, type DownloadedTrackMeta, type DownloadStatus } from "./types";
import type { Track } from "../../stores/playerStore";

const META_INDEX_KEY = "resonia:downloads:meta:index";
const META_ENTRY_PREFIX = "resonia:downloads:meta:entry:";
function metaEntryKey(key: string): string {
  return `${META_ENTRY_PREFIX}${key}`;
}

const SIZE_NOTIFY_THROTTLE_MS = 300;

export interface DownloadProgressInfo {
  bytesDownloaded: number;
  totalBytes: number;
  /** Débit instantané lissé, en octets/seconde — 0 quand non applicable (en attente, erreur,
   *  ou tout juste démarré, avant la première mesure). */
  bytesPerSecond: number;
}

export type StatusListener = (status: DownloadStatus, progress: DownloadProgressInfo) => void;

/** Statistiques agrégées de la "campagne" de téléchargement en cours (depuis que la file est
 *  repartie de vide jusqu'à ce qu'elle se revide) — pour l'indicateur global (barre de menu). */
export interface DownloadBatchStats {
  totalTracks: number;
  completedTracks: number;
  /** Octets — pour les pistes pas encore démarrées, estimés à partir du débit de la qualité
   *  et de la durée (voir `estimateTrackBytes`), puis corrigés dès que la taille réelle est
   *  connue (premier `Content-Range` reçu). */
  totalBytes: number;
  downloadedBytes: number;
  bytesPerSecond: number;
}

export type BatchListener = (stats: DownloadBatchStats | null) => void;

/** Fenêtre minimale entre deux mesures de débit — en dessous, la division bytes/temps est trop
 *  bruitée (chunks très rapprochés) pour donner un débit instantané stable à afficher. */
const SPEED_SAMPLE_MIN_MS = 200;

interface QueuedDownload {
  key: string;
  trackId: string;
  qualityId: string;
  format: DownloadedTrackMeta["format"];
  track: Track;
  streamUrl: string;
}

/** Estimation grossière (débit de la qualité × durée) utilisée tant que la taille réelle du
 *  fichier n'est pas encore connue — permet d'afficher un total plausible pour toute la file
 *  dès l'ajout d'une piste, plutôt que d'attendre que chacune ait démarré son téléchargement. */
function estimateTrackBytes(track: Track, qualityId: string): number {
  const bitRateKbps = getQualityById(qualityId)?.maxBitRate ?? 0;
  if (!bitRateKbps || !track.duration) return 0;
  return ((bitRateKbps * 1000) / 8) * track.duration;
}

/** Gère les téléchargements permanents choisis par l'utilisateur — distinct de `cacheStore`
 *  (cache LRU transitoire) : jamais évincé, une seule piste téléchargée à la fois (demande
 *  explicite), et les métadonnées de piste sont dénormalisées pour permettre l'affichage/la
 *  lecture hors-ligne sans jamais rappeler l'API. */
class DownloadStore {
  private metaCache: Map<string, DownloadedTrackMeta> | null = null;
  private metaLoad: Promise<Map<string, DownloadedTrackMeta>> | null = null;
  private dirtyKeys = new Set<string>();
  private indexDirty = false;
  private metaWriteTimer: number | null = null;

  private queue: QueuedDownload[] = [];
  private currentItem: QueuedDownload | null = null;
  private currentTask: TrackDownloader | null = null;
  private pendingEnqueues = new Set<string>();

  private get currentKey(): string | null {
    return this.currentItem?.key ?? null;
  }

  private sizeListeners = new Set<(bytes: number) => void>();
  private sizeNotifyTimer: number | null = null;
  private statusListeners = new Map<string, Set<StatusListener>>();
  private queueListeners = new Set<() => void>();
  private batchListeners = new Set<BatchListener>();

  // Vit du premier `enqueueTrack` qui trouve la file vide jusqu'à ce qu'elle se revide à
  // nouveau (voir `processNext`) — `null` quand aucun téléchargement n'est en cours.
  private batch: DownloadBatchStats | null = null;

  private async loadMeta(): Promise<Map<string, DownloadedTrackMeta>> {
    if (this.metaCache) return this.metaCache;
    if (!this.metaLoad) {
      this.metaLoad = (async () => {
        const index = await storage.get<string[]>(META_INDEX_KEY);
        const keys = index ?? [];
        const entries = await Promise.all(keys.map((k) => storage.get<DownloadedTrackMeta>(metaEntryKey(k))));
        const map = new Map(
          keys
            .map((k, i) => [k, entries[i]] as const)
            .filter((pair): pair is [string, DownloadedTrackMeta] => pair[1] !== null),
        );
        this.metaCache = map;
        return map;
      })();
    }
    return this.metaLoad;
  }

  private persistMeta() {
    if (!this.metaCache) return;
    this.scheduleSizeNotify();
    if (this.metaWriteTimer !== null) return;
    this.metaWriteTimer = window.setTimeout(() => {
      this.metaWriteTimer = null;
      this.flushMetaToDisk();
    }, 1000);
  }

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

  /** Fusionne `patch` dans l'entrée existante, ou crée une nouvelle entrée à partir de
   *  `base` (obligatoire au premier appel pour une clé donnée — voir `processNext`). */
  private async touch(key: string, patch: Partial<DownloadedTrackMeta>, base?: DownloadedTrackMeta) {
    const meta = await this.loadMeta();
    const existing = meta.get(key);
    if (!existing) this.indexDirty = true;
    const next: DownloadedTrackMeta = { ...(existing ?? base!), ...patch };
    meta.set(key, next);
    this.dirtyKeys.add(key);
    this.persistMeta();
    return next;
  }

  onSizeChange(cb: (bytes: number) => void): () => void {
    this.sizeListeners.add(cb);
    return () => this.sizeListeners.delete(cb);
  }

  private scheduleSizeNotify() {
    if (this.sizeListeners.size === 0 || this.sizeNotifyTimer !== null) return;
    this.sizeNotifyTimer = window.setTimeout(async () => {
      this.sizeNotifyTimer = null;
      const bytes = await this.currentDownloadsSize();
      this.sizeListeners.forEach((cb) => cb(bytes));
    }, SIZE_NOTIFY_THROTTLE_MS);
  }

  onStatusChange(trackId: string, qualityId: string, cb: StatusListener): () => void {
    const key = downloadKeyFor(trackId, qualityId);
    let set = this.statusListeners.get(key);
    if (!set) {
      set = new Set();
      this.statusListeners.set(key, set);
    }
    set.add(cb);
    return () => set!.delete(cb);
  }

  private emitStatus(key: string, status: DownloadStatus, progress: Partial<DownloadProgressInfo> = {}) {
    const full: DownloadProgressInfo = { bytesDownloaded: 0, totalBytes: -1, bytesPerSecond: 0, ...progress };
    this.statusListeners.get(key)?.forEach((cb) => cb(status, full));
  }

  /** Notifie la file d'attente en cours (visible sur la page Téléchargements) — distinct de
   *  `onStatusChange` (par piste) et `onSizeChange` (taille totale). */
  onQueueChange(cb: () => void): () => void {
    this.queueListeners.add(cb);
    return () => this.queueListeners.delete(cb);
  }

  private notifyQueueChange() {
    this.queueListeners.forEach((cb) => cb());
  }

  /** Notifie les statistiques de la campagne de téléchargement en cours (voir `batch`) —
   *  `null` une fois la file entièrement traitée. */
  onBatchChange(cb: BatchListener): () => void {
    this.batchListeners.add(cb);
    return () => this.batchListeners.delete(cb);
  }

  getBatchStats(): DownloadBatchStats | null {
    return this.batch ? { ...this.batch } : null;
  }

  private notifyBatch() {
    const snapshot = this.getBatchStats();
    this.batchListeners.forEach((cb) => cb(snapshot));
  }

  /** Piste en cours de téléchargement + file d'attente, dans l'ordre de traitement — pour
   *  l'affichage "en cours" de la page Téléchargements. */
  getPendingItems(): Array<{ key: string; track: Track; qualityId: string }> {
    const current = this.currentItem ? [{ key: this.currentItem.key, track: this.currentItem.track, qualityId: this.currentItem.qualityId }] : [];
    return [...current, ...this.queue.map((q) => ({ key: q.key, track: q.track, qualityId: q.qualityId }))];
  }

  async getStatus(trackId: string, qualityId: string): Promise<DownloadStatus> {
    const key = downloadKeyFor(trackId, qualityId);
    if (this.currentKey === key) return "downloading";
    if (this.queue.some((q) => q.key === key)) return "queued";
    const meta = await this.loadMeta();
    const entry = meta.get(key);
    if (!entry) return "not-downloaded";
    return entry.complete ? "downloaded" : "error";
  }

  /** Met une piste en file de téléchargement (no-op si déjà téléchargée/en cours/en file).
   *  `pendingEnqueues` marque une clé dès le début de l'appel (avant l'`await` de
   *  `isDownloaded`) : sans ça, deux appels concurrents pour la même piste (double-clic,
   *  bouton album + menu contextuel presque simultanés...) passent tous les deux la
   *  vérification synchrone avant que le premier n'ait eu le temps de pousser dans la file,
   *  et la piste se retrouve mise en file deux fois — retéléchargée une seconde fois juste
   *  après la première, ce qui la fait réapparaître en "en cours" après coup. */
  async enqueueTrack(track: Track, qualityId: string, format: DownloadedTrackMeta["format"], streamUrl: string) {
    const key = downloadKeyFor(track.id, qualityId);
    if (this.currentKey === key || this.queue.some((q) => q.key === key) || this.pendingEnqueues.has(key)) return;
    this.pendingEnqueues.add(key);
    try {
      if (await this.isDownloaded(track.id, qualityId)) return;

      // File vide (et rien en cours) : nouvelle campagne — voir `getBatchStats`/`processNext`.
      if (this.currentItem === null && this.queue.length === 0) {
        this.batch = { totalTracks: 0, completedTracks: 0, totalBytes: 0, downloadedBytes: 0, bytesPerSecond: 0 };
      }
      if (this.batch) {
        this.batch.totalTracks += 1;
        this.batch.totalBytes += estimateTrackBytes(track, qualityId);
        this.notifyBatch();
      }

      this.queue.push({ key, trackId: track.id, qualityId, format, track, streamUrl });
      this.emitStatus(key, "queued", { bytesDownloaded: 0, totalBytes: -1 });
      this.notifyQueueChange();
      this.processNext();
    } finally {
      this.pendingEnqueues.delete(key);
    }
  }

  /** Résout automatiquement la source (qualité active, URL de flux) — point d'entrée utilisé
   *  par l'UI (bouton téléchargement, menu contextuel). Ignore silencieusement une piste dont
   *  la source ne peut pas être résolue (aucun serveur actif, qualité "lossless" non
   *  supportée) plutôt que d'échouer toute une file d'album/playlist pour une seule piste. */
  async enqueueTrackAuto(track: Track) {
    const source = resolveDownloadSource(track);
    if (!source) return;
    await this.enqueueTrack(track, source.qualityId, source.format, source.streamUrl);
  }

  async enqueueTracksAuto(tracks: Track[]) {
    for (const track of tracks) await this.enqueueTrackAuto(track);
  }

  cancelQueued(trackId: string, qualityId: string) {
    const key = downloadKeyFor(trackId, qualityId);
    this.queue = this.queue.filter((q) => q.key !== key);
    if (this.currentKey === key) {
      this.currentTask?.cancel();
    }
    if (this.queue.length === 0 && this.currentItem === null && this.batch) {
      this.batch = null;
      this.notifyBatch();
    }
    this.notifyQueueChange();
  }

  /** Traite la file un téléchargement à la fois — jamais deux en parallèle, sur demande
   *  explicite de l'utilisateur (contrairement au cache, qui peut chevaucher piste active et
   *  préchargement). */
  private async processNext() {
    if (this.currentItem !== null) return;
    const next = this.queue.shift();
    if (!next) {
      // File entièrement traitée : fin de la campagne en cours, l'indicateur global disparaît.
      if (this.batch) {
        this.batch = null;
        this.notifyBatch();
      }
      return;
    }

    this.currentItem = next;
    this.notifyQueueChange();
    await this.touch(
      next.key,
      { bytesDownloaded: 0, complete: false },
      {
        key: next.key,
        trackId: next.trackId,
        qualityId: next.qualityId,
        format: next.format,
        totalBytes: -1,
        bytesDownloaded: 0,
        complete: false,
        downloadedAt: Date.now(),
        track: next.track,
      },
    );

    const task = new TrackDownloader(next.key, next.streamUrl, downloadBlobStore);
    this.currentTask = task;

    // Débit instantané lissé (moyenne mobile exponentielle) à partir des octets/temps entre
    // deux événements de progression — remis à zéro à chaque nouvelle piste (portée locale à
    // ce `processNext`), voir SPEED_SAMPLE_MIN_MS pour le seuil anti-bruit.
    let speedSampleAt = Date.now();
    let speedSampleBytes = 0;
    let smoothedBytesPerSecond = 0;

    // Suivi de la contribution de CETTE piste aux totaux de la campagne (voir `batch`) : le
    // delta de progression (pas la valeur absolue) est ajouté à `downloadedBytes`, et
    // l'estimation initiale de sa taille dans `totalBytes` est corrigée une fois la vraie
    // taille connue (premier `Content-Range`).
    let batchBytesAccounted = 0;
    let batchSizeCorrected = false;
    const estimatedBytes = estimateTrackBytes(next.track, next.qualityId);

    // `task.run()` ne se résout qu'une fois le writer refermé (voir TrackDownloader.run,
    // bloc finally) — une fermeture lente ne doit pas retarder d'autant la sortie de "en
    // cours" : dès que le DERNIER chunk de progression annonce `complete`, les métadonnées
    // sont déjà à jour (la piste apparaît dans `listDownloaded`), donc on avance la file
    // immédiatement plutôt que d'attendre `run()`, sans quoi la piste reste visible à la
    // fois dans "en cours" ET dans la liste des téléchargements terminés.
    let advanced = false;
    const advanceQueue = () => {
      if (advanced || this.currentItem !== next) return;
      advanced = true;
      this.currentItem = null;
      this.currentTask = null;
      this.notifyQueueChange();
      this.processNext();
    };

    task.onProgress((progress) => {
      const now = Date.now();
      const elapsedMs = now - speedSampleAt;
      if (elapsedMs >= SPEED_SAMPLE_MIN_MS) {
        const instantBytesPerSecond = ((progress.bytesCached - speedSampleBytes) / elapsedMs) * 1000;
        smoothedBytesPerSecond =
          smoothedBytesPerSecond === 0 ? instantBytesPerSecond : smoothedBytesPerSecond * 0.7 + instantBytesPerSecond * 0.3;
        speedSampleAt = now;
        speedSampleBytes = progress.bytesCached;
      }

      this.touch(next.key, {
        bytesDownloaded: progress.bytesCached,
        totalBytes: progress.totalBytes,
        complete: progress.complete,
        ...(progress.complete ? { downloadedAt: Date.now() } : {}),
      });
      this.emitStatus(next.key, progress.complete ? "downloaded" : "downloading", {
        bytesDownloaded: progress.bytesCached,
        totalBytes: progress.totalBytes,
        bytesPerSecond: Math.max(0, smoothedBytesPerSecond),
      });

      if (this.batch) {
        if (!batchSizeCorrected && progress.totalBytes > 0) {
          this.batch.totalBytes += progress.totalBytes - estimatedBytes;
          batchSizeCorrected = true;
        }
        this.batch.downloadedBytes += progress.bytesCached - batchBytesAccounted;
        batchBytesAccounted = progress.bytesCached;
        this.batch.bytesPerSecond = Math.max(0, smoothedBytesPerSecond);
        if (progress.complete) this.batch.completedTracks += 1;
        this.notifyBatch();
      }

      if (progress.complete) advanceQueue();
    });

    await task.run();

    if (!task.isComplete && task.error) {
      this.emitStatus(next.key, "error", { bytesDownloaded: task.progress.bytesCached, totalBytes: task.progress.totalBytes });
    }

    advanceQueue();
  }

  async removeDownload(trackId: string, qualityId: string) {
    const key = downloadKeyFor(trackId, qualityId);
    this.cancelQueued(trackId, qualityId);
    const meta = await this.loadMeta();
    if (!meta.has(key)) return;
    await downloadBlobStore.deleteFile(key);
    meta.delete(key);
    this.dirtyKeys.add(key);
    this.indexDirty = true;
    this.persistMeta();
    this.emitStatus(key, "not-downloaded", { bytesDownloaded: 0, totalBytes: -1 });
  }

  async clearAll() {
    this.queue = [];
    this.currentTask?.cancel();
    this.currentTask = null;
    this.currentItem = null;
    this.notifyQueueChange();
    if (this.batch) {
      this.batch = null;
      this.notifyBatch();
    }
    const meta = await this.loadMeta();
    const keys = Array.from(meta.keys());
    for (const key of keys) await downloadBlobStore.deleteFile(key);
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

  async isDownloaded(trackId: string, qualityId: string): Promise<boolean> {
    const meta = await this.loadMeta();
    return meta.get(downloadKeyFor(trackId, qualityId))?.complete ?? false;
  }

  async readDownloadedFull(trackId: string, qualityId: string): Promise<ArrayBuffer | null> {
    return downloadBlobStore.readAll(downloadKeyFor(trackId, qualityId));
  }

  /** URL de lecture instantanée si la piste est entièrement téléchargée, sinon `null`. */
  async resolvePlaybackUrl(trackId: string, qualityId: string, format: "aac" | "opus" | "mp3"): Promise<string | null> {
    const meta = await this.loadMeta();
    const entry = meta.get(downloadKeyFor(trackId, qualityId));
    if (!entry?.complete) return null;
    const full = await this.readDownloadedFull(trackId, qualityId);
    if (!full || full.byteLength === 0) return null;
    const mime = { aac: "audio/aac", opus: "audio/ogg", mp3: "audio/mpeg" }[format];
    return URL.createObjectURL(new Blob([full], { type: mime }));
  }

  async listDownloaded(): Promise<DownloadedTrackMeta[]> {
    const meta = await this.loadMeta();
    return Array.from(meta.values())
      .filter((e) => e.complete)
      .sort((a, b) => b.downloadedAt - a.downloadedAt);
  }

  async currentDownloadsSize(): Promise<number> {
    const meta = await this.loadMeta();
    return Array.from(meta.values()).reduce((sum, e) => sum + Math.max(0, e.bytesDownloaded), 0);
  }

  /** Utilisé par les garde-fous hors-ligne : une piste téléchargée est disponible localement,
   *  qu'elle soit ou non entièrement dénormalisée en `listDownloaded`. */
  async hasAnyEntry(trackId: string): Promise<boolean> {
    const meta = await this.loadMeta();
    return Array.from(meta.values()).some((e) => e.trackId === trackId && e.complete);
  }
}

export const downloadStore = new DownloadStore();
