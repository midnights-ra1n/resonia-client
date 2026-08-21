import type { BlobStore, BlobWriter } from "./types";

// OPFS interdit ':' et autres caractères réservés dans certains environnements.
function safeName(key: string): string {
  return key.replace(/[:/\\]/g, "_");
}

/** Backend OPFS (`navigator.storage.getDirectory()`), utilisé côté web — voir
 *  `tauriFsBlobStore.ts` pour l'équivalent desktop, plus fiable sur les webviews dont le
 *  support OPFS est incomplet (WebKitGTK sur Linux notamment). */
export function createOpfsBlobStore(rootDir: string): BlobStore {
  async function getRootDir(): Promise<FileSystemDirectoryHandle> {
    const opfsRoot = await navigator.storage.getDirectory();
    return opfsRoot.getDirectoryHandle(rootDir, { create: true });
  }

  async function getFileHandle(key: string, create = false): Promise<FileSystemFileHandle | null> {
    const dir = await getRootDir();
    try {
      return await dir.getFileHandle(safeName(key), { create });
    } catch {
      return null;
    }
  }

  return {
    async fileSize(key) {
      const handle = await getFileHandle(key);
      if (!handle) return 0;
      const file = await handle.getFile();
      return file.size;
    },

    async createWriter(key): Promise<BlobWriter> {
      const handle = await getFileHandle(key, true);
      if (!handle) throw new Error(`Impossible de créer le fichier de cache pour ${key}`);
      const stream = await handle.createWritable({ keepExistingData: true });
      return {
        // .seek() une fois puis des write(data) séquentiels : support plus large/fiable
        // (notamment WebKit) que la forme composite { type: "write", position, data }
        // pour un flux qui n'a de toute façon jamais besoin d'écritures aléatoires.
        seek: (position) => stream.seek(position),
        write: (data) => stream.write(data),
        close: () => stream.close(),
      };
    },

    async readAll(key) {
      const handle = await getFileHandle(key);
      if (!handle) return null;
      const file = await handle.getFile();
      if (file.size === 0) return null;
      return file.arrayBuffer();
    },

    async deleteFile(key) {
      const dir = await getRootDir();
      try {
        await dir.removeEntry(safeName(key));
      } catch {
        /* déjà absent, rien à faire */
      }
    },
  };
}
