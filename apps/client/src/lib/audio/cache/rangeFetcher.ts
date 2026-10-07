import { networkDebugLog } from "../debug/audioDebugLogger";
import type { SuspendSignal } from "../../storage/blobStore/types";
import { whenNotSuspended } from "./suspendController";

// Taille des lots transmis à l'appelant : le corps HTTP arrive par petits morceaux (quelques Ko),
// on les regroupe pour ne pas multiplier les écritures disque (un aller-retour IPC chacune sur
// desktop) ni les notifications de progression. 64 Ko plutôt que 256 : sur un serveur qui ne
// sert que ~50 Ko/s par connexion, un lot de 256 Ko mettait ~5 s à se remplir — une piste quittée
// avant n'avait encore RIEN écrit sur disque (reprise depuis zéro), et le débogueur restait muet.
const BATCH_SIZE = 64 * 1024; // 64 Ko

// Délai d'INACTIVITÉ, pas de durée totale : une connexion qui reste ouverte sans plus jamais
// renvoyer d'octet (proxy qui "avale" la requête, Wi-Fi qui bascule sans couper franchement la
// socket...) bloquerait sinon le téléchargement pour toujours. Réarmé à chaque octet reçu — un
// flux transcodé à la volée peut légitimement mettre plusieurs minutes à arriver en entier.
const STALL_TIMEOUT_MS = 20_000;

// Connexion lente — même logique que les téléchargements du process principal sur bureau (voir
// SLOW_CHECK_AFTER_MS dans electron/main/index.ts) : environ une connexion sur sept à dix tombe à
// ~40-50 Ko/s et le reste. Utile en HTTP/1.1 (déploiement en HTTP simple, sans reverse proxy) :
// interrompre la réponse ferme sa socket, la reprise part sur une autre. En HTTP/2, la connexion
// est partagée et la relance n'aide pas — d'où la référence au meilleur débit déjà observé, qui
// empêche toute relance en boucle sur un serveur uniformément lent.
const SLOW_CHECK_AFTER_MS = 3000;
const SLOW_MAX_BYTES_PER_SEC = 128 * 1024;
const SLOW_RATIO = 4;
const bestRateByHost = new Map<string, number>();

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Débit très inférieur au meilleur déjà observé sur ce serveur : à relancer sur une autre
 *  connexion. Transitoire (voir isTransientStreamError), sans délai d'attente. */
export class SlowStreamError extends Error {
  constructor(rate: number) {
    super(`Connexion lente (${Math.round(rate / 1024)} Ko/s), relance sur une autre connexion`);
    this.name = "SlowStreamError";
  }
}

/** Fin de flux atteinte : le serveur n'a plus rien à servir à partir de `start`. Pas une
 *  erreur réseau — traité comme un signal de complétion normal par l'appelant. */
export class EndOfStreamError extends Error {
  constructor() {
    super("416 Range Not Satisfiable — fin de flux atteinte");
    this.name = "EndOfStreamError";
  }
}

/** Aucun octet reçu pendant `STALL_TIMEOUT_MS` — délibérément PAS un `AbortError` : contrairement
 *  à un abandon volontaire (pause/annulation), c'est une panne réseau transitoire, à retenter. */
export class StreamStallError extends Error {
  constructor() {
    super("Délai réseau dépassé en attendant la réponse du serveur");
    this.name = "StreamStallError";
  }
}

/** Réponse HTTP inattendue. Les 4xx (hors 408/429) ne sont jamais retentées : redemander la même
 *  ressource donnerait la même réponse. */
export class HttpStatusError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Requête de flux échouée (${status})`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

/** Flux terminé avant la taille annoncée par le serveur (connexion coupée proprement). */
export class TruncatedStreamError extends Error {
  constructor() {
    super("Flux interrompu avant sa taille annoncée");
    this.name = "TruncatedStreamError";
  }
}

export function isTransientStreamError(err: unknown): boolean {
  if (err instanceof EndOfStreamError) return false;
  if (err instanceof DOMException && err.name === "AbortError") return false;
  if (err instanceof HttpStatusError) return err.status >= 500 || err.status === 408 || err.status === 429;
  return true;
}

export interface StreamRangeHandlers {
  /** Taille totale du fichier dès qu'elle est connue (-1 si le serveur ne la donne pas). */
  onTotal(totalBytes: number): void;
  /** Lot d'octets à partir de la position courante. Renvoie `false` pour arrêter la lecture
   *  (budget atteint) — le flux est alors abandonné sans erreur. */
  onData(data: ArrayBuffer): Promise<boolean>;
}

/** `true` si le flux a été lu jusqu'au bout, `false` s'il a été arrêté par `onData`. */
export type StreamRangeResult = boolean;

function concat(parts: Uint8Array[], size: number): ArrayBuffer {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out.buffer;
}

/**
 * Télécharge `url` à partir de l'octet `start` en UNE seule requête (`Range: bytes=start-`), le
 * corps étant lu et transmis au fil de l'eau par lots de `BATCH_SIZE`.
 *
 * Anciennement une requête par chunk de 256 Ko, en attendant chaque fois la réponse entière.
 * Navidrome ne sert les Range qu'une fois le transcodage d'une piste terminé et mis en cache : avant,
 * il répond 200 avec le fichier COMPLET, produit au rythme du transcodage (~1,5 à 2× le temps
 * réel). Chaque chunk attendait donc la piste entière, dépassait le délai, était retenté trois fois
 * — chaque essai relançant un transcodage côté serveur — et échouait sans avoir écrit un octet,
 * tout en saturant le serveur au point de retarder la lecture elle-même.
 *
 * 206 : le serveur honore la plage. 200 : il l'ignore et renvoie le fichier depuis l'octet 0 — les
 * `start` premiers octets (déjà en cache) sont alors sautés, jamais réécrits à la position courante.
 */
export async function streamRange(
  url: string,
  start: number,
  signal: AbortSignal,
  handlers: StreamRangeHandlers,
  suspension?: SuspendSignal,
  /** Autorise l'abandon d'une connexion lente (SlowStreamError) — voir SLOW_CHECK_AFTER_MS. */
  mayReconnectIfSlow = false,
): Promise<StreamRangeResult> {
  // Combine le signal de l'appelant (pause/annulation volontaire, toujours prioritaire) avec le
  // délai d'inactivité propre à cette requête.
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  if (signal.aborted) onOuterAbort();
  signal.addEventListener("abort", onOuterAbort, { once: true });
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  const armStallTimer = () => {
    if (stallTimer !== null) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
  };

  // Pause douce (voir SuspendSignal) : le délai d'inactivité est suspendu avec elle — une
  // connexion volontairement mise en attente n'est pas une panne réseau.
  // Fenêtre de mesure du débit, remise à zéro après une pause douce.
  const host = hostOf(url);
  let windowStart = 0;
  let windowBytes = 0;
  let rateChecked: boolean;
  const recordRate = () => {
    const elapsed = performance.now() - windowStart;
    if (elapsed < 500 || windowBytes === 0) return 0;
    const rate = (windowBytes * 1000) / elapsed;
    if (rate > (bestRateByHost.get(host) ?? 0)) bestRateByHost.set(host, rate);
    return rate;
  };

  const waitWhileSuspended = async () => {
    if (stallTimer !== null) clearTimeout(stallTimer);
    stallTimer = null;
    await whenNotSuspended(suspension, controller.signal);
    armStallTimer();
    windowStart = performance.now();
    windowBytes = 0;
  };

  try {
    // Suspendu avant même la requête : inutile d'ouvrir une connexion qui ne sera pas lue.
    if (suspension?.suspended) await waitWhileSuspended();
    armStallTimer();
    // Priorité basse : ces téléchargements de fond ne doivent jamais passer devant le flux de
    // lecture ni les requêtes de l'interface dans la file réseau du navigateur.
    const res = await fetch(url, { headers: { Range: `bytes=${start}-` }, signal: controller.signal, priority: "low" });

    networkDebugLog("stream:response", {
      url,
      start,
      status: res.status,
      contentRange: res.headers.get("Content-Range"),
      contentLength: res.headers.get("Content-Length"),
    });
    if (res.status === 416) throw new EndOfStreamError();
    if (res.status !== 200 && res.status !== 206) throw new HttpStatusError(res.status);

    let skip = 0;
    if (res.status === 206) {
      const total = res.headers.get("Content-Range")?.split("/")[1];
      // `Content-Range` n'est lisible en cross-origin que si le serveur l'expose
      // (Access-Control-Expose-Headers) — rarement le cas. `Content-Length`, lui, l'est toujours :
      // pour une plage ouverte (`bytes=start-`), taille totale = start + longueur de la réponse.
      const length = Number(res.headers.get("Content-Length"));
      if (total && total !== "*") handlers.onTotal(Number(total));
      else handlers.onTotal(Number.isFinite(length) && length > 0 ? start + length : -1);
    } else {
      // 200 : le serveur ignore la plage. Son Content-Length n'est pas fiable comme taille
      // exacte — pour un flux transcodé, il peut s'agir d'une ESTIMATION côté serveur, le
      // fichier réel pouvant être plus court ou plus long. Seule la fin propre du flux fait
      // foi : taille totale inconnue ici.
      handlers.onTotal(-1);
      skip = start;
      if (start > 0) networkDebugLog("stream:range-ignored", { url, start });
    }

    if (!res.body) throw new Error("Réponse sans corps");
    const reader = res.body.getReader();
    // Flux transcodé (200) : une relance repartirait de l'octet 0 — jamais relancé.
    rateChecked = !mayReconnectIfSlow || res.status !== 206;
    windowStart = performance.now();
    let pending: Uint8Array[] = [];
    let pendingSize = 0;

    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        if (suspension?.suspended) await waitWhileSuspended();
        result = await reader.read();
      } catch (err) {
        // Coupure en cours de route, y compris un abandon volontaire (le planificateur coupe les
        // fichiers à plages pour céder le réseau, voir PrefetchScheduler.yieldInFlight) : les
        // octets déjà reçus (lot incomplet) restent valides — les écrire avant de propager
        // l'erreur permet à la reprise de repartir de là plutôt que de les retélécharger.
        if (pendingSize > 0) await handlers.onData(concat(pending, pendingSize));
        throw err;
      }
      const { done, value } = result;
      armStallTimer();
      if (value && value.byteLength > 0) {
        let chunk = value;
        if (skip > 0) {
          const dropped = Math.min(skip, chunk.byteLength);
          skip -= dropped;
          chunk = chunk.subarray(dropped);
        }
        if (chunk.byteLength > 0) {
          pending.push(chunk);
          pendingSize += chunk.byteLength;
          windowBytes += chunk.byteLength;
        }
      }
      if (!rateChecked && !done && performance.now() - windowStart >= SLOW_CHECK_AFTER_MS) {
        rateChecked = true;
        const best = bestRateByHost.get(host) ?? 0;
        const rate = recordRate();
        if (rate < SLOW_MAX_BYTES_PER_SEC && (best === 0 || rate * SLOW_RATIO < best)) {
          if (pendingSize > 0) await handlers.onData(concat(pending, pendingSize));
          void reader.cancel().catch(() => {});
          throw new SlowStreamError(rate);
        }
      }
      if (pendingSize >= BATCH_SIZE || (done && pendingSize > 0)) {
        const keepGoing = await handlers.onData(concat(pending, pendingSize));
        pending = [];
        pendingSize = 0;
        if (!keepGoing) {
          void reader.cancel().catch(() => {});
          return false;
        }
      }
      if (done) {
        recordRate();
        // Reprise au-delà de la fin réelle du fichier : il n'y avait plus rien à lire.
        if (skip > 0) throw new EndOfStreamError();
        return true;
      }
    }
  } catch (err) {
    // L'appelant a lui-même demandé l'abandon : remonté tel quel (AbortError), jamais retenté.
    // Sinon, c'est forcément notre délai d'inactivité qui a déclenché l'abandon.
    if (!signal.aborted && err instanceof DOMException && err.name === "AbortError") {
      throw new StreamStallError();
    }
    throw err;
  } finally {
    if (stallTimer !== null) clearTimeout(stallTimer);
    signal.removeEventListener("abort", onOuterAbort);
  }
}
