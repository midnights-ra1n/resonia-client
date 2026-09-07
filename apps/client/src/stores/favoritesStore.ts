import { create } from "zustand";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { useServersStore } from "./serversStore";

function getActiveClient() {
  const { servers, activeServerId } = useServersStore.getState();
  const server = servers.find((s) => s.id === activeServerId);
  return server ? getClientForServer(server) : null;
}

interface FavoritesState {
  likedIds: Set<string>;
  loaded: boolean;
  /** Recharge l'ensemble des titres likés depuis le serveur (source de vérité). */
  load: () => Promise<void>;
  /** Remplace l'ensemble local sans requête réseau (ex: après un fetch fait ailleurs). */
  setLiked: (ids: string[]) => void;
  isLiked: (id: string) => boolean;
  like: (id: string) => void;
  unlike: (id: string) => void;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  likedIds: new Set(),
  loaded: false,

  load: async () => {
    const client = getActiveClient();
    if (!client) return;
    try {
      const songs = await client.getStarred2();
      set({ likedIds: new Set(songs.map((s) => s.id)), loaded: true });
    } catch (err) {
      console.error("[favorites] Échec du chargement", err);
    }
  },

  setLiked: (ids) => set({ likedIds: new Set(ids), loaded: true }),

  isLiked: (id) => get().likedIds.has(id),

  like: (id) => {
    const client = getActiveClient();
    if (!client) return;
    set((state) => ({ likedIds: new Set(state.likedIds).add(id) }));
    client.star(id).catch((err) => console.error("[favorites] Échec de l'ajout", err));
  },

  unlike: (id) => {
    const client = getActiveClient();
    if (!client) return;
    set((state) => {
      const next = new Set(state.likedIds);
      next.delete(id);
      return { likedIds: next };
    });
    client.unstar(id).catch((err) => console.error("[favorites] Échec du retrait", err));
  },
}));
