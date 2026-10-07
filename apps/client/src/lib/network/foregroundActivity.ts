/** Requêtes « de premier plan » en cours : appels API et pochettes dont dépend l'affichage des
 *  pages. Sur le web, le navigateur fait passer TOUTES les requêtes vers le serveur par une seule
 *  connexion HTTP/2 (impossible à désactiver, contrairement au bureau — voir `disable-http2` dans
 *  electron/main/index.ts) : derrière un proxy qui plafonne le débit par connexion (~40-55 Ko/s
 *  mesurés), un téléchargement de fond y fait la queue devant la réponse de la page demandée — une
 *  page album pouvait mettre plusieurs secondes à s'afficher. Le planificateur de préchargement
 *  s'abonne à cet état pour céder le réseau tant qu'une page charge (voir PrefetchScheduler). */

// Délai avant de déclarer le premier plan inactif : une page enchaîne souvent ses requêtes (album,
// puis pochettes, puis infos complémentaires) — sans ce délai, le préchargement redémarrerait
// entre chacune pour être aussitôt réinterrompu.
const IDLE_GRACE_MS = 500;

let inFlight = 0;
let busy = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(busy: boolean) => void>();

function setBusy(next: boolean) {
  if (next === busy) return;
  busy = next;
  listeners.forEach((cb) => cb(next));
}

/** Suit `promise` comme requête de premier plan jusqu'à son règlement ; la renvoie telle quelle. */
export function trackForegroundRequest<T>(promise: Promise<T>): Promise<T> {
  inFlight++;
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  setBusy(true);
  const settle = () => {
    inFlight--;
    if (inFlight > 0) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (inFlight === 0) setBusy(false);
    }, IDLE_GRACE_MS);
  };
  promise.then(settle, settle);
  return promise;
}

export function isForegroundBusy(): boolean {
  return busy;
}

export function onForegroundBusyChange(cb: (busy: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
