export interface AppUpdate {
  version: string;
  currentVersion: string;
  notes: string | null;
  /** Télécharge puis installe la mise à jour, sans relancer l'app — voir installAndRelaunch. */
  downloadAndInstall: (onProgress?: (percent: number) => void) => Promise<void>;
}

// TODO Phase 2 (migration Electron) : brancher `electron-updater` ici (canal stable/beta via
// `autoUpdater.channel`, IPC `update:check`/`update:download`/`update:install` exposés par
// `electron/main/index.ts`) en conservant cette même signature publique
// (`checkForUpdate`/`relaunchApp`) pour que les appelants (UpdateNotifier.tsx, SettingsPage.tsx)
// n'aient rien à changer. Volontairement un no-op le temps de cette phase : l'ancien mécanisme
// Tauri (commande Rust `check_for_update` + `@tauri-apps/plugin-updater`) n'existe plus côté
// Electron, et un faux "aucune mise à jour" est préférable à une tentative d'appel vers une API
// absente.
export async function checkForUpdate(beta: boolean): Promise<AppUpdate | null> {
  void beta; // paramètre conservé pour la signature publique — branché en Phase 2.
  return null;
}

/** Redémarre l'app pour appliquer la mise à jour déjà installée sur le disque. Voir le TODO
 *  ci-dessus — sans effet tant que `checkForUpdate` ne renvoie jamais de mise à jour réelle. */
export async function relaunchApp(): Promise<void> {
  /* TODO Phase 2 : app.relaunch() + app.exit() côté process principal, via IPC. */
}
