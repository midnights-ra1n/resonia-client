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
  /** Fichier entier sous forme de Blob, pour une URL `blob:` de lecture. Sur OPFS, c'est le
   *  `File` du disque lui-même : AUCUNE copie en mémoire, le moteur lit le disque à la demande
   *  (contrairement à `new Blob([await readAll()])`, qui garde tout le fichier en RAM tant que
   *  l'URL vit). */
  readAsBlob(key: string, type: string): Promise<Blob | null>;
  deleteFile(key: string): Promise<void>;
  /** Bureau uniquement : télécharge `url` directement dans le fichier de `key` à partir de l'octet
   *  `from`, depuis le process principal (voir `downloads` dans electron/main/index.ts). Absent sur
   *  le web, où `TrackDownloader` lit lui-même le flux et écrit via `createWriter`. */
  download?(
    key: string,
    url: string,
    from: number,
    signal: AbortSignal,
    handlers: BlobDownloadHandlers,
    suspension?: SuspendSignal,
    options?: BlobDownloadOptions,
  ): Promise<BlobDownloadResult>;
}

export interface BlobDownloadOptions {
  /** Plages HTTP téléchargées en parallèle au plus (1 = une seule connexion). */
  maxSegments?: number;
}

/** Pause « douce » d'un téléchargement : la connexion reste ouverte mais son corps n'est plus lu.
 *  Le contrôle de flux TCP fait alors cesser l'envoi côté serveur, sans perdre la position — à
 *  l'inverse d'un abandon (`AbortSignal`), qui oblige à rouvrir une connexion et, pour un flux
 *  transcodé à la volée (plages HTTP ignorées), à tout retélécharger depuis l'octet 0. */
export interface SuspendSignal {
  readonly suspended: boolean;
  onChange(cb: (suspended: boolean) => void): () => void;
}

export interface BlobDownloadHandlers {
  /** `bytes` : préfixe contigu déjà écrit depuis le début du fichier (point de reprise) ;
   *  `received` : octets reçus depuis le dernier appel, toutes connexions confondues (débit). */
  onProgress(bytes: number, total: number, received: number): void;
}

export interface BlobDownloadResult {
  complete: boolean;
  bytes: number;
  total: number;
  error: string | null;
}
