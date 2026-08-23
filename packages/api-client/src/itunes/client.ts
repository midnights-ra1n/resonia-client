interface ItunesSearchResult {
  collectionId?: number;
  artistName?: string;
  collectionName?: string;
  collectionViewUrl?: string;
}

interface ItunesArtistResult {
  wrapperType?: string;
  artistId?: number;
  artistName?: string;
}

interface ItunesSearchResponse<T> {
  results?: T[];
}

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const ITUNES_LOOKUP_URL = "https://itunes.apple.com/lookup";

/** Max accepté par l'API iTunes pour `limit` : suffisant pour couvrir la discographie complète
 *  (albums + singles) de la grande majorité des artistes. */
const MAX_LOOKUP_RESULTS = "200";

/** Normalise pour une comparaison stricte : insensible à la casse, aux espaces superflus, aux
 *  accents et à la variante d'apostrophe (courbe vs droite). Ne retire volontairement aucun texte
 *  entre parenthèses — "1989" et "1989 (Taylor's Version)" doivent rester deux albums distincts. */
export function normalizeForComparison(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** L'URL renvoyée par iTunes porte un paramètre de tracking (`?uo=4`) sans intérêt une fois
 *  transmise à l'API m8tec (voir searchAnimatedArtworkByUrl côté m8tec/client.ts). */
function stripQueryString(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function findExactAlbumMatch(
  results: ItunesSearchResult[],
  artist: string,
  album: string,
): string | null {
  const normalizedArtist = normalizeForComparison(artist);
  const normalizedAlbum = normalizeForComparison(album);

  const match = results.find(
    (r) =>
      r.collectionViewUrl &&
      r.artistName &&
      r.collectionName &&
      normalizeForComparison(r.artistName) === normalizedArtist &&
      normalizeForComparison(r.collectionName) === normalizedAlbum,
  );

  return match?.collectionViewUrl
    ? stripQueryString(match.collectionViewUrl)
    : null;
}

/** Étape 1, rapide : une recherche combinée "artiste + album" en un seul appel. Fonctionne pour
 *  la plupart des albums, mais l'index plein texte d'iTunes Search a des trous non documentés —
 *  certains albums pourtant bien présents au catalogue (confirmé via /lookup?id=) n'y remontent
 *  jamais, quels que soient les termes essayés ou le storefront (`country`) interrogé. C'est
 *  typiquement le cas de pans entiers du rap français. D'où l'étape 2 en repli. */
async function searchByCombinedTerm(
  artist: string,
  album: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const params = new URLSearchParams({
    term: `${artist} ${album}`,
    entity: "album",
    limit: "10",
  });

  const response = await fetchImpl(`${ITUNES_SEARCH_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Échec de la recherche iTunes (${response.status})`);
  }

  const data =
    (await response.json()) as ItunesSearchResponse<ItunesSearchResult>;
  return findExactAlbumMatch(data.results ?? [], artist, album);
}

/** Étape 2, en repli : retrouve l'identifiant iTunes de l'artiste (recherche dédiée, bien plus
 *  fiable que la recherche combinée), puis liste toute sa discographie via /lookup — une requête
 *  de type "parcours du catalogue" plutôt qu'un match texte flou, et qui trouve donc des albums
 *  que l'étape 1 rate. Renvoie le premier artiste dont le nom normalisé correspond exactement. */
async function findArtistId(
  artist: string,
  fetchImpl: typeof fetch,
): Promise<number | null> {
  const params = new URLSearchParams({
    term: artist,
    entity: "musicArtist",
    limit: "10",
  });

  const response = await fetchImpl(`${ITUNES_SEARCH_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(
      `Échec de la recherche d'artiste iTunes (${response.status})`,
    );
  }

  const data =
    (await response.json()) as ItunesSearchResponse<ItunesArtistResult>;
  const normalizedArtist = normalizeForComparison(artist);

  const match = (data.results ?? []).find(
    (r) =>
      r.wrapperType === "artist" &&
      typeof r.artistId === "number" &&
      r.artistName &&
      normalizeForComparison(r.artistName) === normalizedArtist,
  );

  return match?.artistId ?? null;
}

async function findAlbumInArtistCatalog(
  artistId: number,
  artist: string,
  album: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const params = new URLSearchParams({
    id: String(artistId),
    entity: "album",
    limit: MAX_LOOKUP_RESULTS,
  });

  const response = await fetchImpl(`${ITUNES_LOOKUP_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(
      `Échec du parcours de discographie iTunes (${response.status})`,
    );
  }

  const data =
    (await response.json()) as ItunesSearchResponse<ItunesSearchResult>;
  return findExactAlbumMatch(data.results ?? [], artist, album);
}

/** Résout l'URL Apple Music (page album) correspondant à un couple artiste/album via l'API
 *  publique de recherche iTunes (https://itunes.apple.com) — gratuite, sans clé ni authentification,
 *  et avec un en-tête CORS ouvert (utilisable directement depuis le navigateur).
 *
 *  Deux étapes, la seconde en repli de la première (voir searchByCombinedTerm et
 *  findAlbumInArtistCatalog ci-dessus) : à elles deux, elles couvrent aussi bien les albums dont
 *  le titre contient des apostrophes/parenthèses/caractères spéciaux (sur lesquels la recherche
 *  texte scrapée de m8tec — voir searchAnimatedArtwork — trébuche) que ceux tout simplement
 *  absents de l'index de recherche combinée d'iTunes malgré leur présence au catalogue.
 *
 *  L'URL obtenue peut ensuite être transmise telle quelle à searchAnimatedArtworkByUrl pour
 *  contourner entièrement la recherche texte fragile de m8tec.
 *
 *  Renvoie null si aucun résultat ne correspond exactement (artiste ET album, une fois
 *  normalisés) à la requête : on préfère ne rien renvoyer plutôt que de risquer de pointer vers le
 *  mauvais album (réédition, "Taylor's Version", édition deluxe...). */
export async function resolveAppleMusicAlbumUrl(
  artist: string,
  album: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const direct = await searchByCombinedTerm(artist, album, fetchImpl);
  if (direct) return direct;

  const artistId = await findArtistId(artist, fetchImpl);
  if (artistId === null) return null;

  return findAlbumInArtistCatalog(artistId, artist, album, fetchImpl);
}
