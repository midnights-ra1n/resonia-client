import { getPlatform } from "../../platform";
import { DesktopBaseDir } from "./baseDirectory";
import { createElectronFsBlobStore } from "./electronFsBlobStore";
import { createOpfsBlobStore } from "./opfsBlobStore";
import type { BlobStore } from "./types";

export type { BlobStore, BlobWriter } from "./types";
export { DesktopBaseDir } from "./baseDirectory";

/** `rootDir` sépare les espaces de nommage (cache audio, pochettes, téléchargements) au sein
 *  du même backend — sur desktop, ce sont des sous-dossiers de `desktopBaseDir` (par défaut
 *  `AppCache`, purgeable par l'OS ; les téléchargements persistants passent `AppData`). Sans
 *  effet côté web (OPFS n'a pas cette distinction). */
export function createBlobStore(rootDir: string, desktopBaseDir?: DesktopBaseDir): BlobStore {
  return getPlatform() === "desktop"
    ? createElectronFsBlobStore(rootDir, desktopBaseDir)
    : createOpfsBlobStore(rootDir);
}
