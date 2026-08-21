/** Écrivain séquentiel : un seul writer par fichier à la fois, jamais d'écriture
 *  aléatoire — `seek()` est appelé une fois pour reprendre à un offset donné, puis
 *  `write()` avance la position automatiquement. */
export interface BlobWriter {
  seek(position: number): Promise<void>;
  write(data: ArrayBuffer): Promise<void>;
  close(): Promise<void>;
}

/** Stockage de blobs binaires, adossé à OPFS sur le web et au vrai système de fichiers
 *  (via le plugin Tauri `fs`) sur desktop — voir `./index.ts` pour le choix de backend.
 *  Interface volontairement minimale : c'est tout ce dont cacheStore/coverCache ont
 *  besoin (pas de listing, la taille/LRU sont suivis séparément dans leurs métadonnées). */
export interface BlobStore {
  fileSize(key: string): Promise<number>;
  createWriter(key: string): Promise<BlobWriter>;
  readAll(key: string): Promise<ArrayBuffer | null>;
  deleteFile(key: string): Promise<void>;
}
