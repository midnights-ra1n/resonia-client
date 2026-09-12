import { createBlobStore, type BlobWriter } from "../../storage/blobStore";
import { getPlatform } from "../../platform";

const ROOT_DIR = "resonia-audio-cache";

export const audioCacheBlobStore = createBlobStore(ROOT_DIR);
const store = audioCacheBlobStore;

/** Demande le stockage persistant (une seule fois, au démarrage) — web uniquement : sur
 *  desktop le cache écrit directement sur disque via le plugin Tauri `fs` (voir
 *  storage/blobStore/tauriFsBlobStore.ts) et n'est plus soumis au quota "best-effort" du
 *  navigateur. Côté web, sans cette demande, certains navigateurs allouent un quota très
 *  réduit à OPFS/Cache Storage tant qu'aucun historique de navigation ne justifie
 *  l'heuristique habituelle — le cache semble alors plafonner à quelques Mo. */
export async function requestPersistentStorage(): Promise<void> {
  if (getPlatform() === "desktop" || !("storage" in navigator)) return;
  try {
    if ("persist" in navigator.storage) {
      const granted = await navigator.storage.persist();
      console.info(`[cache] Stockage persistant ${granted ? "accordé" : "refusé"} par le navigateur`);
    }
    if ("estimate" in navigator.storage) {
      const { usage, quota } = await navigator.storage.estimate();
      console.info(`[cache] Quota de stockage : ${formatMb(usage)} Mo utilisés sur ${formatMb(quota)} Mo`);
    }
  } catch (err) {
    console.warn("[cache] Impossible de vérifier/demander le quota de stockage", err);
  }
}

function formatMb(bytes: number | undefined): string {
  return bytes === undefined ? "?" : (bytes / (1024 * 1024)).toFixed(1);
}

export function opfsFileSize(key: string): Promise<number> {
  return store.fileSize(key);
}

/** Le writer doit être créé une fois par session de téléchargement et fermé
 *  explicitement à la fin. */
export function createOpfsWriter(key: string): Promise<BlobWriter> {
  return store.createWriter(key);
}

export function opfsReadAll(key: string): Promise<ArrayBuffer | null> {
  return store.readAll(key);
}

export function opfsDelete(key: string): Promise<void> {
  return store.deleteFile(key);
}
