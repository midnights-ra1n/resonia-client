import { create } from "zustand";
import {
  checkForUpdate,
  relaunchApp,
  type AppUpdate,
  type UpdateProgress,
} from "../lib/update/updateService";

function formatUpdateError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export type UpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "ready"
  | "error";

interface UpdateState {
  status: UpdateStatus;
  version: string | null;
  notes: string | null;
  progress: number;
  /** Octets téléchargés / taille totale, pour l'indicateur de la barre supérieure. */
  downloadedBytes: number;
  totalBytes: number;
  pendingUpdate: AppUpdate | null;
  /** Détail brut de la dernière erreur (message d'exception côté Rust ou JS) — jamais affiché
   *  tel quel dans l'interface générale (message traduit générique à la place), mais exposé en
   *  info-bulle pour pouvoir diagnostiquer sans avoir à ouvrir la console. */
  errorMessage: string | null;
  /** Interroge GitHub (via la commande Rust check_for_update) sur le canal demandé. Passe le
   *  store en "available" (avec la mise à jour prête à être installée) ou "up-to-date". Ignore
   *  l'appel si une vérification ou une installation est déjà en cours, pour ne jamais
   *  chevaucher deux téléchargements ou perdre une mise à jour déjà prête à redémarrer. */
  check: (beta: boolean) => Promise<boolean>;
  /** Télécharge la mise à jour trouvée par check(), sans relancer l'app : elle s'installera à la
   *  prochaine fermeture, ou tout de suite via relaunch(). Passe le store en "ready" une fois le
   *  téléchargement terminé : c'est ce statut que la barre supérieure surveille pour afficher le
   *  bouton de redémarrage. `adminPrompt` : voir AppUpdate.downloadAndInstall. */
  install: (adminPrompt: string) => Promise<void>;
  /** Enchaîne check() puis install() si une mise à jour est trouvée — dès qu'une mise à jour est
   *  détectée (vérification au lancement, quotidienne ou manuelle), elle est téléchargée. */
  checkAndInstall: (beta: boolean, adminPrompt: string) => Promise<void>;
  relaunch: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: "idle",
  version: null,
  notes: null,
  progress: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  pendingUpdate: null,
  errorMessage: null,

  check: async (beta) => {
    const current = get().status;
    if (
      current === "checking" ||
      current === "downloading" ||
      current === "ready"
    ) {
      return current === "ready";
    }
    set({ status: "checking", errorMessage: null });
    try {
      const update = await checkForUpdate(beta);
      if (!update) {
        set({
          status: "up-to-date",
          version: null,
          notes: null,
          pendingUpdate: null,
        });
        return false;
      }
      set({
        status: "available",
        version: update.version,
        notes: update.notes,
        pendingUpdate: update,
      });
      return true;
    } catch (err) {
      console.warn("[update] Échec de la vérification de mise à jour", err);
      set({ status: "error", errorMessage: formatUpdateError(err) });
      return false;
    }
  },

  install: async (adminPrompt) => {
    const { pendingUpdate } = get();
    if (!pendingUpdate) return;
    set({ status: "downloading", progress: 0, downloadedBytes: 0, totalBytes: 0, errorMessage: null });
    try {
      await pendingUpdate.downloadAndInstall(adminPrompt, (p: UpdateProgress) =>
        set({ progress: p.percent, downloadedBytes: p.transferred, totalBytes: p.total }),
      );
      set({ status: "ready", progress: 100 });
    } catch (err) {
      console.error("[update] Échec du téléchargement/installation", err);
      set({ status: "error", errorMessage: formatUpdateError(err) });
    }
  },

  checkAndInstall: async (beta, adminPrompt) => {
    const available = await get().check(beta);
    if (available && get().status === "available") await get().install(adminPrompt);
  },

  relaunch: async () => {
    await relaunchApp();
  },
}));
