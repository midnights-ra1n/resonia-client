export interface AnimatedArtworkSearchResult {
  squareUrl: string | null;
  tallUrl: string | null;
  artist: string;
  album: string;
}

interface AnimatedArtworkSearchResponse {
  url?: string;
  url_tall?: string;
  artist?: string;
  album?: string;
  message?: string;
}

// Intégration https://github.com/m8tec/apple-music-animated-artworks. L'instance publique par
// défaut plante régulièrement ; l'URL de base est donc surchargeable (voir Settings) pour pointer
// vers une instance auto-hébergée ou un miroir, sans changer de code.
export const DEFAULT_ANIMATED_ARTWORK_BASE_URL = "https://artwork.m8tec.top";

function searchEndpointFor(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/v1/artwork/search`;
}

function urlEndpointFor(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/v1/artwork/url`;
}

/** Normalise un titre pour comparaison stricte : insensible à la casse, aux espaces superflus,
 *  aux accents et à la variante d'apostrophe (courbe vs droite). Ne retire volontairement AUCUN
 *  texte entre parenthèses — c'est précisément ce qui distingue par ex. "1989" de "1989 (Taylor's
 *  Version)", deux albums différents que l'API ne doit jamais confondre. */
function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** API tierce (artwork.m8tec.top) qui extrait les pochettes animées HLS d'Apple Music.
 *  Renvoie null quand l'album n'a pas de pochette animée (réponse 404, cas normal et fréquent,
 *  pas une erreur) — voir Apple Music Animated Artwork Downloader. */
export async function searchAnimatedArtwork(
  artist: string,
  album: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = DEFAULT_ANIMATED_ARTWORK_BASE_URL,
): Promise<AnimatedArtworkSearchResult | null> {
  const params = new URLSearchParams({ artist, album });
  const response = await fetchImpl(
    `${searchEndpointFor(baseUrl)}?${params.toString()}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Échec de la recherche de pochette animée (${response.status})`,
    );
  }

  const data = (await response.json()) as AnimatedArtworkSearchResponse;
  if (!data.url && !data.url_tall) return null;

  // L'API fait un matching flou côté serveur et peut renvoyer la pochette d'un album voisin
  // (typiquement une réédition "Taylor's Version" confondue avec l'originale, ou l'inverse) :
  // on rejette toute réponse dont le titre d'album ne correspond pas exactement à celui demandé
  // plutôt que d'afficher la pochette animée d'un autre album.
  if (
    data.album !== undefined &&
    normalizeTitle(data.album) !== normalizeTitle(album)
  ) {
    return null;
  }

  return {
    squareUrl: data.url ?? null,
    tallUrl: data.url_tall ?? null,
    artist: data.artist ?? artist,
    album: data.album ?? album,
  };
}

/** Variante de searchAnimatedArtwork qui interroge directement l'API m8tec avec une URL Apple
 *  Music déjà connue (`GET /api/v1/artwork/url`), plutôt que de lui laisser deviner l'album via
 *  une recherche texte artiste/titre. Ce chemin est nettement plus fiable pour les albums dont le
 *  titre contient des caractères spéciaux (apostrophes, parenthèses, etc.) : côté serveur, il va
 *  directement parser la page Apple Music (identifiant numérique de l'album) au lieu de scraper
 *  une page de résultats de recherche et d'essayer d'y retrouver le bon lien — c'est précisément
 *  cette étape de matching texte qui échoue régulièrement sur ces caractères. Voir
 *  resolveAppleMusicAlbumUrl (itunes/client.ts) pour obtenir l'URL à passer ici. */
export async function searchAnimatedArtworkByUrl(
  appleMusicUrl: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = DEFAULT_ANIMATED_ARTWORK_BASE_URL,
): Promise<AnimatedArtworkSearchResult | null> {
  const params = new URLSearchParams({ url: appleMusicUrl });
  const response = await fetchImpl(
    `${urlEndpointFor(baseUrl)}?${params.toString()}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Échec de la résolution de pochette animée par URL (${response.status})`,
    );
  }

  const data = (await response.json()) as AnimatedArtworkSearchResponse;
  if (!data.url && !data.url_tall) return null;

  return {
    squareUrl: data.url ?? null,
    tallUrl: data.url_tall ?? null,
    artist: data.artist ?? "",
    album: data.album ?? "",
  };
}

interface AnimatedArtworkStatusResponse {
  status?: string;
  message?: string;
  totalSearches?: number;
  totalDownloads?: number;
}

/** Raison précise d'un échec de checkAnimatedArtworkHealth, pour afficher un message utile plutôt
 *  qu'un simple "injoignable" qui laisse croire que le serveur est down :
 *  - "network" : le fetch a levé une exception (CORS, mixed content http/https, certificat
 *    auto-signé, DNS, timeout...) — l'instance peut très bien être en ligne et saine ; c'est le cas
 *    le plus trompeur car indiscernable d'un vrai serveur down du point de vue du navigateur.
 *  - "http" : réponse HTTP reçue mais statut non-2xx (mauvaise route, 404 sur une URL qui ne sert
 *    pas l'API m8tec, 5xx...).
 *  - "format" : réponse 2xx mais JSON invalide ou champ `status` inattendu (pas la même API, ou
 *    version incompatible). */
export type AnimatedArtworkHealthFailureReason = "network" | "http" | "format";

export interface AnimatedArtworkHealthResult {
  ok: boolean;
  reason?: AnimatedArtworkHealthFailureReason;
}

/** Vérifie qu'une instance de l'API (par défaut ou personnalisée, voir DEFAULT_ANIMATED_ARTWORK_BASE_URL)
 *  répond correctement, pour afficher un indicateur (coche/croix) dans les réglages. Utilise la
 *  vraie route de santé du serveur (`GET /api/v1/status`, qui renvoie
 *  `{ status: "operational" | "degraded", message, totalSearches, totalDownloads }`) plutôt qu'une
 *  requête de recherche bidon : "operational" = l'instance et Apple Music répondent normalement,
 *  "degraded" = l'instance est up mais Apple Music la rate-limite (résultats possiblement
 *  instables) — dans les deux cas on considère l'instance joignable. En cas d'échec, `reason`
 *  distingue une vraie erreur HTTP/format d'une exception réseau (souvent CORS côté web, voir
 *  AnimatedArtworkHealthFailureReason) plutôt que d'annoncer "hors service" pour un serveur qui
 *  répond en réalité très bien. */
export async function checkAnimatedArtworkHealth(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AnimatedArtworkHealthResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/api/v1/status`);
  } catch {
    return { ok: false, reason: "network" };
  }

  if (!response.ok) return { ok: false, reason: "http" };

  try {
    const data = (await response.json()) as AnimatedArtworkStatusResponse;
    if (data.status === "operational" || data.status === "degraded") {
      return { ok: true };
    }
    return { ok: false, reason: "format" };
  } catch {
    return { ok: false, reason: "format" };
  }
}

// Historique : ce fichier contenait auparavant un parsing manuel de la playlist HLS "master"
// (choix de la plus petite variante avc1, extraction du .mp4 CMAF référencé par #EXT-X-MAP) pour
// télécharger un unique fichier .mp4 "à plat" et le donner tel quel à un <video src>. Abandonné :
// les fragments Apple ont des timestamps internes (tfdt/baseMediaDecodeTime) calés sur la timeline
// globale du flux, pas remis à zéro — un décodeur "fichier isolé" (le <video> de Blink hors HLS)
// refuse ça (MEDIA_ERR_SRC_NOT_SUPPORTED), alors qu'un vrai lecteur HLS (natif WebKit, ou hls.js
// via MediaSource côté Blink/Gecko) le gère nativement. Voir useAnimatedAlbumCover.ts et
// AnimatedAlbumCoverVideo.tsx côté client : on se contente maintenant de donner l'URL de la
// playlist "master" telle quelle à ces lecteurs, qui se chargent eux-mêmes du choix de variante et
// du démuxage.
