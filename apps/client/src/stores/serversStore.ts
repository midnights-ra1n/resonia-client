import { create } from "zustand";
import { storage } from "../lib/storage";
import { clearQueries } from "../lib/cache/queryCache";
import type { EncryptedPassword } from "../lib/security/passwordVault";

export interface StoredServer {
  id: string;
  name: string;
  url: string;
  username: string;
  salt: string;
  token: string;
  encryptedPassword?: EncryptedPassword;
  /** Couleur de la bulle du compte (menu utilisateur), tirée au hasard à l'ajout du serveur. */
  avatarColor?: string;
  createdAt: number;
}

interface ServersState {
  servers: StoredServer[];
  activeServerId: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addServer: (server: StoredServer) => Promise<void>;
  updateServer: (id: string, patch: Partial<Omit<StoredServer, "id" | "createdAt">>) => Promise<void>;
  removeServer: (id: string) => Promise<void>;
  setActiveServer: (id: string) => void;
}

const STORAGE_KEY = "resonia:servers";
const ACTIVE_STORAGE_KEY = "resonia:activeServerId";

// Teintes vives lisibles avec un texte sombre (voir AccountAvatar), assez distinctes entre elles
// pour reconnaître un compte d'un coup d'œil dans la liste des serveurs.
const AVATAR_COLORS = [
  "#f28b82",
  "#fbbc04",
  "#81c995",
  "#78d9ec",
  "#8ab4f8",
  "#c58af9",
  "#ff8bcb",
  "#fcad70",
  "#4fb9a5",
  "#e6c07b",
];

export function pickAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

export const useServersStore = create<ServersState>((set, get) => ({
  servers: [],
  activeServerId: null,
  hydrated: false,

  // Lecture SYNCHRONE (voir `StorageAdapter.getSync`), appelée dans main.tsx avant le premier
  // rendu : la session est connue d'emblée, l'app s'affiche sans écran de chargement.
  hydrate: async () => {
    const stored = storage.getSync<StoredServer[]>(STORAGE_KEY);
    const storedActiveId = storage.getSync<string>(ACTIVE_STORAGE_KEY);
    let servers = stored ?? [];
    // Serveurs enregistrés avant l'arrivée des bulles de compte : on leur attribue une couleur
    // une fois pour toutes, plutôt qu'à chaque lancement (elle doit rester stable).
    const needsColors = servers.some((s) => !s.avatarColor);
    if (needsColors) servers = servers.map((s) => (s.avatarColor ? s : { ...s, avatarColor: pickAvatarColor() }));
    const activeServerId = servers.some((s) => s.id === storedActiveId)
      ? storedActiveId
      : (servers[0]?.id ?? null);
    set({ servers, activeServerId, hydrated: true });
    if (needsColors) await storage.set(STORAGE_KEY, servers);
  },

  addServer: async (server) => {
    const servers = [...get().servers, server];
    await Promise.all([storage.set(STORAGE_KEY, servers), storage.set(ACTIVE_STORAGE_KEY, server.id)]);
    set({ servers, activeServerId: server.id });
  },

  updateServer: async (id, patch) => {
    const servers = get().servers.map((s) => (s.id === id ? { ...s, ...patch } : s));
    await storage.set(STORAGE_KEY, servers);
    set({ servers });
  },

  removeServer: async (id) => {
    const servers = get().servers.filter((s) => s.id !== id);
    const activeServerId = get().activeServerId === id ? (servers[0]?.id ?? null) : get().activeServerId;
    await Promise.all([
      storage.set(STORAGE_KEY, servers),
      activeServerId ? storage.set(ACTIVE_STORAGE_KEY, activeServerId) : storage.remove(ACTIVE_STORAGE_KEY),
    ]);
    set({ servers, activeServerId });
    // Métadonnées en cache de ce serveur (persistées entre deux lancements) : plus utiles.
    clearQueries((key) => key.startsWith(`${id}:`));
  },

  setActiveServer: (id) => {
    storage.set(ACTIVE_STORAGE_KEY, id);
    set({ activeServerId: id });
  },
}));
