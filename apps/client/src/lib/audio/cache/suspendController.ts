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

/** Se résout dès que `suspension` n'est plus suspendue — immédiatement si elle ne l'est pas — ou
 *  rejette (AbortError) si `signal` est annulé pendant l'attente. */
export function whenNotSuspended(suspension: SuspendSignal | undefined, signal: AbortSignal): Promise<void> {
  if (!suspension?.suspended) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
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
