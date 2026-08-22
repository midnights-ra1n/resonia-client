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
  const response = await fetchImpl(`${searchEndpointFor(baseUrl)}?${params.toString()}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Échec de la recherche de pochette animée (${response.status})`);
  }

  const data = (await response.json()) as AnimatedArtworkSearchResponse;
  if (!data.url && !data.url_tall) return null;

  // L'API fait un matching flou côté serveur et peut renvoyer la pochette d'un album voisin
  // (typiquement une réédition "Taylor's Version" confondue avec l'originale, ou l'inverse) :
  // on rejette toute réponse dont le titre d'album ne correspond pas exactement à celui demandé
  // plutôt que d'afficher la pochette animée d'un autre album.
  if (data.album !== undefined && normalizeTitle(data.album) !== normalizeTitle(album)) {
    return null;
  }

  return {
    squareUrl: data.url ?? null,
    tallUrl: data.url_tall ?? null,
    artist: data.artist ?? artist,
    album: data.album ?? album,
  };
}

interface AnimatedArtworkStatusResponse {
  status?: string;
  message?: string;
  totalSearches?: number;
  totalDownloads?: number;
}

/** Vérifie qu'une instance de l'API (par défaut ou personnalisée, voir DEFAULT_ANIMATED_ARTWORK_BASE_URL)
 *  répond correctement, pour afficher un indicateur (coche/croix) dans les réglages. Utilise la
 *  vraie route de santé du serveur (`GET /api/v1/status`, qui renvoie
 *  `{ status: "operational" | "degraded", message, totalSearches, totalDownloads }`) plutôt qu'une
 *  requête de recherche bidon : "operational" = l'instance et Apple Music répondent normalement,
 *  "degraded" = l'instance est up mais Apple Music la rate-limite (résultats possiblement
 *  instables) — dans les deux cas on considère l'instance joignable ; seule une erreur réseau, un
 *  timeout ou un statut HTTP non-2xx est traité comme "hors service". */
export async function checkAnimatedArtworkHealth(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/api/v1/status`);
    if (!response.ok) return false;

    const data = (await response.json()) as AnimatedArtworkStatusResponse;
    return data.status === "operational" || data.status === "degraded";
  } catch {
    return false;
  }
}

interface StreamVariant {
  url: string;
  width: number;
  height: number;
  isAvc: boolean;
}

function parseStreamVariants(masterPlaylistText: string, masterUrl: string): StreamVariant[] {
  const lines = masterPlaylistText.split("\n").map((l) => l.trim());
  const variants: StreamVariant[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // #EXT-X-I-FRAME-STREAM-INF référence une piste de vignettes (trick-play), pas une piste
    // vidéo jouable — seule #EXT-X-STREAM-INF (sans le préfixe I-FRAME) désigne un flux réel.
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;

    const next = lines[i + 1];
    if (!next || next.startsWith("#")) continue;

    const resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
    if (!resolutionMatch) continue;

    variants.push({
      url: new URL(next, masterUrl).href,
      width: Number(resolutionMatch[1]),
      height: Number(resolutionMatch[2]),
      isAvc: /CODECS="avc1\./i.test(line),
    });
  }

  return variants;
}

/** Parmi les variantes avc1 (H.264, décodable partout, contrairement à hvc1/HEVC), retient la
 *  plus petite résolution : suffisant pour une pochette d'album, économe en bande passante et
 *  en espace de cache. */
function pickSmallestCompatibleVariant(variants: StreamVariant[]): StreamVariant | null {
  const avcVariants = variants.filter((v) => v.isAvc);
  const pool = avcVariants.length > 0 ? avcVariants : variants;
  if (pool.length === 0) return null;

  return pool.reduce((smallest, v) => (v.width * v.height < smallest.width * smallest.height ? v : smallest));
}

/** Extrait l'URI du fichier vidéo référencé par #EXT-X-MAP dans une playlist média HLS. Les
 *  segments HLS d'Apple Music pour l'artwork animé sont en réalité des plages d'octets d'un même
 *  fichier MP4 fragmenté (CMAF) : télécharger ce fichier en entier donne un .mp4 valide et
 *  directement lisible par une balise <video>, sans avoir besoin de hls.js ni de remux. */
function extractMappedMp4Url(mediaPlaylistText: string, mediaPlaylistUrl: string): string | null {
  const match = mediaPlaylistText.match(/#EXT-X-MAP:URI="([^"]+)"/);
  if (!match) return null;
  return new URL(match[1], mediaPlaylistUrl).href;
}

export interface AnimatedArtworkSources {
  /** Playlist média HLS (une seule variante, déjà la plus petite avc1 compatible) : à donner
   *  telle quelle à une balise <video> sur les moteurs à support HLS natif (WebKit/Safari) — ils
   *  savent nativement lire du CMAF fragmenté via HLS, contrairement à Blink/Gecko en <video src>
   *  brut. */
  hlsUrl: string;
  /** Fichier .mp4 fragmenté unique référencé par la playlist média (voir extractMappedMp4Url) :
   *  téléchargeable et jouable directement en <video src> sur Blink/Gecko, à mettre en cache. */
  mp4Url: string;
}

/** Résout l'URL du flux HLS "master" (issue de searchAnimatedArtwork) vers la plus petite
 *  variante avc1 exploitable, sous ses deux formes utiles à la lecture (voir
 *  AnimatedArtworkSources). Renvoie null si aucune piste vidéo exploitable n'est trouvée. */
export async function resolveAnimatedArtworkSources(
  masterPlaylistUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AnimatedArtworkSources | null> {
  const masterResponse = await fetchImpl(masterPlaylistUrl);
  if (!masterResponse.ok) return null;
  const masterText = await masterResponse.text();

  const variant = pickSmallestCompatibleVariant(parseStreamVariants(masterText, masterPlaylistUrl));
  if (!variant) return null;

  const mediaResponse = await fetchImpl(variant.url);
  if (!mediaResponse.ok) return null;
  const mediaText = await mediaResponse.text();

  const mp4Url = extractMappedMp4Url(mediaText, variant.url);
  if (!mp4Url) return null;

  return { hlsUrl: variant.url, mp4Url };
}
