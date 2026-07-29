import type { StorageAdapter } from "./types";

export const localStorageAdapter: StorageAdapter = {
  async get<T>(key: string): Promise<T | null> {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    window.localStorage.setItem(key, JSON.stringify(value));
  },
  async remove(key: string): Promise<void> {
    window.localStorage.removeItem(key);
  },
};
