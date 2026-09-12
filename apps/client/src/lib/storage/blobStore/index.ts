import type { BaseDirectory } from "@tauri-apps/plugin-fs";
import { getPlatform } from "../../platform";
import { createOpfsBlobStore } from "./opfsBlobStore";
import { createTauriFsBlobStore } from "./tauriFsBlobStore";
import type { BlobStore } from "./types";

export type { BlobStore, BlobWriter } from "./types";

/** `rootDir` sépare les espaces de nommage (cache audio, pochettes, téléchargements) au sein
 *  du même backend — sur desktop, ce sont des sous-dossiers de `desktopBaseDir` (par défaut
 *  `AppCache`, purgeable par l'OS ; les téléchargements persistants passent `AppData`). Sans
 *  effet côté web (OPFS n'a pas cette distinction). */
export function createBlobStore(rootDir: string, desktopBaseDir?: BaseDirectory): BlobStore {
  return getPlatform() === "desktop"
    ? createTauriFsBlobStore(rootDir, desktopBaseDir)
    : createOpfsBlobStore(rootDir);
}
