import { localStorageAdapter } from "./localStorageAdapter";
import type { StorageAdapter } from "./types";

// TODO: Plug in a Tauri adapter (Secure Store) once Tauri has been initialized.
export const storage: StorageAdapter = localStorageAdapter;

export * from "./types";
