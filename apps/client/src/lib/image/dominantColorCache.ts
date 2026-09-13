import { storage } from "../storage";

const STORAGE_PREFIX = "resonia:dominantColor:";
const SAMPLE_SIZE = 16;

function cacheKeyFor(serverId: string, coverArtId: string): string {
  return `${serverId}:${coverArtId}`;
}

function storageKeyFor(serverId: string, coverArtId: string): string {
  return `${STORAGE_PREFIX}${serverId}:${coverArtId}`;
}

/** Mémoire (rapide, vidée au rechargement) + disque (`storage`, survit aux rechargements et
 *  redémarrages) — deux niveaux comme le reste des caches de l'app (pochettes, téléchargements). */
const memoryCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

function averageColorFromCanvas(ctx: CanvasRenderingContext2D): string | null {
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }
  if (count === 0) return null;
  return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
}

/** Extraction via `createImageBitmap` : décodage + redimensionnement en une passe, sans
 *  passer par un `<img>` (pas de DOM, pas d'attente d'un évènement `load`) — nettement plus
 *  rapide que l'ancienne approche `new Image()` + dessin sur canvas pleine taille. */
async function extractViaImageBitmap(imageUrl: string): Promise<string | null> {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: SAMPLE_SIZE,
    resizeHeight: SAMPLE_SIZE,
    resizeQuality: "low",
  });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    return averageColorFromCanvas(ctx);
  } finally {
    bitmap.close();
  }
}

/** Repli si `createImageBitmap` est indisponible (vieux WebView) ou échoue. */
function extractViaImageElement(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        resolve(averageColorFromCanvas(ctx));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

async function extractColor(imageUrl: string): Promise<string | null> {
  try {
    if (typeof createImageBitmap === "function") {
      return await extractViaImageBitmap(imageUrl);
    }
  } catch (err) {
    console.warn("[dominantColorCache] createImageBitmap a échoué, repli sur <img>", err);
  }
  return extractViaImageElement(imageUrl);
}

async function resolveColor(serverId: string, coverArtId: string, imageUrl: string): Promise<string | null> {
  const persisted = await storage.get<string>(storageKeyFor(serverId, coverArtId));
  if (persisted) return persisted;

  const color = await extractColor(imageUrl);
  if (color) storage.set(storageKeyFor(serverId, coverArtId), color).catch(() => {});
  return color;
}

/** Lance l'extraction en tâche de fond (dédupliquée), à appeler dès qu'une pochette est
 *  disponible (piste active/à venir — voir playerStore) pour que la couleur soit déjà connue
 *  au moment où la page paroles s'ouvre. */
export function prefetchDominantColor(serverId: string, coverArtId: string, imageUrl: string): Promise<void> {
  const key = cacheKeyFor(serverId, coverArtId);
  const existingInflight = inflight.get(key);
  if (memoryCache.has(key) || existingInflight) return (existingInflight ?? Promise.resolve(null)).then(() => undefined);

  const promise = resolveColor(serverId, coverArtId, imageUrl).then((color) => {
    memoryCache.set(key, color);
    inflight.delete(key);
    return color;
  });
  inflight.set(key, promise);
  return promise.then(() => undefined);
}

/** Lecture synchrone du cache mémoire : `undefined` = jamais résolu (le disque n'a pas encore
 *  été consulté), `null` = résolu mais extraction impossible. */
export function getCachedDominantColor(serverId: string, coverArtId: string): string | null | undefined {
  return memoryCache.get(cacheKeyFor(serverId, coverArtId));
}
