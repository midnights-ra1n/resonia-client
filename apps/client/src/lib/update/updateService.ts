import { isTauri } from "../platform";

export interface AppUpdate {
  version: string;
  currentVersion: string;
  notes: string | null;
  /** Télécharge puis installe la mise à jour, sans relancer l'app — voir installAndRelaunch. */
  downloadAndInstall: (onProgress?: (percent: number) => void) => Promise<void>;
}

interface RawUpdateMetadata {
  rid: number;
  currentVersion: string;
  version: string;
  body: string | null;
  rawJson: Record<string, unknown>;
}

/** Vérifie s'il existe une mise à jour disponible sur le canal demandé. `beta` détermine
 *  l'endpoint interrogé à l'exécution (voir la commande Rust `check_for_update` dans lib.rs) :
 *  contrairement au comportement par défaut du plugin updater, dont l'endpoint est figé au
 *  build (tauri.conf.json / tauri.beta.conf.json), ceci permet à une build STABLE de basculer
 *  sur le flux beta si l'utilisateur active ce réglage, sans avoir à réinstaller l'app depuis
 *  l'autre canal. Ne fait rien côté web : le client web est toujours servi à jour, seule l'app
 *  de bureau a besoin de vérifier et d'installer une mise à jour elle-même. */
export async function checkForUpdate(beta: boolean): Promise<AppUpdate | null> {
  if (!isTauri()) return null;

  const [{ invoke }, { Update }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/plugin-updater"),
  ]);

  const metadata = await invoke<RawUpdateMetadata | null>("check_for_update", { beta });
  if (!metadata) return null;

  const update = new Update({
    rid: metadata.rid,
    currentVersion: metadata.currentVersion,
    version: metadata.version,
    body: metadata.body ?? undefined,
    rawJson: metadata.rawJson,
  });

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
 *  uniquement après un downloadAndInstall réussi. Sans effet sur Windows : l'installeur NSIS y
 *  relance déjà l'app lui-même une fois l'installation terminée (restartAfterInstall, activé
 *  par défaut côté plugin), l'app ayant alors déjà quitté avant que ce code ne s'exécute. */
export async function relaunchApp(): Promise<void> {
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
