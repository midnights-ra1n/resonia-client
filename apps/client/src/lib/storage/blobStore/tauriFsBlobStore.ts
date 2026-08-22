import { BaseDirectory, SeekMode, exists, mkdir, open, readFile, remove, stat } from "@tauri-apps/plugin-fs";
import type { BlobStore, BlobWriter } from "./types";

// Même contrainte que côté OPFS : caractères réservés sur certains systèmes de fichiers.
function safeName(key: string): string {
  return key.replace(/[:/\\]/g, "_");
}

/** Backend adossé au vrai système de fichiers (plugin Tauri `fs`), utilisé côté desktop.
 *  Contrairement à OPFS/Cache Storage (API du navigateur), ce chemin ne dépend pas de la
 *  maturité de l'implémentation OPFS de la webview (WebView2, WKWebView, WebKitGTK sur
 *  Linux — support historiquement incomplet, notamment pour l'écriture positionnée) ni
 *  d'un quota de stockage "best-effort" propre à l'origine `tauri://localhost` : les
 *  fichiers sont écrits directement dans `$APPCACHE/<rootDir>`, avec le quota disque réel
 *  de l'utilisateur. */
export function createTauriFsBlobStore(rootDir: string): BlobStore {
  const baseDir = BaseDirectory.AppCache;
  let dirReady: Promise<void> | null = null;

  function ensureDir(): Promise<void> {
    if (!dirReady) {
      dirReady = mkdir(rootDir, { baseDir, recursive: true }).catch(() => {
        /* existe déjà, ou créée entre-temps par un appel concurrent */
      });
    }
    return dirReady;
  }

  function pathFor(key: string): string {
    return `${rootDir}/${safeName(key)}`;
  }

  return {
    async fileSize(key) {
      await ensureDir();
      try {
        const info = await stat(pathFor(key), { baseDir });
        return info.size;
      } catch {
        return 0;
      }
    },

    async createWriter(key): Promise<BlobWriter> {
      await ensureDir();
      const path = pathFor(key);
      // `create: true` sans `truncate` : crée le fichier s'il n'existe pas, préserve son
      // contenu sinon (reprise de téléchargement, comme keepExistingData côté OPFS).
      const handle = await open(path, { write: true, create: true, baseDir });
      return {
        seek: async (position) => {
          await handle.seek(position, SeekMode.Start);
        },
        write: async (data) => {
          await handle.write(new Uint8Array(data));
        },
        close: () => handle.close(),
      };
    },

    async readAll(key) {
      await ensureDir();
      const path = pathFor(key);
      if (!(await exists(path, { baseDir }).catch(() => false))) return null;
      try {
        const bytes = await readFile(path, { baseDir });
        if (bytes.byteLength === 0) return null;
        // `readFile` alloue normalement un buffer de taille exacte (byteOffset 0, même
        // longueur) : dans ce cas (quasi systématique), on le renvoie tel quel plutôt que
        // de le recopier intégralement en synchrone — un memcpy de plusieurs Mo sur le
        // thread principal, à chaque transition de piste, cause un micro-freeze de l'UI.
        if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
          return bytes.buffer as ArrayBuffer;
        }
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      } catch {
        return null;
      }
    },

    async deleteFile(key) {
      await ensureDir();
      try {
        await remove(pathFor(key), { baseDir });
      } catch {
        /* déjà absent, rien à faire */
      }
    },
  };
}
