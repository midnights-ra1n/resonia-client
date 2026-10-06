import { cacheStore } from "./cacheStore";
import { cacheKeyFor } from "./types";
import { networkDebugLog } from "../debug/audioDebugLogger";

const PREFETCH_COUNT = 3;

// Téléchargements simultanés : la piste active ET la suivante démarrent ensemble. Les serveurs
// derrière un proxy plafonnent souvent le débit PAR connexion (mesuré : ~50 Ko/s chacune, qui
// s'additionnent) — en strict séquentiel, la piste suivante n'était prête qu'après la fin de la
// piste courante, et l'enchaînement retombait sur un rechargement réseau (coupure + attente). La
// piste en cours reste prioritaire : la pression réseau du moteur (hystérésis sur l'avance du
// tampon de lecture) suspend tout dès que cette avance baisse.
const MAX_CONCURRENT = 2;

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

  /** Suspend les téléchargements en cours (actif ou préchargement) sans perdre la
   *  progression ni la liste. Utilisé quand la lecture réelle stalle ou qu'on seek vers
   *  une zone non chargée : on libère toute la bande passante pour le rattrapage de lecture. */
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.generation++;
    networkDebugLog("prefetch:paused", { reason: "lecture prioritaire", inFlight: [...this.inFlight] });
    this.pauseInFlight();
  }

  /** Reprend le téléchargement là où il s'était arrêté, sur la même file. */
  resume() {
    if (!this.paused) return;
    this.paused = false;
    networkDebugLog("prefetch:resumed", { slots: this.slots.map((s) => s.trackId) });
    this.restart();
  }

  private restart() {
    this.generation++;
    this.cursor = 0;
    if (this.paused) return;
    // Seules les MAX_CONCURRENT premières pistes de la nouvelle fenêtre gardent leur connexion ;
    // une piste sortie de la fenêtre (quittée, file réordonnée) ou reléguée plus loin cède la
    // place — ses octets restent en cache pour une reprise.
    this.pauseInFlight(new Set(this.slots.slice(0, MAX_CONCURRENT).map((s) => s.trackId)));
    for (let i = 0; i < MAX_CONCURRENT; i++) void this.runWorker(this.generation);
  }

  private async runWorker(generation: number) {
    while (generation === this.generation && this.cursor < this.slots.length) {
      const slot = this.slots[this.cursor++];

      const alreadyCached = await cacheStore.isFullyCached(slot.trackId, this.qualityId);
      if (generation !== this.generation) return;
      if (alreadyCached) continue;

      this.inFlight.add(slot.trackId);
      networkDebugLog("prefetch:request", { trackId: slot.trackId, priority: slot.priority });
      const task = cacheStore.request(slot.trackId, this.qualityId, slot.streamUrl, slot.priority);
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
    this.slots.forEach((s) => cacheStore.pause(s.trackId, this.qualityId));
    this.pauseInFlight();
    this.slots = [];
    this.cursor = 0;
    this.paused = false;
    cacheStore.setProtectedKeys([]);
  }
}

export const prefetchScheduler = new PrefetchScheduler();
