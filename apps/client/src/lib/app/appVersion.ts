import { isElectron } from "../platform";

// Injecté par Vite (voir vite.config.ts) depuis la version de package.json (racine) au moment du
// build — c'est cette même valeur que scripts/set-version.mjs synchronise dans tauri.conf.json /
// Cargo.toml pour les builds desktop, donc web et desktop affichent toujours la même version que
// celle publiée sur GitHub (tag de release / image Docker).
declare const __APP_VERSION__: string;

let cachedVersion: string | null = null;

/** Version affichée dans les paramètres — via le pont Electron sur desktop (`app.getVersion()`
 *  côté process principal, lue depuis package.json), via la constante injectée au build sur web. */
export async function getAppVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  if (isElectron()) {
    cachedVersion = await window.resonia!.getVersion();
  } else {
    cachedVersion = __APP_VERSION__;
  }
  return cachedVersion;
}

/** Une version "1.4.0-beta.2" est une préversion — même convention que le workflow de release
 *  (.github/workflows/release.yml : canal beta si "-beta", stable sinon). */
export function isBetaVersion(version: string): boolean {
  return version.includes("-beta");
}

export type ReleaseChannel = "beta" | "stable";

/** Canal de la version en cours d'exécution, connu dès le chargement (version injectée au build,
 *  identique à `app.getVersion()` sous Electron : même package.json). */
export function currentReleaseChannel(): ReleaseChannel {
  return isBetaVersion(__APP_VERSION__) ? "beta" : "stable";
}

/** Choix explicite de l'utilisateur pour les mises à jour bêta, mémorisé avec le canal de la
 *  version sur laquelle il a été fait. */
export interface BetaUpdatesChoice {
  enabled: boolean;
  channel: ReleaseChannel;
}

/** Réception des mises à jour bêta : activée par défaut sur une version bêta (installée ou
 *  obtenue par mise à jour), désactivée par défaut sur une version stable. Un choix explicite
 *  n'est respecté que sur le canal où il a été fait : passer d'une stable à une bêta (ou
 *  l'inverse) revient au défaut du nouveau canal. */
export function resolveBetaUpdatesEnabled(choice: BetaUpdatesChoice | null, channel: ReleaseChannel): boolean {
  if (choice && choice.channel === channel) return choice.enabled;
  return channel === "beta";
}
