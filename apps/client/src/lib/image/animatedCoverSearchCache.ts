import { storage } from "../storage";

// Suffixe ":v2" : une version antérieure a pu mettre en cache un résultat négatif suite à une
// simple erreur réseau/rate-limit (au lieu d'un "pas de pochette animée" confirmé par l'API), ce
// qui figeait des albums valides pendant 30 jours sans plus jamais retenter de requête. Changer la
// clé abandonne silencieusement tout cache corrompu déjà écrit sur le disque des utilisateurs.
const SEARCH_RESULTS_KEY = "resonia:animatedCoverCache:searchResults:v2";
const RESOLVED_SOURCES_KEY = "resonia:animatedCoverCache:resolvedSources:v2";

// 30 jours : une pochette animée peut être ajoutée/retirée côté Apple Music, on veut finir par
// détecter le changement plutôt que de rester bloqué sur un résultat négatif à vie.
const SEARCH_RESULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// 7 jours : les variantes HLS/mp4 résolues (playlists m3u8) sont plus susceptibles de tourner
// que le simple "cette recherche n'a rien donné".
const RESOLVED_SOURCES_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface SearchResultEntry {
  masterUrl: string | null;
  cachedAt: number;
}

interface ResolvedSourcesEntry {
  hlsUrl: string;
  mp4Url: string;
  cachedAt: number;
}

// Persisté sur disque (storage) pour survivre aux redémarrages de l'app / rechargements de page :
// sans ça, chaque album sans pochette animée (l'immense majorité d'une bibliothèque) redéclenche
// un appel réseau à l'API m8tec à chaque session, y compris pour un résultat déjà connu.
let searchResultsPromise: Promise<Map<string, SearchResultEntry>> | null = null;
let resolvedSourcesPromise: Promise<Map<string, ResolvedSourcesEntry>> | null = null;

async function loadSearchResults(): Promise<Map<string, SearchResultEntry>> {
  if (!searchResultsPromise) {
    searchResultsPromise = storage
      .get<Record<string, SearchResultEntry>>(SEARCH_RESULTS_KEY)
      .then((stored) => new Map(Object.entries(stored ?? {})))
      .catch(() => new Map());
  }
  return searchResultsPromise;
}

async function loadResolvedSources(): Promise<Map<string, ResolvedSourcesEntry>> {
  if (!resolvedSourcesPromise) {
    resolvedSourcesPromise = storage
      .get<Record<string, ResolvedSourcesEntry>>(RESOLVED_SOURCES_KEY)
      .then((stored) => new Map(Object.entries(stored ?? {})))
      .catch(() => new Map());
  }
  return resolvedSourcesPromise;
}

function persistSearchResults(map: Map<string, SearchResultEntry>): void {
  storage.set(SEARCH_RESULTS_KEY, Object.fromEntries(map)).catch((err) => {
    console.warn("[animatedCoverSearchCache] Écriture du cache de recherche impossible", err);
  });
}

function persistResolvedSources(map: Map<string, ResolvedSourcesEntry>): void {
  storage.set(RESOLVED_SOURCES_KEY, Object.fromEntries(map)).catch((err) => {
    console.warn("[animatedCoverSearchCache] Écriture du cache de sources résolues impossible", err);
  });
}

/** `undefined` = pas en cache (il faut interroger l'API), `null` = en cache et confirmé sans
 *  pochette animée. */
export async function getCachedSearchResult(searchKey: string): Promise<string | null | undefined> {
  const map = await loadSearchResults();
  const entry = map.get(searchKey);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > SEARCH_RESULT_TTL_MS) {
    map.delete(searchKey);
    persistSearchResults(map);
    return undefined;
  }
  return entry.masterUrl;
}

export async function setCachedSearchResult(searchKey: string, masterUrl: string | null): Promise<void> {
  const map = await loadSearchResults();
  map.set(searchKey, { masterUrl, cachedAt: Date.now() });
  persistSearchResults(map);
}

export async function getCachedResolvedSources(
  masterUrl: string,
): Promise<{ hlsUrl: string; mp4Url: string } | undefined> {
  const map = await loadResolvedSources();
  const entry = map.get(masterUrl);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > RESOLVED_SOURCES_TTL_MS) {
    map.delete(masterUrl);
    persistResolvedSources(map);
    return undefined;
  }
  return { hlsUrl: entry.hlsUrl, mp4Url: entry.mp4Url };
}

export async function setCachedResolvedSources(
  masterUrl: string,
  sources: { hlsUrl: string; mp4Url: string },
): Promise<void> {
  const map = await loadResolvedSources();
  map.set(masterUrl, { ...sources, cachedAt: Date.now() });
  persistResolvedSources(map);
}

/** Vide le cache persisté (résultats de recherche + sources HLS/mp4 résolues) : permet de forcer
 *  une nouvelle requête à l'API plutôt que de continuer à servir un résultat déjà connu — utile
 *  après un changement d'URL personnalisée, ou pour retenter des albums restés sans pochette
 *  animée suite à un aléa passé de l'API. */
export async function clearAnimatedCoverSearchCache(): Promise<void> {
  searchResultsPromise = Promise.resolve(new Map());
  resolvedSourcesPromise = Promise.resolve(new Map());
  await Promise.all([storage.set(SEARCH_RESULTS_KEY, {}), storage.set(RESOLVED_SOURCES_KEY, {})]);
}
