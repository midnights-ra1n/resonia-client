import type { SuspendSignal } from "../../storage/blobStore/types";

/** Implémentation de SuspendSignal (voir blobStore/types.ts) pilotée par TrackDownloader. */
export class SuspendController implements SuspendSignal {
  private _suspended = false;
  private listeners = new Set<(suspended: boolean) => void>();

  get suspended(): boolean {
    return this._suspended;
  }

  set(suspended: boolean) {
    if (suspended === this._suspended) return;
    this._suspended = suspended;
    this.listeners.forEach((cb) => cb(suspended));
  }

  onChange(cb: (suspended: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

/** Pendant une pause douce, un morceau du flux est quand même lu à cet intervalle : une connexion
 *  sans aucun transfert est coupée par les proxys (nginx : 60 s par défaut, Cloudflare : 100 s),
 *  et un flux transcodé ainsi coupé repartirait de l'octet 0. Quelques Ko toutes les 15 s. */
export const SUSPEND_KEEPALIVE_MS = 15_000;

/** Se résout dès que `suspension` n'est plus suspendue — immédiatement si elle ne l'est pas, ou au
 *  bout de `maxWaitMs` s'il est donné — ou rejette (AbortError) si `signal` est annulé pendant
 *  l'attente. */
export function whenNotSuspended(suspension: SuspendSignal | undefined, signal: AbortSignal, maxWaitMs?: number): Promise<void> {
  if (!suspension?.suspended) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = maxWaitMs === undefined ? null : setTimeout(() => {
      cleanup();
      resolve();
    }, maxWaitMs);
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const unsubscribe = suspension.onChange((suspended) => {
      if (suspended) return;
      cleanup();
      resolve();
    });
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}
