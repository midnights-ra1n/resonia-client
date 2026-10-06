import { networkDebugLog } from "../debug/audioDebugLogger";

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

  try {
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
      handlers.onTotal(total && total !== "*" ? Number(total) : -1);
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
    let pending: Uint8Array[] = [];
    let pendingSize = 0;

    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (err) {
        // Coupure en cours de route : les octets déjà reçus (lot incomplet) restent valides —
        // les écrire avant de propager l'erreur permet à la reprise de repartir de là, plutôt
        // que de retélécharger jusqu'à un lot entier. Sauf abandon volontaire (pause).
        if (pendingSize > 0 && !signal.aborted) await handlers.onData(concat(pending, pendingSize));
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
