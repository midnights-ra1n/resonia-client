import { isTauri } from "../platform";

export interface AppUpdate {
  version: string;
  currentVersion: string;
  notes: string | null;
  /** Télécharge puis installe la mise à jour, sans relancer l'app — voir installAndRelaunch. */
  downloadAndInstall: (onProgress?: (percent: number) => void) => Promise<void>;
}

/** Vérifie s'il existe une mise à jour disponible en interrogeant l'endpoint updater configuré
 *  dans tauri.conf.json (une release GitHub par canal, voir tauri.beta.conf.json). Ne fait rien
 *  côté web : le client web est toujours servi à jour, seule l'app de bureau a besoin de
 *  vérifier et d'installer une mise à jour elle-même. */
export async function checkForUpdate(): Promise<AppUpdate | null> {
  if (!isTauri()) return null;

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;

  return {
    version: update.version,
    currentVersion: update.currentVersion,
    // `notes` provient du corps de la release GitHub : c'est la même source que la page
    // releases de GitHub, donc les deux affichages restent garantis identiques.
    notes: update.body ?? null,
    downloadAndInstall: async (onProgress) => {
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (onProgress && total > 0) {
            onProgress(Math.min(100, Math.round((downloaded / total) * 100)));
          }
        } else if (event.event === "Finished") {
          onProgress?.(100);
        }
      });
    },
  };
}

/** Redémarre l'app pour appliquer la mise à jour déjà installée sur le disque. À appeler
 *  uniquement après un downloadAndInstall réussi. */
export async function relaunchApp(): Promise<void> {
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
