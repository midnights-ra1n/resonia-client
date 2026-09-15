import { electronStoreAdapter } from "./electronStoreAdapter";
import { localStorageAdapter } from "./localStorageAdapter";
import { getPlatform } from "../platform";
import type { StorageAdapter } from "./types";

export const storage: StorageAdapter =
  getPlatform() === "desktop" ? electronStoreAdapter : localStorageAdapter;

export * from "./types";