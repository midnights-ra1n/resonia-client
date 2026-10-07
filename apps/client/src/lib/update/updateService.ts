import { isElectron } from "../platform";

export interface UpdateProgress {
  percent: number;
  /** Octets déjà téléchargés / taille totale du téléchargement. */
  transferred: number;
  total: number;
}

export interface AppUpdate {
  version: string;
  currentVersion: string;
  /** Notes de version en texte brut (déjà converties depuis le HTML de GitHub par le process
   *  principal, voir releaseNotesToText). */
  notes: string | null;
  /** Télécharge la mise à jour, qui s'installera d'elle-même à la prochaine fermeture de l'app
   *  — ou tout de suite via relaunchApp. `adminPrompt` : texte de l'invite de mot de passe
   *  macOS, si l'app est installée dans un dossier que l'utilisateur ne peut pas modifier. */
  downloadAndInstall: (adminPrompt: string, onProgress?: (progress: UpdateProgress) => void) => Promise<void>;
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
    downloadAndInstall: async (adminPrompt, onProgress) => {
      const unsubscribe = onProgress ? api.update.onProgress(onProgress) : null;
      try {
        await api.update.download(adminPrompt);
      } finally {
        unsubscribe?.();
      }
    },
  };
}

/** Redémarre l'app pour appliquer tout de suite la mise à jour déjà téléchargée (installation
 *  silencieuse puis relance, voir `update:install` côté process principal) — à appeler
 *  uniquement après un downloadAndInstall réussi. */
export async function relaunchApp(): Promise<void> {
  if (!isElectron()) return;
  await window.resonia!.update.install();
}
