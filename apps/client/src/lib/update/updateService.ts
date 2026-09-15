import { isElectron } from "../platform";

export interface AppUpdate {
  version: string;
  currentVersion: string;
  notes: string | null;
  /** Télécharge puis installe la mise à jour, sans relancer l'app — voir relaunchApp. */
  downloadAndInstall: (onProgress?: (percent: number) => void) => Promise<void>;
}

/** Vérifie s'il existe une mise à jour disponible sur le canal demandé, via `electron-updater`
 *  côté process principal (voir `update:check` dans `electron/main/index.ts`) — `beta`
 *  détermine à l'exécution quel canal cibler (releases GitHub marquées prerelease pour le
 *  canal beta), même intention que le double endpoint stable/beta de l'ancien
 *  tauri.conf.json/tauri.beta.conf.json. Ne fait rien côté web : le client web est toujours
 *  servi à jour, seule l'app de bureau a besoin de vérifier et d'installer une mise à jour
 *  elle-même. */
export async function checkForUpdate(beta: boolean): Promise<AppUpdate | null> {
  if (!isElectron()) return null;
  const api = window.resonia!;

  const info = await api.update.check(beta);
  if (!info) return null;

  return {
    version: info.version,
    currentVersion: info.currentVersion,
    notes: info.notes,
    downloadAndInstall: async (onProgress) => {
      const unsubscribe = onProgress ? api.update.onProgress(onProgress) : null;
      try {
        await api.update.download();
      } finally {
        unsubscribe?.();
      }
    },
  };
}

/** Redémarre l'app pour appliquer la mise à jour déjà téléchargée sur le disque (`autoUpdater.
 *  quitAndInstall()` côté process principal) — à appeler uniquement après un
 *  downloadAndInstall réussi. */
export async function relaunchApp(): Promise<void> {
  if (!isElectron()) return;
  await window.resonia!.update.install();
}
