import { networkDebugLog } from "../debug/audioDebugLogger";

const CHUNK_SIZE = 256 * 1024; // 256 Ko
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 500;
// Une connexion qui reste ouverte sans jamais renvoyer de données (proxy/serveur qui "avale"
// la requête, Wi-Fi qui bascule de réseau sans couper franchement la socket...) bloquerait
// `fetch()` indéfiniment sans ce filet : `TrackDownloader.run()` — et donc toute la file de
// téléchargements, qui traite un morceau à la fois — resterait figé sur ce chunk pour
// toujours, sans jamais ni progresser ni signaler d'erreur. 20s est largement au-dessus du
// temps normal pour un chunk de 256 Ko, même sur une connexion lente.
const CHUNK_TIMEOUT_MS = 20_000;

export interface RangeChunk {
  data: ArrayBuffer;
  totalBytes: number; // depuis Content-Range, -1 si le serveur ne le fournit pas
}

/** Fin de flux atteinte : le serveur n'a plus rien à servir à partir de `start`. Pas une
 *  erreur réseau — traité comme un signal de complétion normal par l'appelant. */
export class EndOfStreamError extends Error {
  constructor() {
    super("416 Range Not Satisfiable — fin de flux atteinte");
    this.name = "EndOfStreamError";
  }
}

/** Chunk abandonné faute de réponse dans `CHUNK_TIMEOUT_MS` — délibérément PAS un
 *  `AbortError` : contrairement à un abandon volontaire (pause/annulation), c'est une panne
 *  réseau transitoire, donc retentée comme telle par `fetchRange` (voir `isTransient`). */
export class ChunkTimeoutError extends Error {
  constructor() {
    super("Délai réseau dépassé en attendant la réponse du serveur");
    this.name = "ChunkTimeoutError";
  }
}

function isTransient(err: unknown): boolean {
  if (err instanceof EndOfStreamError) return false;
  if (err instanceof DOMException && err.name === "AbortError") return false;
  return true;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
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

async function fetchRangeOnce(url: string, start: number, signal: AbortSignal, chunkSize: number): Promise<RangeChunk> {
  const end = start + chunkSize - 1;

  // Combine le signal de l'appelant (pause/annulation volontaire, toujours prioritaire) avec
  // une temporisation propre à cette tentative — voir CHUNK_TIMEOUT_MS.
  const timeoutController = new AbortController();
  const onOuterAbort = () => timeoutController.abort();
  if (signal.aborted) onOuterAbort();
  signal.addEventListener("abort", onOuterAbort, { once: true });
  const timer = setTimeout(() => timeoutController.abort(), CHUNK_TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal: timeoutController.signal });

    if (res.status === 416) throw new EndOfStreamError();

    if (res.status === 200) {
      // Le serveur ignore les requêtes Range (pas de support partiel) : on récupère tout.
      const data = await res.arrayBuffer();
      if (start === 0) return { data, totalBytes: data.byteLength };

      // `start` > 0 : ce n'était pas un premier appel, mais une REPRISE (pause prefetch,
      // pression réseau...) — `TrackDownloader.run()` a positionné son writer OPFS à
      // `bytesCached` (milieu de fichier) et va y ajouter `data` telle quelle. Si `data` est
      // ici le fichier COMPLET depuis son octet 0 (ce que ce statut 200 signifie), l'écrire
      // tel quel dupliquerait tout le fichier à cette position et corromprait l'octet cache
      // — c'est précisément la cause d'un saut audible en lecture, souvent tôt dans le
      // morceau puisque les reprises de téléchargement y sont les plus fréquentes. On
      // découpe donc nous-mêmes le segment réellement demandé dans la réponse complète.
      if (start >= data.byteLength) throw new EndOfStreamError();
      return { data: data.slice(start, start + chunkSize), totalBytes: data.byteLength };
    }

    if (res.status !== 206) {
      throw new Error(`Requête Range échouée (${res.status})`);
    }

    const contentRange = res.headers.get("Content-Range");
    const totalBytes = contentRange ? Number(contentRange.split("/")[1]) : -1;
    const data = await res.arrayBuffer();
    return { data, totalBytes };
  } catch (err) {
    // L'appelant a lui-même demandé l'abandon (pause/annulation) : remonté tel quel
    // (AbortError), jamais retenté — voir `isTransient`. Sinon, c'est forcément notre propre
    // timeout qui a déclenché l'abandon : erreur réseau transitoire, à retenter.
    if (!signal.aborted && err instanceof DOMException && err.name === "AbortError") {
      throw new ChunkTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onOuterAbort);
  }
}

/** Télécharge un intervalle d'octets, avec retry + backoff exponentiel sur erreurs réseau
 *  transitoires. Une `EndOfStreamError` ou un abandon volontaire (AbortError) ne sont
 *  jamais retentés — ils remontent immédiatement à l'appelant. */
export async function fetchRange(
  url: string,
  start: number,
  signal: AbortSignal,
  chunkSize = CHUNK_SIZE,
): Promise<RangeChunk> {
  let attempt = 0;
  for (;;) {
    try {
      return await fetchRangeOnce(url, start, signal, chunkSize);
    } catch (err) {
      if (!isTransient(err) || attempt >= MAX_RETRIES) {
        if (isTransient(err)) {
          networkDebugLog("chunk:lost", { url, start, attempt, error: String((err as Error)?.message ?? err) });
        }
        throw err;
      }
      attempt++;
      networkDebugLog("chunk:retry", { url, start, attempt, error: String((err as Error)?.message ?? err) });
      await sleep(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), signal);
    }
  }
}
