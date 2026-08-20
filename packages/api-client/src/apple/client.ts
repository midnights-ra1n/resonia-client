export interface AppleMusicArtistMatch {
  id: number;
  name: string;
  url: string;
}

export interface AppleMusicArtistArtwork {
  bannerUrl: string;
  squareUrl: string;
}

interface ItunesAlbumSearchResult {
  artistName: string;
  artworkUrl100?: string;
}

interface ItunesSearchResponse<T> {
  results?: T[];
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "");
}

// Match tolérant aux espaces multiples/variables autour du point médian ("·") qu'Apple insère
// entre le nom et le type ("Daft Punk · Artist") dans le HTML de sa page de recherche.
const TOP_SEARCH_RESULT_RE =
  /<a[^>]+href="(https:\/\/music\.apple\.com\/[a-z]{2}\/artist\/[^"]+\/(\d+))"[^>]+aria-label="([^"·]+?)\s*·\s*Artist"/;

/** Extrait le résultat "Top Result" de la page de recherche Apple Music (rendue côté serveur,
 *  aria-label="Nom · Artist" sur le lien) et vérifie qu'il correspond bien à l'artiste demandé —
 *  on préfère ne rien retourner plutôt que de risquer la photo d'un homonyme. */
export function extractTopArtistMatch(html: string, artistName: string): AppleMusicArtistMatch | null {
  const match = html.match(TOP_SEARCH_RESULT_RE);
  if (!match) return null;

  const [, url, idStr, name] = match;
  if (normalizeName(name) !== normalizeName(artistName)) return null;

  return { id: Number(idStr), name: name.trim(), url };
}

/** Résout l'artiste en scrapant la page de recherche Apple Music elle-même plutôt que l'API
 *  iTunes Search — évite sa limite de débit (~20 req/min par IP), pertinent côté bureau où l'on
 *  scrape déjà music.apple.com pour la bannière (cf. scrapeAppleMusicArtistArtwork). Nécessite un
 *  fetch qui contourne le CORS (music.apple.com ne renvoie pas d'en-tête cross-origin). */
export async function searchAppleMusicArtistByScraping(
  artistName: string,
  fetchImpl: typeof fetch,
  storefront = "us",
): Promise<AppleMusicArtistMatch | null> {
  const url = `https://music.apple.com/${storefront}/search?term=${encodeURIComponent(artistName)}`;
  const response = await fetchImpl(url);
  if (!response.ok) return null;
  return extractTopArtistMatch(await response.text(), artistName);
}

function upsizeItunesArtwork(url: string, size = 1200): string {
  return url.replace(/\/\d+x\d+bb\.(jpe?g|png)$/i, `/${size}x${size}bb.$1`);
}

/** Repli 100% web (CORS ouvert, sans clé) : pochette du meilleur résultat d'album pour l'artiste,
 *  en résolution relevée. Moins fidèle qu'une vraie photo d'artiste mais bien meilleure que la
 *  pochette Navidrome basse résolution utilisée en tout dernier recours. On vérifie que l'album
 *  appartient bien à l'artiste demandé (recherche "artistTerm" peu précise, peut renvoyer un
 *  homonyme) avant d'utiliser sa pochette. */
export async function getAppleMusicFallbackArtwork(artistName: string, storefront = "us"): Promise<string | null> {
  const params = new URLSearchParams({
    term: artistName,
    entity: "album",
    attribute: "artistTerm",
    limit: "5",
    country: storefront.toUpperCase(),
  });
  const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Échec de la recherche Apple Music (${response.status})`);
  }

  const data = (await response.json()) as ItunesSearchResponse<ItunesAlbumSearchResult>;
  const target = normalizeName(artistName);
  const match = (data.results ?? []).find((r) => normalizeName(r.artistName) === target);
  return match?.artworkUrl100 ? upsizeItunesArtwork(match.artworkUrl100) : null;
}

/** Extrait l'image d'identité de l'artiste (meta og:image) depuis le HTML de sa page Apple Music,
 *  et reconstruit ses variantes haute résolution via le gabarit d'URL mzstatic (`{w}x{h}{crop}.{ext}`). */
export function extractAppleMusicArtistArtwork(html: string): AppleMusicArtistArtwork | null {
  const match =
    html.match(/<meta property="og:image:secure_url" content="([^"]+)"/) ??
    html.match(/<meta property="og:image" content="([^"]+)"/);
  if (!match) return null;

  const sized = match[1].match(/^(.*)\/\d+x\d+[a-z]*\.(\w+)(?:\?.*)?$/i);
  if (!sized) return null;
  const [, base, ext] = sized;

  return {
    bannerUrl: `${base}/1920x1080cw.${ext}`,
    squareUrl: `${base}/1200x1200bb.${ext}`,
  };
}

/** Récupère le HTML de la page Apple Music de l'artiste puis en extrait l'image d'identité.
 *  Nécessite un client fetch qui contourne le CORS (ex. @tauri-apps/plugin-http côté bureau) :
 *  music.apple.com ne renvoie pas d'en-tête Access-Control-Allow-Origin pour les autres origines,
 *  donc un fetch navigateur classique échouera silencieusement (erreur CORS). */
export async function scrapeAppleMusicArtistArtwork(
  artistPageUrl: string,
  fetchImpl: typeof fetch,
): Promise<AppleMusicArtistArtwork | null> {
  const response = await fetchImpl(artistPageUrl);
  if (!response.ok) return null;
  return extractAppleMusicArtistArtwork(await response.text());
}
