const LRCLIB_BASE_URL = "https://lrclib.net/api";

/** Identification recommandée par LRCLIB (https://lrclib.net/docs) pour son API publique —
 *  gratuite, sans clé ni compte, aucune donnée personnelle envoyée (seulement titre/artiste/
 *  album/durée du morceau). Les navigateurs interdisent de surcharger le User-Agent d'un
 *  `fetch` (silencieusement ignoré, remplacé par celui du navigateur) ; seul un `fetchImpl`
 *  passant par un client HTTP natif (ex: Tauri côté bureau) peut réellement l'envoyer — voir
 *  l'appelant dans apps/client. */
export const LRCLIB_USER_AGENT = "Resonia (https://github.com/resonia-client)";

/** Tolérance de durée (secondes) au-delà de laquelle un résultat de `/search` n'est plus
 *  considéré comme fiable : LRCLIB n'a pas d'identifiant de piste stable à faire correspondre,
 *  la durée est le signal le plus fort pour écarter un morceau homonyme (reprise, live, remix,
 *  autre édition...). Assez large pour absorber l'écart courant entre la durée mesurée par
 *  Navidrome (silence de bord, padding d'encodeur) et celle déclarée par LRCLIB pour le même
 *  morceau — trop stricte, elle rejette de vraies correspondances plutôt que des homonymes. */
const SEARCH_DURATION_TOLERANCE_SECONDS = 5;

export interface LrcLibResult {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental: boolean;
}

interface LrcLibApiTrack {
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

function toResult(track: LrcLibApiTrack): LrcLibResult {
  return { syncedLyrics: track.syncedLyrics, plainLyrics: track.plainLyrics, instrumental: track.instrumental };
}

async function requestJson<T>(url: string, fetchImpl: typeof fetch): Promise<T | null> {
  const response = await fetchImpl(url, { headers: { "User-Agent": LRCLIB_USER_AGENT } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Échec LRCLIB (${response.status})`);
  return (await response.json()) as T;
}

/** `/api/get` : correspondance exacte (titre + artiste + album + durée, comparés côté serveur
 *  après normalisation) — le mode le plus fiable, celui que LRCLIB recommande en premier. */
async function fetchExact(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSeconds: number,
  fetchImpl: typeof fetch,
): Promise<LrcLibResult | null> {
  const params = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName,
    album_name: albumName,
    duration: String(Math.round(durationSeconds)),
  });
  const track = await requestJson<LrcLibApiTrack>(`${LRCLIB_BASE_URL}/get?${params.toString()}`, fetchImpl);
  return track ? toResult(track) : null;
}

/** Repli si `/api/get` ne trouve rien (métadonnées locales légèrement différentes du titre
 *  déposé sur LRCLIB — ponctuation, "feat.", remaster...) : recherche floue par titre + artiste,
 *  puis on ne retient le résultat le plus proche que si sa durée colle à quelques secondes près
 *  — jamais le premier venu, pour éviter d'afficher les paroles d'un autre morceau. */
async function searchClosest(
  trackName: string,
  artistName: string,
  durationSeconds: number,
  fetchImpl: typeof fetch,
): Promise<LrcLibResult | null> {
  const params = new URLSearchParams({ track_name: trackName, artist_name: artistName });
  const results = await requestJson<LrcLibApiTrack[]>(`${LRCLIB_BASE_URL}/search?${params.toString()}`, fetchImpl);
  if (!results || results.length === 0) return null;

  let best: LrcLibApiTrack | null = null;
  let bestDelta = Infinity;
  for (const candidate of results) {
    const delta = Math.abs(candidate.duration - durationSeconds);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }

  if (!best || bestDelta > SEARCH_DURATION_TOLERANCE_SECONDS) return null;
  return toResult(best);
}

/** Résout les paroles d'un morceau via LRCLIB (https://lrclib.net) — base ouverte et
 *  communautaire de paroles synchronisées, gratuite, sans clé ni compte requis, qui ne demande
 *  aucune donnée personnelle. Utilisé en repli quand le serveur Navidrome n'a rien (pas de
 *  fichier .lrc local ni de tag intégré) : correspondance exacte d'abord, recherche floue
 *  bornée par la durée ensuite. Renvoie `null` si rien de fiable n'est trouvé ; toute erreur
 *  réseau/HTTP est répercutée (jamais avalée ici) pour que l'appelant puisse distinguer "confirmé
 *  absent" d'"incertain, réessayer plus tard". */
export async function fetchLyricsFromLrcLib(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSeconds: number,
  fetchImpl: typeof fetch = fetch,
): Promise<LrcLibResult | null> {
  const exact = await fetchExact(trackName, artistName, albumName, durationSeconds, fetchImpl);
  if (exact) return exact;
  return searchClosest(trackName, artistName, durationSeconds, fetchImpl);
}
