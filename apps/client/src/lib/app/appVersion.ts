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
 *  (release-beta.yml exige "-beta" dans package.json, release-stable.yml l'interdit). */
export function isBetaVersion(version: string): boolean {
  return version.includes("-beta");
}
