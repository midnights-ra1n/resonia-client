import { isElectron } from "../platform";

// Injecté par Vite (voir vite.config.ts) depuis la version de package.json (racine) au moment du
// build — c'est cette même valeur que scripts/set-version.mjs synchronise dans tauri.conf.json /
// Cargo.toml pour les builds desktop, donc web et desktop affichent toujours la même version que
// celle publiée sur GitHub (tag de release / image Docker).
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: number;

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

/** Canal de publication : "stable", "beta" (préversions -beta.N) ou "nightly" (builds quotidiens
 *  -nightly.N, avant les bêtas). Même convention que le workflow de release. */
export type ReleaseChannel = "stable" | "beta" | "nightly";

export const RELEASE_CHANNELS: readonly ReleaseChannel[] = ["stable", "beta", "nightly"];

export function isReleaseChannel(value: unknown): value is ReleaseChannel {
  return value === "stable" || value === "beta" || value === "nightly";
}

/** Canal d'une version : "1.4.0-nightly.3" → nightly, "1.4.0-beta.2" → beta, "1.4.0" → stable. */
export function releaseChannelOf(version: string): ReleaseChannel {
  if (version.includes("-nightly")) return "nightly";
  if (version.includes("-beta")) return "beta";
  return "stable";
}

/** Canal de la version en cours d'exécution, connu dès le chargement (version injectée au build,
 *  identique à `app.getVersion()` sous Electron : même package.json). */
export function currentReleaseChannel(): ReleaseChannel {
  return releaseChannelOf(__APP_VERSION__);
}

/** Ancien réglage (case « Recevoir les mises à jour bêta »), mémorisé avec le canal de la version
 *  sur laquelle il a été fait — lu une fois pour migrer vers `UpdateChannelChoice`. */
export interface BetaUpdatesChoice {
  enabled: boolean;
  channel: ReleaseChannel;
}

/** Canal de mise à jour choisi, mémorisé avec le canal de la version installée au moment du choix. */
export interface UpdateChannelChoice {
  channel: ReleaseChannel;
  installedChannel: ReleaseChannel;
}

export function migrateBetaUpdatesChoice(choice: BetaUpdatesChoice): UpdateChannelChoice {
  return { channel: choice.enabled ? "beta" : "stable", installedChannel: choice.channel };
}

/** Canal suivi : par défaut celui de la version installée (une nightly suit les nightlies, une
 *  bêta les bêtas…). Un choix explicite n'est respecté que tant que la version installée reste sur
 *  le canal où il a été fait : installer une version d'un autre canal revient à son défaut. */
export function resolveUpdateChannel(choice: UpdateChannelChoice | null, installed: ReleaseChannel): ReleaseChannel {
  if (choice && choice.installedChannel === installed) return choice.channel;
  return installed;
}

/** Numéro de build d'une nightly ("1.2.0-nightly.42" → 42), `null` pour une autre version. */
export function nightlyBuildNumber(version: string): number | null {
  const match = /-nightly\.(\d+)/.exec(version);
  return match ? Number(match[1]) : null;
}

/** Date de build au format MM/DD/YYYY @ HH:MM:SS (heure locale). */
export function formatBuildTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} @ ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Horodatage du build en cours d'exécution (injecté par Vite). */
export function buildTime(): number {
  return typeof __BUILD_TIME__ === "number" ? __BUILD_TIME__ : 0;
}
