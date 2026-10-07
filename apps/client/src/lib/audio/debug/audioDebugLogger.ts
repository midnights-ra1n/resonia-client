const DEBUG_ENABLED_KEY = "resonia:debug:audio";

export type DebugCategory = "decode" | "network";

export interface DebugLogEntry {
  id: number;
  ts: number; // performance.now() au moment de l'événement
  category: DebugCategory;
  event: string;
  data: Record<string, unknown>;
}

// Historique en mémoire consommé par le panneau développeur (voir features/player/debug) —
// volontairement borné : ce n'est pas un journal persistant, juste de quoi montrer l'activité
// récente sans laisser grossir la mémoire pendant une longue session d'écoute.
const MAX_ENTRIES = 300;
let seq = 0;
const buffer: DebugLogEntry[] = [];
const listeners = new Set<(entry: DebugLogEntry) => void>();
const resetListeners = new Set<() => void>();

// Historique séparé des événements significatifs (modes réseau, attentes, pauses, erreurs...),
// sans les `chunk:read` qui saturent `buffer` en une minute de téléchargement : c'est lui que
// copie le bouton « Copier le journal » du panneau développeur, pour diagnostiquer une coupure
// survenue plusieurs minutes plus tôt.
const MAX_KEY_ENTRIES = 800;
const keyBuffer: DebugLogEntry[] = [];
const CHATTY_EVENTS = new Set(["chunk:read", "decode:throughput"]);

export interface BandwidthSample {
  second: number; // Math.floor(performance.now() / 1000)
  networkBytes: number;
  decodeBytes: number;
}

// Débit agrégé par seconde, sur une fenêtre glissante de 60s — distinct du `buffer` d'événements
// bruts ci-dessus (celui-ci sature vite en téléchargement actif : ~250 Ko/chunk toutes les
// quelques centaines de ms dépasse largement MAX_ENTRIES avant même d'atteindre 60s d'historique).
export const HISTORY_SECONDS = 60;
const history: BandwidthSample[] = [];

/** Renvoie (et complète si besoin) le compartiment de la seconde courante, en comblant d'abord
 *  toute seconde sautée depuis le dernier événement par un compartiment à zéro — sans quoi une
 *  période d'inactivité laisserait un trou dans l'historique au lieu d'un vrai creux à zéro. */
function currentBucket(): BandwidthSample {
  const second = Math.floor(performance.now() / 1000);
  const last = history[history.length - 1];
  if (last && last.second === second) return last;

  // Après une longue inactivité, ne combler que la fenêtre utile (60 s), pas chaque seconde
  // écoulée depuis le dernier événement (des milliers d'objets créés puis jetés aussitôt).
  const start = last ? Math.max(last.second + 1, second - HISTORY_SECONDS) : second;
  for (let s = start; s < second; s++) {
    history.push({ second: s, networkBytes: 0, decodeBytes: 0 });
  }
  const bucket: BandwidthSample = { second, networkBytes: 0, decodeBytes: 0 };
  history.push(bucket);
  if (history.length > HISTORY_SECONDS) history.splice(0, history.length - HISTORY_SECONDS);
  return bucket;
}

// Lu une seule fois puis tenu à jour par setAudioDebugEnabled : `record()` est appelé à chaque
// chunk réseau, une lecture localStorage (synchrone, sérialisée) à chaque fois était du pur gâchis.
let consoleEnabled: boolean | null = null;

function isConsoleEnabled(): boolean {
  if (consoleEnabled === null) {
    consoleEnabled = typeof localStorage !== "undefined" && localStorage.getItem(DEBUG_ENABLED_KEY) === "1";
  }
  return consoleEnabled;
}

export function setAudioDebugEnabled(enabled: boolean) {
  localStorage.setItem(DEBUG_ENABLED_KEY, enabled ? "1" : "0");
  consoleEnabled = enabled;
}

function record(category: DebugCategory, event: string, data: Record<string, unknown>) {
  const entry: DebugLogEntry = { id: ++seq, ts: performance.now(), category, event, data };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  if (!CHATTY_EVENTS.has(event)) {
    keyBuffer.push(entry);
    if (keyBuffer.length > MAX_KEY_ENTRIES) keyBuffer.shift();
  }

  const bytes = typeof data.bytes === "number" ? data.bytes : 0;
  if (bytes > 0) {
    const bucket = currentBucket();
    if (category === "network" && event === "chunk:read") bucket.networkBytes += bytes;
    else if (category === "decode" && event === "decode:throughput") bucket.decodeBytes += bytes;
  }

  listeners.forEach((cb) => cb(entry));

  if (isConsoleEnabled()) {
    const color = category === "network" ? "#3b82f6" : "#10b981";
    console.log(`%c[${category} ${entry.ts.toFixed(1)}ms] ${event}`, `color:${color};font-weight:bold`, data);
  }
}

/** Événements du moteur de lecture/décodage (transitions d'état, rognage de silence,
 *  planification des sources buffer...). */
export function debugLog(event: string, data: Record<string, unknown> = {}) {
  record("decode", event, data);
}

/** Événements réseau (chunks téléchargés, retries, échecs, préchargement...). */
export function networkDebugLog(event: string, data: Record<string, unknown> = {}) {
  record("network", event, data);
}

/** S'abonne à chaque nouvel événement (décodage + réseau), au fil de l'eau. */
export function onDebugEntry(cb: (entry: DebugLogEntry) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Instantané de l'historique déjà accumulé (utile pour initialiser un panneau qui s'ouvre
 *  après coup). */
export function getDebugEntries(): DebugLogEntry[] {
  return buffer.slice();
}

/** Historique du débit (réseau + décodage) sur les `HISTORY_SECONDS` dernières secondes, un
 *  compartiment par seconde. Comble d'abord jusqu'à "maintenant" (voir `currentBucket`), donc
 *  reste exact même appelé en polling pendant une période d'inactivité totale. */
export function getBandwidthHistory(): BandwidthSample[] {
  currentBucket();
  return history.slice();
}

/** Vide l'historique d'événements ET de débit — utilisé par le bouton "Reset" du panneau
 *  développeur pour repartir d'un état propre sans recharger l'app. */
export function resetDebugStats() {
  buffer.length = 0;
  keyBuffer.length = 0;
  history.length = 0;
  resetListeners.forEach((cb) => cb());
}

/** Prévient quand `resetDebugStats()` est appelé, pour que tout état local dérivé (ex: liste
 *  d'événements accumulée par `useDebugEvents`) se vide en même temps que la source. */
export function onDebugReset(cb: () => void): () => void {
  resetListeners.add(cb);
  return () => resetListeners.delete(cb);
}

// Paramètres d'authentification Subsonic (utilisateur, jeton, sel, mot de passe) : un couple
// jeton + sel reste valable indéfiniment, il ne doit jamais finir dans un rapport de bug collé.
const AUTH_PARAMS = /([?&](?:u|t|s|p)=)[^&\s]+/g;

function formatValue(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(AUTH_PARAMS, "$1***");
}

/** Journal texte des événements significatifs (voir `keyBuffer`), avec le débit des 60 dernières
 *  secondes — à coller tel quel dans un rapport de bug. */
export function formatDebugLog(): string {
  const origin = keyBuffer[0]?.ts ?? performance.now();
  const lines = keyBuffer.map((e) => {
    const data = Object.entries(e.data)
      .map(([k, v]) => `${k}=${formatValue(v)}`)
      .join(" ");
    return `[+${((e.ts - origin) / 1000).toFixed(1)}s] ${e.category} ${e.event}${data ? ` ${data}` : ""}`;
  });
  const throughput = getBandwidthHistory()
    .map((b) => Math.round(b.networkBytes / 1024))
    .join(",");
  return [`Resonia — ${navigator.userAgent}`, `Débit réseau (Ko/s, 60 dernières s) : ${throughput}`, "", ...lines].join("\n");
}
