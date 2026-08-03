import { localStorageAdapter } from "./localStorageAdapter";
import { tauriStoreAdapter } from "./tauriStoreAdapter";
import { getPlatform } from "../platform";
import type { StorageAdapter } from "./types";

export const storage: StorageAdapter =
  getPlatform() === "desktop" ? tauriStoreAdapter : localStorageAdapter;

export * from "./types";