import { cacheStore } from "./cacheStore";
import { cacheKeyFor } from "./types";
import { networkDebugLog } from "../debug/audioDebugLogger";
import type { NetworkMode } from "../engine/gaplessEngine";
import { isElectron } from "../../platform";
import { isForegroundBusy, onForegroundBusyChange } from "../../network/foregroundActivity";

// Pistes suivantes mises en cache par défaut (réglable, voir setPrefetchCount).
export const DEFAULT_PREFETCH_COUNT = 3;
// Pistes quittées dont le téléchargement d'un flux transcodé est resté partiel : leur connexion est
// gardée (suspendue) pour être terminée après la fenêtre, au lieu d'être coupée — un flux transcodé
// ne se reprend pas à l'octet près (le serveur repart de l'octet 0, voir rangeFetcher), si bien que
// revenir sur la piste retéléchargeait tout depuis le début.
const MAX_LEFTOVERS = 2;

// Téléchargements simultanés : la piste active ET la suivante démarrent ensemble. Les serveurs
// derrière un proxy plafonnent souvent le débit PAR connexion (mesuré : ~50 Ko/s chacune, qui
// s'additionnent) — en strict séquentiel, la piste suivante n'était prête qu'après la fin de la
// piste courante, et l'enchaînement retombait sur un rechargement réseau (coupure + attente). La
// piste en cours reste prioritaire : la pression réseau du moteur (hystérésis sur l'avance du
// tampon de lecture) suspend tout dès que cette avance baisse.
const MAX_CONCURRENT = 2;
// Plages parallèles par fichier (bureau, voir `downloads` dans electron/main/index.ts).
const MAX_SEGMENTS = 3;
// Relances d'une piste dont le téléchargement a échoué : sans limite tant qu'elle reste dans la
// fenêtre (réseau faible = on insiste), espacées de 5 s, 10 s, 20 s… 60 s au plus. Le retour du
// réseau (événement "online") les relance aussitôt.
const SLOT_RETRY_DELAY_MS = 5000;
const SLOT_RETRY_MAX_DELAY_MS = 60000;
const FEED_RETRY_DELAY_MS = 1000;

// Tant que le flux lu télécharge encore ("shared") : une connexion sans découpage pour la piste
// active ET une pour la suivante. En strict séquentiel, la suivante n'était prête qu'une fois la
// piste en cours entièrement en cache — trop tard sur un serveur lent, et l'enchaînement gapless
// retombait sur un rechargement réseau (coupure). Le flux lu reste prioritaire : la pression
// réseau du moteur suspend tout dès que son avance baisse.
const LIMITS: Record<Exclude<NetworkMode, "exclusive">, { concurrent: number; segments: number }> = {
  shared: { concurrent: 2, segments: 1 },
  free: { concurrent: MAX_CONCURRENT, segments: MAX_SEGMENTS },
};

export interface UpcomingTrack {
  trackId: string;
  streamUrl: string;
}

interface QueueSlot {
  trackId: string;
  streamUrl: string;
  priority: "active" | "prefetch";
}

/** File de priorité unifiée : la piste active passe toujours en premier, suivie des 3
 *  pistes suivantes — toutes téléchargées intégralement (pas de budget partiel) pour que
 *  le passage à la piste suivante tape directement dans le cache disque plutôt que de
 *  retomber sur un nouveau fetch réseau. Au plus MAX_CONCURRENT connexions à la fois, dans
 *  l'ordre de priorité, et aucune tant que le flux de lecture en cours n'a pas assez d'avance
 *  (pause()/resume(), pilotés par la pression réseau du moteur). */
class PrefetchScheduler {
  private qualityId = "aac-256";
  private prefetchCount = DEFAULT_PREFETCH_COUNT;
  // Piste active + suivantes (fenêtre demandée par le lecteur).
  private window: QueueSlot[] = [];
  // Voir MAX_LEFTOVERS : terminées après la fenêtre, la plus récemment quittée d'abord.
  private leftovers: QueueSlot[] = [];
  // Ordre de travail des workers : fenêtre puis restes.
  private slots: QueueSlot[] = [];
  private cursor = 0;
  private paused = false;
  // Chaque (re)démarrage de la file incrémente ce numéro : un worker encore en attente d'un
  // téléchargement abandonne dès son réveil s'il a été remplacé entre-temps. Sans ce jeton, une
  // boucle bloquée sur une tâche mise en pause (changement de piste) ne se terminait jamais et
  // empêchait toute nouvelle boucle de démarrer — plus aucun préchargement, donc plus de gapless.
  private generation = 0;
  // Pistes en cours de téléchargement par les workers : les seules autorisées à utiliser le réseau.
  private inFlight = new Set<string>();
  // Workers en attente de la fin d'une pause (voir waitUntilResumed).
  private resumeWaiters = new Set<() => void>();
  private limits = LIMITS.free;
  // Piste dont le téléchargement alimente la lecture en cours (voir setFeed) : jamais suspendue.
  private feedTrackId: string | null = null;
  // Dernier mode demandé par le moteur, combiné à l'activité de premier plan (voir applyMode).
  private engineMode: NetworkMode = "free";

  constructor() {
    // Web uniquement : une seule connexion HTTP/2 partagée avec les pages (voir
    // foregroundActivity). Sur bureau, HTTP/2 est désactivé et les téléchargements passent par
    // leurs propres connexions (session dédiée du process principal) — rien à céder aux pages.
    if (!isElectron()) onForegroundBusyChange(() => this.applyMode());
    if (typeof window !== "undefined") window.addEventListener("online", () => this.wakeRetries());
  }

  // Attentes de relance en cours (voir runWorker) : réveillées dès que le réseau revient.
  private retryWaiters = new Set<() => void>();

  private wakeRetries() {
    const waiters = [...this.retryWaiters];
    this.retryWaiters.clear();
    waiters.forEach((wake) => wake());
  }

  private retryAttempt = 0;
  private retryScheduled = false;

  private scheduleRetry(generation: number, fast = false) {
    if (this.retryScheduled) return;
    this.retryScheduled = true;
    // Source de la lecture en cours : relancée vite (la lecture attend ces octets).
    void (fast ? this.waitRetryMs(FEED_RETRY_DELAY_MS) : this.waitRetry(this.retryAttempt++)).then(() => {
      this.retryScheduled = false;
      if (generation === this.generation) this.restart();
    });
  }

  private waitRetry(retry: number): Promise<void> {
    return this.waitRetryMs(Math.min(SLOT_RETRY_DELAY_MS * 2 ** retry, SLOT_RETRY_MAX_DELAY_MS));
  }

  private waitRetryMs(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.retryWaiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, delayMs);
      this.retryWaiters.add(done);
    });
  }

  /** Usage réseau permis par le flux en cours de lecture (voir NetworkMode côté moteur). */
  setNetworkMode(mode: NetworkMode) {
    this.engineMode = mode;
    this.applyMode();
  }

  private applyMode() {
    const foregroundBusy = !isElectron() && isForegroundBusy();
    const mode: NetworkMode = foregroundBusy ? "exclusive" : this.engineMode;
    if (foregroundBusy) networkDebugLog("prefetch:yield-to-page", { inFlight: [...this.inFlight] });
    if (mode === "exclusive") {
      this.pause();
      return;
    }
    const limits = LIMITS[mode];
    const changed = limits !== this.limits;
    // Plus de plages parallèles permises : les fichiers à plages en cours sont relancés (reprise à
    // l'octet près, une requête) pour en profiter — sinon ils finissaient sur une seule connexion.
    if (changed && limits.segments > this.limits.segments) {
      for (const trackId of [...this.inFlight]) {
        if (trackId === this.feedTrackId || !cacheStore.isRangeResumable(trackId, this.qualityId)) continue;
        cacheStore.pause(trackId, this.qualityId);
        this.inFlight.delete(trackId);
      }
    }
    this.limits = limits;
    if (this.paused) this.resume();
    else if (changed) this.restart();
  }

  setQuality(qualityId: string) {
    if (qualityId === this.qualityId) return;
    this.dropLeftovers();
    this.qualityId = qualityId;
  }

  /** La lecture en cours lit ce fichier au fil de son téléchargement (lecture progressive) : il
   *  n'est jamais suspendu par la pression réseau — c'est lui que la pression protège. */
  setFeed(trackId: string | null) {
    this.feedTrackId = trackId;
  }

  setPrefetchCount(count: number) {
    this.prefetchCount = Math.max(1, Math.floor(count));
  }

  /** Téléchargement partiel d'un flux transcodé (non reprenable à l'octet près) encore ouvert. */
  private isUnresumablePartial(trackId: string): boolean {
    const task = cacheStore.getTask(trackId, this.qualityId);
    return !!task && task.isRunning && !task.isComplete && !task.isRangeResumable && task.progress.bytesCached > 0;
  }

  /** Cède le réseau sans perdre un flux transcodé partiel : suspendu (connexion gardée) plutôt
   *  que coupé. Les fichiers à plages, eux, reprennent à l'octet près : coupés net. */
  private release(trackId: string) {
    if (this.isUnresumablePartial(trackId)) cacheStore.setSuspended(trackId, this.qualityId, true);
    else cacheStore.pause(trackId, this.qualityId);
  }

  private dropLeftovers() {
    this.leftovers.forEach((s) => cacheStore.pause(s.trackId, this.qualityId));
    this.leftovers = [];
  }

  /** Nouvelle fenêtre : les pistes qui en sortent avec un flux transcodé partiel passent en restes. */
  private setWindow(window: QueueSlot[]) {
    const kept = new Set(window.map((s) => s.trackId));
    const leaving = this.window.filter((s) => !kept.has(s.trackId) && this.isUnresumablePartial(s.trackId));
    const leftovers = [...leaving.map((s) => ({ ...s, priority: "prefetch" as const })), ...this.leftovers].filter(
      (s, i, all) => !kept.has(s.trackId) && all.findIndex((o) => o.trackId === s.trackId) === i,
    );
    leftovers.slice(MAX_LEFTOVERS).forEach((s) => cacheStore.pause(s.trackId, this.qualityId));
    this.leftovers = leftovers.slice(0, MAX_LEFTOVERS);
    // Hors des workers jusqu'à leur tour : gardés suspendus, sans compter dans les connexions actives.
    for (const s of this.leftovers) {
      if (this.inFlight.delete(s.trackId)) cacheStore.setSuspended(s.trackId, this.qualityId, true);
    }
    this.window = window;
    this.slots = [...window, ...this.leftovers];
  }

  private syncProtectedKeys() {
    cacheStore.setProtectedKeys(this.slots.map((s) => cacheKeyFor(s.trackId, this.qualityId)));
  }

  /** Remplace la piste active (`null` : aucune à télécharger, ex. piste déjà téléchargée). Le
   *  téléchargement d'une piste quittée est interrompu — inutile de continuer à la mettre en cache. */
  setActive(track: UpcomingTrack | null) {
    const upcoming = this.window.slice(this.activeSlot ? 1 : 0);
    this.replaceSlots(
      track ? [{ trackId: track.trackId, streamUrl: track.streamUrl, priority: "active" }, ...upcoming] : upcoming,
    );
  }

  setUpcoming(tracks: UpcomingTrack[]) {
    const active = this.activeSlot;
    const upcoming: QueueSlot[] = tracks.slice(0, this.prefetchCount).map((t) => ({
      trackId: t.trackId,
      streamUrl: t.streamUrl,
      priority: "prefetch",
    }));
    this.replaceSlots(active ? [active, ...upcoming] : upcoming);
  }

  private get activeSlot(): QueueSlot | undefined {
    return this.window[0]?.priority === "active" ? this.window[0] : undefined;
  }

  private replaceSlots(slots: QueueSlot[]) {
    this.setWindow(slots);
    this.retryAttempt = 0;
    this.syncProtectedKeys();
    this.restart();
  }

  private pauseInFlight(keep: Set<string> = new Set()) {
    for (const trackId of this.inFlight) {
      if (!keep.has(trackId)) this.release(trackId);
    }
    this.inFlight = new Set([...this.inFlight].filter((id) => keep.has(id)));
  }

  private setInFlightSuspended(suspended: boolean) {
    for (const trackId of this.inFlight) cacheStore.setSuspended(trackId, this.qualityId, suspended);
  }

  /** Libère le réseau pour le flux lu. Un fichier qui accepte les plages HTTP (taille connue) est
   *  interrompu net : sa reprise ne coûte qu'une requête, et couper la connexion stoppe aussitôt
   *  les octets déjà en route — une simple suspension les laisse arriver quelques secondes encore
   *  (tampons du proxy et du système), pendant que le flux lu se vide. Un flux transcodé, lui,
   *  serait à retélécharger depuis l'octet 0 : il est seulement suspendu (pause douce). */
  private yieldInFlight() {
    for (const trackId of [...this.inFlight]) {
      if (trackId === this.feedTrackId) continue;
      if (cacheStore.isRangeResumable(trackId, this.qualityId)) {
        cacheStore.pause(trackId, this.qualityId);
        this.inFlight.delete(trackId);
      } else {
        cacheStore.setSuspended(trackId, this.qualityId, true);
      }
    }
  }

  /** Suspend les téléchargements en cours (actif ou préchargement) quand la lecture réelle manque
   *  d'avance ou qu'on seek vers une zone non chargée : toute la bande passante va au flux lu.
   *  Pause DOUCE (voir SuspendSignal) — connexions gardées ouvertes mais plus lues, plutôt
   *  qu'abandonnées : la pression bascule souvent (hystérésis du moteur), et chaque abandon
   *  coûtait une nouvelle connexion, la perte des plages parallèles en cours et, pour un flux
   *  transcodé, un retéléchargement complet depuis l'octet 0 — des préchargements qui
   *  n'aboutissaient plus jamais. Aucun nouveau téléchargement ne démarre pendant la pause. */
  pause() {
    if (this.paused) return;
    this.paused = true;
    networkDebugLog("prefetch:paused", { reason: "lecture prioritaire", inFlight: [...this.inFlight] });
    this.yieldInFlight();
  }

  /** Reprend instantanément les téléchargements suspendus, puis la suite de la file. */
  resume() {
    if (!this.paused) return;
    this.paused = false;
    networkDebugLog("prefetch:resumed", { slots: this.slots.map((s) => s.trackId) });
    this.setInFlightSuspended(false);
    const waiters = [...this.resumeWaiters];
    this.resumeWaiters.clear();
    // Repart du début de la file : les pistes interrompues (voir yieldInFlight) sont redemandées
    // dans l'ordre de priorité, les suspendues reprennent simplement. Les workers en attente,
    // réveillés après, constatent le changement de génération et s'arrêtent.
    this.restart();
    waiters.forEach((wake) => wake());
  }

  private waitUntilResumed(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise((resolve) => this.resumeWaiters.add(resolve));
  }

  private restart() {
    this.generation++;
    this.cursor = 0;
    // Page en cours de chargement (web) : la nouvelle file attendra qu'elle ait fini.
    if (!this.paused && !isElectron() && isForegroundBusy()) this.paused = true;
    // Seules les MAX_CONCURRENT premières pistes de la nouvelle fenêtre gardent leur connexion ;
    // une piste sortie de la fenêtre (quittée, file réordonnée) ou reléguée plus loin cède la
    // place — ses octets restent en cache pour une reprise.
    this.pauseInFlight(new Set(this.slots.slice(0, this.limits.concurrent).map((s) => s.trackId)));
    for (let i = 0; i < this.limits.concurrent; i++) void this.runWorker(this.generation);
  }

  private async runWorker(generation: number) {
    while (generation === this.generation && this.cursor < this.slots.length) {
      if (this.slots[this.cursor].trackId !== this.feedTrackId) await this.waitUntilResumed();
      if (generation !== this.generation || this.cursor >= this.slots.length) return;
      const slot = this.slots[this.cursor++];

      const alreadyCached = await cacheStore.isFullyCached(slot.trackId, this.qualityId);
      if (generation !== this.generation) return;
      if (alreadyCached) continue;
      // Pause survenue pendant la vérification : ne pas ouvrir de connexion maintenant.
      if (this.paused && slot.trackId !== this.feedTrackId) {
        await this.waitUntilResumed();
        if (generation !== this.generation) return;
      }

      this.inFlight.add(slot.trackId);
      for (;;) {
        networkDebugLog("prefetch:request", { trackId: slot.trackId, priority: slot.priority, retry: this.retryAttempt });
        const task = cacheStore.request(slot.trackId, this.qualityId, slot.streamUrl, slot.priority, undefined, this.limits.segments);
        // Re-vérifie après chaque réveil : une reprise peut attendre la fermeture du run précédent
        // (voir TrackDownloader.closing) avant de redémarrer.
        do {
          await task.whenIdle();
        } while (task.isRunning && generation === this.generation);
        if (generation !== this.generation) return;
        networkDebugLog("prefetch:settled", {
          trackId: slot.trackId,
          complete: task.isComplete,
          error: task.error?.message ?? null,
        });
        // Échec (le téléchargeur a déjà épuisé ses relances rapides) : retenté plus tard, sinon la
        // piste restait partielle jusqu'au prochain changement de piste — barre de chargement
        // figée, forme d'onde et enchaînement gapless jamais prêts.
        // Le worker n'attend PAS la relance : bloqué sur une piste en échec, il empêchait les
        // suivantes (B, C, D) de se télécharger. La relance repart de la file entière (restart).
        if (task.error && !task.isComplete) this.scheduleRetry(generation, slot.trackId === this.feedTrackId);
        break;
      }
      // Fini ou budget atteint : on passe à la suivante.
      this.inFlight.delete(slot.trackId);
    }
  }

  stop() {
    this.generation++;
    this.wakeRetries();
    this.resumeWaiters.forEach((wake) => wake());
    this.resumeWaiters.clear();
    // La fenêtre quittée garde ses flux transcodés partiels (voir setWindow) ; le reste est coupé.
    this.feedTrackId = null;
    const left = this.window;
    this.setWindow([]);
    const leftovers = new Set(this.leftovers.map((s) => s.trackId));
    left.forEach((s) => leftovers.has(s.trackId) || cacheStore.pause(s.trackId, this.qualityId));
    this.pauseInFlight();
    this.cursor = 0;
    this.paused = false;
    this.syncProtectedKeys();
  }
}

export const prefetchScheduler = new PrefetchScheduler();
