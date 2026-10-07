import { EndOfStreamError, SlowStreamError, TruncatedStreamError, isTransientStreamError, streamRange } from "./rangeFetcher";
import type { DownloadPriority, ProgressListener } from "./types";
import type { BlobStore, BlobWriter } from "../../storage/blobStore";
import { networkDebugLog } from "../debug/audioDebugLogger";
import { SuspendController } from "./suspendController";

const MAX_RETRIES = 3;
// Relances sur une autre connexion après une connexion lente (voir SlowStreamError), par run.
const MAX_SLOW_RECONNECTS = 2;
const BASE_RETRY_DELAY_MS = 500;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/** Télécharge un fichier par chunks vers OPFS, reprenable, pausable, à budget optionnel.
 *  Un seul `TrackDownloader` doit exister par clé de cache à la fois (garanti par
 *  `cacheStore`) : c'est le seul writer OPFS pour ce fichier. */
export class TrackDownloader {
  readonly key: string;
  private streamUrl: string;
  private store: BlobStore;
  private controller = new AbortController();
  private listeners = new Set<ProgressListener>();
  private bytesCached = 0;
  private totalBytes = -1;
  private complete = false;
  private running = false;
  private budgetBytes: number | null = null; // null = illimité (piste active)
  private lastError: Error | null = null;
  // Se résout une fois le writer OPFS du run() en cours refermé — voir le commentaire dans
  // `run()` : `pause()` remet `running` à `false` de façon SYNCHRONE alors que la fermeture
  // du writer (dans le `finally` ci-dessous) reste asynchrone. Sans cette barrière, un
  // pause() suivi d'un resume() très rapproché (ex: pression réseau qui se relâche presque
  // aussitôt pendant la lecture de la piste active) peut ouvrir un DEUXIÈME writer OPFS sur
  // le même fichier avant que le premier n'ait fini de se refermer — deux flux `createWritable`
  // concurrents sur le même fichier peuvent silencieusement s'écraser l'un l'autre à la
  // fermeture (sémantique "fichier miroir" de l'API), corrompant les derniers octets déjà en
  // cache. Perçu à la lecture comme un bref retour en arrière (~0,2s) puis une reprise
  // normale — précisément quand du réseau est sollicité en tâche de fond pendant la lecture.
  private closing: Promise<void> | null = null;
  // Pause douce (voir SuspendSignal) : la connexion reste ouverte, sa position est conservée.
  private suspension = new SuspendController();
  // Point de reprise connu de l'appelant (métadonnées persistées du cache), voir `run()`.
  private knownBytes: (() => Promise<number | null>) | undefined;

  constructor(key: string, streamUrl: string, store: BlobStore, knownBytes?: () => Promise<number | null>) {
    this.key = key;
    this.streamUrl = streamUrl;
    this.store = store;
    this.knownBytes = knownBytes;
  }

  // Plages parallèles autorisées au prochain run (bureau), voir PrefetchScheduler.
  private maxSegments: number | undefined;

  setMaxSegments(maxSegments: number) {
    this.maxSegments = maxSegments;
  }

  /** Taille exacte annoncée par une réponse 206 : une reprise ne coûte qu'une requête par plage.
   *  Faux pour un flux transcodé à la volée (200, taille inconnue jusqu'à la fin), dont la reprise
   *  impose de tout retélécharger depuis l'octet 0. */
  get isRangeResumable(): boolean {
    return this.totalBytes > 0 && !this.complete;
  }

  get isSuspended(): boolean {
    return this.suspension.suspended;
  }

  /** Suspend (ou reprend) la lecture du flux sans fermer la connexion — voir SuspendSignal. */
  setSuspended(suspended: boolean) {
    if (suspended === this.suspension.suspended) return;
    networkDebugLog(suspended ? "download:suspended" : "download:unsuspended", { key: this.key, bytesCached: this.bytesCached });
    this.suspension.set(suspended);
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

  get isRunning(): boolean {
    return this.running;
  }

  /** Se résout dès que ce téléchargement ne tourne plus, quelle qu'en soit la raison (fini,
   *  budget atteint, pause, erreur) — immédiatement s'il ne tourne pas. */
  whenIdle(): Promise<void> {
    return this.closing ?? Promise.resolve();
  }

  get isBudgetExhausted(): boolean {
    return this.budgetBytes !== null && this.bytesCached >= this.budgetBytes;
  }

  onProgress(cb: ProgressListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
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
  }

  async run(): Promise<void> {
    if (this.running || this.complete) return;
    // Attend la fermeture d'un éventuel writer encore en cours de fermeture (pause() très
    // récent) avant d'en ouvrir un nouveau — voir le commentaire sur `closing`.
    if (this.closing) await this.closing;
    if (this.running || this.complete) return; // état ayant pu changer pendant l'attente

    this.running = true;
    this.lastError = null;
    // Capturé MAINTENANT : un pause() pendant l'une des attentes ci-dessous remplace
    // `this.controller` par un neuf — relire `this.controller.signal` après coup donnait un signal
    // jamais annulé, et le téléchargement continuait en fantôme malgré la pause.
    const runSignal = this.controller.signal;

    let resolveClosing: () => void = () => {};
    this.closing = new Promise((resolve) => {
      resolveClosing = resolve;
    });

    // L'ouverture OPFS elle-même doit être dans le try : si elle échoue (permission,
    // support partiel du navigateur/webview...), `running` doit repasser à `false` dans le
    // finally, sinon cette piste reste bloquée "en cours" pour toujours et plus aucun octet
    // n'est jamais mis en cache pour elle (ni retry possible).
    let writer: BlobWriter | null = null;
    try {
      this.bytesCached = await this.resumePosition();
      if (runSignal.aborted) return;
      if (this.store.download) {
        await this.runDelegated(this.store.download.bind(this.store), runSignal);
        return;
      }
      writer = await this.store.createWriter(this.key);
      // .seek() une fois puis des write(data) séquentiels : support plus large/fiable
      // (notamment WebKit) que la forme composite { type: "write", position, data }
      // pour un flux qui n'a de toute façon jamais besoin d'écritures aléatoires.
      await writer.seek(this.bytesCached);
      if (runSignal.aborted) return;
      const activeWriter = writer;

      // Une seule requête par tentative (voir streamRange) ; une coupure en cours de route reprend
      // à `bytesCached`, avec un backoff exponentiel. Le compteur d'essais est remis à zéro dès
      // qu'un octet arrive : seuls des échecs CONSÉCUTIFS épuisent les tentatives.
      let attempt = 0;
      let slowReconnects = 0;
      while (this.running && !this.complete) {
        if (this.isBudgetExhausted) {
          networkDebugLog("download:budget-exhausted", { key: this.key, bytesCached: this.bytesCached, budgetBytes: this.budgetBytes });
          break;
        }
        const signal = runSignal;
        networkDebugLog("download:start", { key: this.key, from: this.bytesCached, attempt });
        try {
          const finished = await streamRange(
            this.streamUrl,
            this.bytesCached,
            signal,
            {
              onTotal: (total) => {
                if (this.totalBytes === -1 && total > 0) this.totalBytes = total;
              },
              onData: async (data) => {
                const rangeStart = this.bytesCached;
                await activeWriter.write(data);
                this.bytesCached += data.byteLength;
                attempt = 0;
                networkDebugLog("chunk:read", { key: this.key, bytes: data.byteLength, rangeStart, bytesCached: this.bytesCached });
                if (this.totalBytes > 0 && this.bytesCached >= this.totalBytes) {
                  this.complete = true;
                  networkDebugLog("download:complete", { key: this.key, totalBytes: this.totalBytes });
                }
                this.emit();
                return this.running && !this.complete && !this.isBudgetExhausted;
              },
            },
            this.suspension,
            slowReconnects < MAX_SLOW_RECONNECTS,
          );
          if (!finished || this.complete) continue;
          // Flux lu jusqu'au bout : si le serveur annonçait une taille, elle doit être atteinte —
          // sinon c'est une coupure propre en cours de route, à reprendre.
          if (this.totalBytes > 0 && this.bytesCached < this.totalBytes) throw new TruncatedStreamError();
          this.totalBytes = this.bytesCached;
          this.complete = true;
          networkDebugLog("download:complete", { key: this.key, totalBytes: this.totalBytes });
          this.emit();
        } catch (err) {
          if (err instanceof EndOfStreamError) {
            // Le transcodage à la volée peut sous/sur-estimer la taille réelle du flux :
            // un 416 signifie simplement qu'il n'y a plus rien à lire, fin normale.
            this.totalBytes = this.bytesCached;
            this.complete = true;
            this.emit();
            break;
          }
          if (signal.aborted) break; // pause()/cancel() volontaire
          if (err instanceof SlowStreamError) {
            slowReconnects++;
            networkDebugLog("download:slow-reconnect", { key: this.key, attempt: slowReconnects, error: err.message });
            continue; // relance immédiate, sur une autre connexion
          }
          if (!isTransientStreamError(err) || attempt >= MAX_RETRIES) throw err;
          attempt++;
          networkDebugLog("chunk:retry", { key: this.key, attempt, error: String((err as Error)?.message ?? err) });
          await sleep(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), signal);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        this.lastError = err as Error;
        networkDebugLog("download:error", { key: this.key, error: (err as Error).message, bytesCached: this.bytesCached });
        console.warn(
          `[cache] Téléchargement interrompu pour ${this.key} (${(err as Error).name}: ${(err as Error).message}) — ${this.bytesCached} octets déjà écrits`,
          err,
        );
      }
    } finally {
      if (writer) await writer.close();
      this.running = false;
      this.closing = null;
      resolveClosing();
    }
  }

  /** Octet à partir duquel reprendre. La taille du fichier sur disque ne suffit PAS sur bureau :
   *  le process principal y écrit plusieurs plages en parallèle (voir runDelegated), si bien qu'un
   *  fichier interrompu peut être plus long que ses octets réellement contigus — reprendre à sa
   *  taille laissait des trous remplis de zéros, et une plage finale déjà terminée faisait même
   *  répondre 416 au serveur : piste marquée « complète » mais corrompue (décodage impossible,
   *  enchaînement gapless retombant sur un rechargement réseau). On reprend donc au préfixe
   *  contigu connu (progression en mémoire, sinon métadonnées persistées), borné par le disque. */
  private async resumePosition(): Promise<number> {
    const onDisk = await this.store.fileSize(this.key);
    if (!this.store.download) return onDisk; // web : écriture strictement séquentielle
    const known = this.bytesCached > 0 ? this.bytesCached : ((await this.knownBytes?.()) ?? 0);
    return Math.min(onDisk, known);
  }

  /** Bureau : le téléchargement (plusieurs plages en parallèle, écriture directe sur disque,
   *  reprises) est fait par le process principal — voir `BlobStore.download`. Ici, on ne fait que
   *  refléter sa progression. */
  private async runDelegated(
    download: NonNullable<BlobStore["download"]>,
    signal: AbortSignal,
  ) {
    networkDebugLog("download:start", { key: this.key, from: this.bytesCached, via: "process principal" });
    const result = await download(this.key, this.streamUrl, this.bytesCached, signal, {
      onProgress: (bytes, total, received) => {
        if (total > 0) this.totalBytes = total;
        if (received > 0) {
          networkDebugLog("chunk:read", { key: this.key, bytes: received, rangeStart: this.bytesCached, bytesCached: bytes });
        }
        this.bytesCached = bytes;
        this.emit();
      },
    }, this.suspension, { maxSegments: this.maxSegments });
    this.bytesCached = result.bytes;
    if (result.total > 0) this.totalBytes = result.total;
    if (result.complete) {
      this.totalBytes = this.bytesCached;
      this.complete = true;
      networkDebugLog("download:complete", { key: this.key, totalBytes: this.totalBytes });
      this.emit();
      return;
    }
    if (result.error && !signal.aborted) throw new Error(result.error);
  }
}
