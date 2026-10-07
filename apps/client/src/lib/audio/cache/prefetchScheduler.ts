import { cacheStore } from "./cacheStore";
import { cacheKeyFor } from "./types";
import { networkDebugLog } from "../debug/audioDebugLogger";
import type { NetworkMode } from "../engine/gaplessEngine";
import { isElectron } from "../../platform";
import { isForegroundBusy, onForegroundBusyChange } from "../../network/foregroundActivity";

const PREFETCH_COUNT = 3;

// Téléchargements simultanés : la piste active ET la suivante démarrent ensemble. Les serveurs
// derrière un proxy plafonnent souvent le débit PAR connexion (mesuré : ~50 Ko/s chacune, qui
// s'additionnent) — en strict séquentiel, la piste suivante n'était prête qu'après la fin de la
// piste courante, et l'enchaînement retombait sur un rechargement réseau (coupure + attente). La
// piste en cours reste prioritaire : la pression réseau du moteur (hystérésis sur l'avance du
// tampon de lecture) suspend tout dès que cette avance baisse.
const MAX_CONCURRENT = 2;
// Plages parallèles par fichier (bureau, voir `downloads` dans electron/main/index.ts).
const MAX_SEGMENTS = 3;

// Tant que le flux lu télécharge encore ("shared") : une seule connexion de fond, sans découpage —
// à plusieurs (jusqu'à 2 pistes × 3 plages), elles prenaient l'essentiel du débit au flux lu.
const LIMITS: Record<Exclude<NetworkMode, "exclusive">, { concurrent: number; segments: number }> = {
  shared: { concurrent: 1, segments: 1 },
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
  // Dernier mode demandé par le moteur, combiné à l'activité de premier plan (voir applyMode).
  private engineMode: NetworkMode = "free";

  constructor() {
    // Web uniquement : une seule connexion HTTP/2 partagée avec les pages (voir
    // foregroundActivity). Sur bureau, HTTP/2 est désactivé et les téléchargements passent par
    // leurs propres connexions (session dédiée du process principal) — rien à céder aux pages.
    if (!isElectron()) onForegroundBusyChange(() => this.applyMode());
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
    this.limits = limits;
    if (this.paused) this.resume();
    else if (changed) this.restart();
  }

  setQuality(qualityId: string) {
    this.qualityId = qualityId;
  }

  private syncProtectedKeys() {
    cacheStore.setProtectedKeys(this.slots.map((s) => cacheKeyFor(s.trackId, this.qualityId)));
  }

  /** Remplace la piste active (`null` : aucune à télécharger, ex. piste déjà téléchargée). Le
   *  téléchargement d'une piste quittée est interrompu — inutile de continuer à la mettre en cache. */
  setActive(track: UpcomingTrack | null) {
    const upcoming = this.slots.slice(this.activeSlot ? 1 : 0);
    this.replaceSlots(
      track ? [{ trackId: track.trackId, streamUrl: track.streamUrl, priority: "active" }, ...upcoming] : upcoming,
    );
  }

  setUpcoming(tracks: UpcomingTrack[]) {
    const active = this.activeSlot;
    const upcoming: QueueSlot[] = tracks.slice(0, PREFETCH_COUNT).map((t) => ({
      trackId: t.trackId,
      streamUrl: t.streamUrl,
      priority: "prefetch",
    }));
    this.replaceSlots(active ? [active, ...upcoming] : upcoming);
  }

  private get activeSlot(): QueueSlot | undefined {
    return this.slots[0]?.priority === "active" ? this.slots[0] : undefined;
  }

  private replaceSlots(slots: QueueSlot[]) {
    this.slots = slots;
    this.syncProtectedKeys();
    this.restart();
  }

  private pauseInFlight(keep: Set<string> = new Set()) {
    for (const trackId of this.inFlight) {
      if (!keep.has(trackId)) cacheStore.pause(trackId, this.qualityId);
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
      await this.waitUntilResumed();
      if (generation !== this.generation || this.cursor >= this.slots.length) return;
      const slot = this.slots[this.cursor++];

      const alreadyCached = await cacheStore.isFullyCached(slot.trackId, this.qualityId);
      if (generation !== this.generation) return;
      if (alreadyCached) continue;
      // Pause survenue pendant la vérification : ne pas ouvrir de connexion maintenant.
      if (this.paused) {
        await this.waitUntilResumed();
        if (generation !== this.generation) return;
      }

      this.inFlight.add(slot.trackId);
      networkDebugLog("prefetch:request", { trackId: slot.trackId, priority: slot.priority });
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
      // Fini, budget atteint ou échec (déjà journalisé par le téléchargeur) : on passe à la
      // suivante plutôt que de retenter la même en boucle — elle sera redemandée au prochain
      // changement de piste.
      this.inFlight.delete(slot.trackId);
    }
  }

  stop() {
    this.generation++;
    this.resumeWaiters.forEach((wake) => wake());
    this.resumeWaiters.clear();
    this.slots.forEach((s) => cacheStore.pause(s.trackId, this.qualityId));
    this.pauseInFlight();
    this.slots = [];
    this.cursor = 0;
    this.paused = false;
    cacheStore.setProtectedKeys([]);
  }
}

export const prefetchScheduler = new PrefetchScheduler();
