import { Store } from "@tauri-apps/plugin-store";
import type { StorageAdapter } from "./types";

const STORE_FILENAME = "resonia-storage.json";
// Auto-save débounced côté plugin (Rust) : évite un flush disque synchrone complet à
// chaque écriture. Le cache audio persiste ses métadonnées à chaque chunk téléchargé
// (~256 Ko) — sans ce debounce (ou en appelant store.save() manuellement après chaque
// set(), comme avant), chaque chunk déclenchait une sérialisation + écriture disque
// complète du fichier de stockage partagé, gelant l'UI plusieurs secondes en
// téléchargement actif.
const AUTO_SAVE_DEBOUNCE_MS = 1000;

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load(STORE_FILENAME, { autoSave: AUTO_SAVE_DEBOUNCE_MS });
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
    // Ne pas appeler store.save() ici : l'auto-save débounced du plugin s'en charge.
    await store.set(key, value);
  },
  async remove(key: string): Promise<void> {
    const store = await getStore();
    await store.delete(key);
  },
};