import { create } from "zustand";

interface OnlineState {
  isOnline: boolean;
}

/** Détection simple basée sur `navigator.onLine` + événements `online`/`offline` — pas de
 *  ping actif : suffisant pour piloter des garde-fous UI (bandeau, désactivation de pistes
 *  non disponibles localement), pas une détection réseau de précision. */
export const useOnlineStore = create<OnlineState>(() => ({
  isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
}));

if (typeof window !== "undefined") {
  window.addEventListener("online", () => useOnlineStore.setState({ isOnline: true }));
  window.addEventListener("offline", () => useOnlineStore.setState({ isOnline: false }));
}

export function isOnline(): boolean {
  return useOnlineStore.getState().isOnline;
}
