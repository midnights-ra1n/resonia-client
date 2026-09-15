import type { StorageAdapter } from "./types";

function bridge() {
  const api = window.resonia;
  if (!api) throw new Error("electronStoreAdapter utilisé hors environnement Electron");
  return api;
}

/** Backend clé/valeur adossé à un fichier JSON maintenu par le process principal (IPC
 *  `store:*`, voir `electron/main/index.ts`) — équivalent du plugin `tauri-plugin-store`
 *  utilisé auparavant. L'auto-save débounced vit côté main, pas ici. */
export const electronStoreAdapter: StorageAdapter = {
  async get<T>(key: string): Promise<T | null> {
    return (await bridge().store.get(key)) as T | null;
  },
  async set<T>(key: string, value: T): Promise<void> {
    await bridge().store.set(key, value);
  },
  async remove(key: string): Promise<void> {
    await bridge().store.remove(key);
  },
};
