import { Store } from "@tauri-apps/plugin-store";
import type { StorageAdapter } from "./types";

const STORE_FILENAME = "resonia-storage.json";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load(STORE_FILENAME);
  }
  return storePromise;
}

export const tauriStoreAdapter: StorageAdapter = {
  async get<T>(key: string): Promise<T | null> {
    const store = await getStore();
    const value = await store.get<T>(key);
    return value ?? null;
  },
  async set<T>(key: string, value: T): Promise<void> {
    const store = await getStore();
    await store.set(key, value);
    await store.save();
  },
  async remove(key: string): Promise<void> {
    const store = await getStore();
    await store.delete(key);
    await store.save();
  },
};