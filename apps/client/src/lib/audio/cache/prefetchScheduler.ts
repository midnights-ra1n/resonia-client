import { cacheStore } from "./cacheStore";
import { cacheKeyFor } from "./types";
import { debugLog } from "../debug/audioDebugLogger";

const PREFETCH_COUNT = 3;

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
 *  retomber sur un nouveau fetch réseau. Le téléchargement reste séquentiel par priorité
 *  (jamais plusieurs connexions en parallèle) : la bande passante ne doit jamais être
 *  partagée entre la piste écoutée et le préchargement tant qu'elle n'est pas
 *  entièrement en cache. */
class PrefetchScheduler {
  private qualityId = "aac-256";
  private slots: QueueSlot[] = [];
  private cursor = 0;
  private running = false;
  private paused = false;

  setQuality(qualityId: string) {
    this.qualityId = qualityId;
  }

  private syncProtectedKeys() {
    cacheStore.setProtectedKeys(this.slots.map((s) => cacheKeyFor(s.trackId, this.qualityId)));
  }

  /** Remplace la piste active. Si une autre piste était active, on interrompt son
   *  téléchargement (inutile de continuer à mettre en cache une piste déjà quittée). */
  setActive(track: UpcomingTrack | null) {
    const previous = this.slots[0];
    if (previous && previous.priority === "active" && previous.trackId !== track?.trackId) {
      cacheStore.pause(previous.trackId, this.qualityId);
    }

    const upcoming = this.slots.slice(this.activeSlot ? 1 : 0);
    this.slots = track ? [{ trackId: track.trackId, streamUrl: track.streamUrl, priority: "active" }, ...upcoming] : upcoming;
    this.cursor = 0;
    this.paused = false;
    this.syncProtectedKeys();
    this.runNext();
  }

  setUpcoming(tracks: UpcomingTrack[]) {
    const active = this.activeSlot;
    const upcoming: QueueSlot[] = tracks.slice(0, PREFETCH_COUNT).map((t) => ({
      trackId: t.trackId,
      streamUrl: t.streamUrl,
      priority: "prefetch",
    }));
    this.slots = active ? [active, ...upcoming] : upcoming;
    this.cursor = 0;
    this.paused = false;
    this.syncProtectedKeys();
    this.runNext();
  }

  private get activeSlot(): QueueSlot | undefined {
    return this.slots[0]?.priority === "active" ? this.slots[0] : undefined;
  }

  /** Suspend le téléchargement en cours (actif ou préchargement) sans perdre la
   *  progression ni la liste. Utilisé quand la lecture réelle stalle ou qu'on seek vers
   *  une zone non chargée : on libère toute la bande passante pour le rattrapage de lecture. */
  pause() {
    if (this.paused) return;
    this.paused = true;
    const current = this.slots[this.cursor];
    if (current) cacheStore.pause(current.trackId, this.qualityId);
    this.running = false;
  }

  /** Reprend le téléchargement là où il s'était arrêté, sur la même file. */
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.runNext();
  }

  private async runNext() {
    if (this.running || this.paused) return;
    this.running = true;

    while (this.cursor < this.slots.length) {
      if (this.paused) break; // interrompu par un pause() pendant l'itération

      const slot = this.slots[this.cursor];

      const alreadyCached = await cacheStore.isFullyCached(slot.trackId, this.qualityId);
      if (alreadyCached) {
        this.cursor++;
        continue;
      }

      debugLog("prefetch:request", { trackId: slot.trackId, position: this.cursor, priority: slot.priority });
      const task = cacheStore.request(slot.trackId, this.qualityId, slot.streamUrl, slot.priority);

      await this.waitForTaskSettled(task);
      if (!this.paused) this.cursor++; // ne pas avancer le curseur si interrompu en cours de route
    }

    this.running = false;
  }

  private waitForTaskSettled(task: {
    onProgress: (cb: (p: { complete: boolean }) => void) => () => void;
    isBudgetExhausted: boolean;
  }) {
    return new Promise<void>((resolve) => {
      let settled = false;
      const unsubscribe = task.onProgress((progress) => {
        if (progress.complete && !settled) {
          settled = true;
          unsubscribe();
          resolve();
        }
      });
      const poll = window.setInterval(() => {
        if (task.isBudgetExhausted || settled || this.paused) {
          if (!settled) {
            settled = true;
            unsubscribe();
            window.clearInterval(poll);
            resolve();
          }
        }
      }, 150);
    });
  }

  stop() {
    this.slots.forEach((s) => cacheStore.pause(s.trackId, this.qualityId));
    this.slots = [];
    this.cursor = 0;
    this.running = false;
    this.paused = false;
    cacheStore.setProtectedKeys([]);
  }
}

export const prefetchScheduler = new PrefetchScheduler();
