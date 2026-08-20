const ROOT_DIR = "resonia-audio-cache";

async function getRootDir(): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory();
  return opfsRoot.getDirectoryHandle(ROOT_DIR, { create: true });
}

async function getFileHandle(key: string, create = false): Promise<FileSystemFileHandle | null> {
  const dir = await getRootDir();
  try {
    return await dir.getFileHandle(safeName(key), { create });
  } catch {
    return null;
  }
}

// OPFS interdit ':' et autres caractères réservés dans certains environnements.
function safeName(key: string): string {
  return key.replace(/[:/\\]/g, "_");
}

export async function opfsFileSize(key: string): Promise<number> {
  const handle = await getFileHandle(key);
  if (!handle) return 0;
  const file = await handle.getFile();
  return file.size;
}

/** Écrit un chunk à une position donnée. Le writable doit être créé une fois par
 *  session de téléchargement et fermé explicitement à la fin. */
export async function createOpfsWriter(key: string): Promise<FileSystemWritableFileStream> {
  const handle = await getFileHandle(key, true);
  if (!handle) throw new Error(`Impossible de créer le fichier de cache pour ${key}`);
  return handle.createWritable({ keepExistingData: true });
}

export async function opfsReadAll(key: string): Promise<ArrayBuffer | null> {
  const handle = await getFileHandle(key);
  if (!handle) return null;
  const file = await handle.getFile();
  if (file.size === 0) return null;
  return file.arrayBuffer();
}

export async function opfsDelete(key: string): Promise<void> {
  const dir = await getRootDir();
  try {
    await dir.removeEntry(safeName(key));
  } catch {
    /* déjà absent, rien à faire */
  }
}
