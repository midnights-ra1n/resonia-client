import { DesktopBaseDir } from "./baseDirectory";
import type { BlobStore, BlobWriter } from "./types";

// Même contrainte que côté OPFS : caractères réservés sur certains systèmes de fichiers.
function safeName(key: string): string {
  return key.replace(/[:/\\]/g, "_");
}

function bridge() {
  const api = window.resonia;
  if (!api) throw new Error("electronFsBlobStore utilisé hors environnement Electron");
  return api;
}

/** Backend adossé au vrai système de fichiers via IPC vers le process principal (voir
 *  `blobstore:*` dans `electron/main/index.ts`) — équivalent du plugin Tauri `fs` utilisé
 *  auparavant. Comme lui, ce chemin ne dépend d'aucun quota de stockage "best-effort" du
 *  navigateur ni de la maturité de l'implémentation OPFS d'une webview : écriture directe sur
 *  le disque réel de l'utilisateur.
 *
 *  `seek()`/`write()` de `BlobWriter` n'ont pas d'équivalent IPC dédié : la position s'avance
 *  simplement côté JS entre deux appels `write(handleId, position, data)` — plus simple que le
 *  couple seek+write positionné côté Tauri, et strictement équivalent pour l'usage réel
 *  (écriture séquentielle avec reprise à un offset donné, jamais aléatoire). */
export function createElectronFsBlobStore(rootDir: string, baseDir: DesktopBaseDir = DesktopBaseDir.AppCache): BlobStore {
  function pathFor(key: string): string {
    return `${rootDir}/${safeName(key)}`;
  }

  return {
    async fileSize(key) {
      const info = await bridge().blobStore.stat(baseDir, pathFor(key));
      return info?.size ?? 0;
    },

    async createWriter(key): Promise<BlobWriter> {
      const handleId = await bridge().blobStore.open(baseDir, pathFor(key));
      let position = 0;
      return {
        seek: async (pos) => {
          position = pos;
        },
        write: async (data) => {
          await bridge().blobStore.write(handleId, position, new Uint8Array(data));
          position += data.byteLength;
        },
        close: () => bridge().blobStore.close(handleId),
      };
    },

    async readAll(key) {
      const bytes = await bridge().blobStore.readFile(baseDir, pathFor(key));
      if (!bytes || bytes.byteLength === 0) return null;
      // Voir le commentaire équivalent dans l'ancien tauriFsBlobStore.ts : éviter un memcpy
      // synchrone de plusieurs Mo sur le thread principal à chaque transition de piste.
      if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
        return bytes.buffer as ArrayBuffer;
      }
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    },

    async deleteFile(key) {
      await bridge().blobStore.remove(baseDir, pathFor(key));
    },
  };
}
