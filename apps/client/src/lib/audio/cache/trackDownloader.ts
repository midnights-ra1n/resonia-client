import { EndOfStreamError, fetchRange } from "./rangeFetcher";
import { createOpfsWriter, opfsFileSize } from "./opfsStore";
import type { DownloadPriority, ProgressListener } from "./types";
import type { BlobWriter } from "../../storage/blobStore";
import { debugLog } from "../debug/audioDebugLogger";

export interface ChunkEvent {
  data: ArrayBuffer;
  rangeStart: number;
}
export type ChunkListener = (chunk: ChunkEvent) => void;

/** Télécharge un fichier par chunks vers OPFS, reprenable, pausable, à budget optionnel.
 *  Un seul `TrackDownloader` doit exister par clé de cache à la fois (garanti par
 *  `cacheStore`) : c'est le seul writer OPFS pour ce fichier. */
export class TrackDownloader {
  readonly key: string;
  private streamUrl: string;
  private controller = new AbortController();
  private listeners = new Set<ProgressListener>();
  private chunkListeners = new Set<ChunkListener>();
  private bytesCached = 0;
  private totalBytes = -1;
  private complete = false;
  private running = false;
  private budgetBytes: number | null = null; // null = illimité (piste active)
  private lastError: Error | null = null;

  constructor(key: string, streamUrl: string) {
    this.key = key;
    this.streamUrl = streamUrl;
  }

  get progress(): { bytesCached: number; totalBytes: number; complete: boolean } {
    return { bytesCached: this.bytesCached, totalBytes: this.totalBytes, complete: this.complete };
  }

  get isComplete(): boolean {
    return this.complete;
  }

  get error(): Error | null {
    return this.lastError;
  }

  get isBudgetExhausted(): boolean {
    return this.budgetBytes !== null && this.bytesCached >= this.budgetBytes;
  }

  onProgress(cb: ProgressListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onChunk(cb: ChunkListener): () => void {
    this.chunkListeners.add(cb);
    return () => this.chunkListeners.delete(cb);
  }

  private emit() {
    const progress = { bytesCached: this.bytesCached, totalBytes: this.totalBytes, complete: this.complete };
    this.listeners.forEach((cb) => cb(progress));
  }

  setPriority(priority: DownloadPriority, budgetBytes?: number) {
    // budgetBytes omis = illimité (téléchargement complet), qu'il s'agisse de la piste
    // active ou d'un créneau de préchargement — seul un budget explicite le plafonne.
    this.budgetBytes = priority === "active" || budgetBytes === undefined ? null : budgetBytes;
  }

  /** Arrête le téléchargement en cours sans perdre les octets déjà écrits (reprise possible). */
  pause() {
    if (!this.running) return;
    this.controller.abort();
    this.controller = new AbortController();
    this.running = false;
  }

  cancel() {
    this.pause();
    this.listeners.clear();
    this.chunkListeners.clear();
  }

  async run(): Promise<void> {
    if (this.running || this.complete) return;
    this.running = true;
    this.lastError = null;

    // L'ouverture OPFS elle-même doit être dans le try : si elle échoue (permission,
    // support partiel du navigateur/webview...), `running` doit repasser à `false` dans le
    // finally, sinon cette piste reste bloquée "en cours" pour toujours et plus aucun octet
    // n'est jamais mis en cache pour elle (ni retry possible).
    let writer: BlobWriter | null = null;
    try {
      this.bytesCached = await opfsFileSize(this.key);
      writer = await createOpfsWriter(this.key);
      // .seek() une fois puis des write(data) séquentiels : support plus large/fiable
      // (notamment WebKit) que la forme composite { type: "write", position, data }
      // pour un flux qui n'a de toute façon jamais besoin d'écritures aléatoires.
      await writer.seek(this.bytesCached);

      while (this.running) {
        if (this.isBudgetExhausted) {
          debugLog("download:budget-exhausted", { key: this.key, bytesCached: this.bytesCached, budgetBytes: this.budgetBytes });
          break;
        }

        const chunk = await fetchRange(this.streamUrl, this.bytesCached, this.controller.signal);
        if (this.totalBytes === -1) this.totalBytes = chunk.totalBytes;

        const rangeStart = this.bytesCached;
        await writer.write(chunk.data);
        this.bytesCached += chunk.data.byteLength;

        this.chunkListeners.forEach((cb) => cb({ data: chunk.data, rangeStart }));

        if (this.totalBytes > 0 && this.bytesCached >= this.totalBytes) {
          this.complete = true;
          debugLog("download:complete", { key: this.key, totalBytes: this.totalBytes });
        }

        this.emit();
        if (this.complete) break;
      }
    } catch (err) {
      if (err instanceof EndOfStreamError) {
        // Le transcodage à la volée peut sous/sur-estimer la taille réelle du flux :
        // un 416 signifie simplement qu'il n'y a plus rien à lire, fin normale.
        this.totalBytes = this.bytesCached;
        this.complete = true;
        this.emit();
      } else if ((err as Error).name !== "AbortError") {
        this.lastError = err as Error;
        console.warn(
          `[cache] Téléchargement interrompu pour ${this.key} (${(err as Error).name}: ${(err as Error).message}) — ${this.bytesCached} octets déjà écrits`,
          err,
        );
      }
    } finally {
      if (writer) await writer.close();
      this.running = false;
    }
  }
}
