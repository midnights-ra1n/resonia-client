import { getPlatform } from "../../platform";
import { createOpfsBlobStore } from "./opfsBlobStore";
import { createTauriFsBlobStore } from "./tauriFsBlobStore";
import type { BlobStore } from "./types";

export type { BlobStore, BlobWriter } from "./types";

/** `rootDir` sépare les espaces de nommage (cache audio vs pochettes) au sein du même
 *  backend — sur desktop, ce sont deux sous-dossiers de `$APPCACHE`. */
export function createBlobStore(rootDir: string): BlobStore {
  return getPlatform() === "desktop" ? createTauriFsBlobStore(rootDir) : createOpfsBlobStore(rootDir);
}
