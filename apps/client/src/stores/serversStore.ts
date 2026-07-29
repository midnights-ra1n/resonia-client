import { create } from "zustand";
import { storage } from "../lib/storage";

export interface StoredServer {
  id: string;
  name: string;
  url: string;
  username: string;
  salt: string;
  token: string;
  createdAt: number;
}

interface ServersState {
  servers: StoredServer[];
  activeServerId: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addServer: (server: StoredServer) => Promise<void>;
  removeServer: (id: string) => Promise<void>;
  setActiveServer: (id: string) => void;
}

const STORAGE_KEY = "resonia:servers";

export const useServersStore = create<ServersState>((set, get) => ({
  servers: [],
  activeServerId: null,
  hydrated: false,

  hydrate: async () => {
    const servers = (await storage.get<StoredServer[]>(STORAGE_KEY)) ?? [];
    set({ servers, activeServerId: servers[0]?.id ?? null, hydrated: true });
  },

  addServer: async (server) => {
    const servers = [...get().servers, server];
    await storage.set(STORAGE_KEY, servers);
    set({ servers, activeServerId: server.id });
  },

  removeServer: async (id) => {
    const servers = get().servers.filter((s) => s.id !== id);
    await storage.set(STORAGE_KEY, servers);
    set({
      servers,
      activeServerId: get().activeServerId === id ? (servers[0]?.id ?? null) : get().activeServerId,
    });
  },

  setActiveServer: (id) => set({ activeServerId: id }),
}));
