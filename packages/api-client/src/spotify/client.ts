/** Métadonnées d'artiste Spotify (photo de profil, bannière, statistiques), en deux variantes :
 *
 *  - « officielle » : API Web publique de Spotify (https://developer.spotify.com), jeton obtenu
 *    via le flux client_credentials avec le Client ID/Secret de l'utilisateur. Stable, mais
 *    n'expose ni bannière, ni biographie, ni auditeurs mensuels.
 *  - « non officielle » : portage TypeScript de l'approche de SpotAPI
 *    (https://github.com/Aran404/SpotAPI) — jeton anonyme du lecteur web et requêtes GraphQL
 *    « persisted queries » de `api-partner.spotify.com` (`searchArtists`, `queryArtistOverview`),
 *    les seules à exposer la bannière. Non documentée : peut casser à tout moment, chaque étape
 *    échoue donc proprement (exception) pour laisser l'appelant se replier sur Navidrome.
 *
 *  Aucun de ces hôtes ne renvoie d'en-tête CORS pour une origine tierce (sauf api.spotify.com) :
 *  `fetchImpl` doit contourner le CORS (process principal Electron) pour la variante non
 *  officielle. */

export interface SpotifyTopCity {
  city: string;
  country: string;
  listeners: number;
}

export interface SpotifyArtistProfile {
  id: string;
  name: string;
  url: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  followers: number | null;
  monthlyListeners: number | null;
  worldRank: number | null;
  biography: string | null;
  genres: string[];
  topCities: SpotifyTopCity[];
}

export interface SpotifyAccessToken {
  accessToken: string;
  expiresAt: number;
}

export class SpotifyRequestError extends Error {
  status: number;
  /** Hash de persisted query refusé par le serveur : à re-résoudre (nouvelle version du lecteur web). */
  staleQueryHash: boolean;
  constructor(message: string, status = 0, staleQueryHash = false) {
    super(message);
    this.name = "SpotifyRequestError";
    this.status = status;
    this.staleQueryHash = staleQueryHash;
  }
}

interface SpotifyImageSource {
  url?: string;
  width?: number | null;
  height?: number | null;
}

/** Même normalisation que itunes/client.ts : casse, accents, apostrophes, espaces. */
function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Spotify classe ses résultats par popularité : le premier nom identique (une fois normalisé)
 *  est le bon dans l'immense majorité des cas. Aucun résultat identique → null plutôt qu'un
 *  homonyme approximatif (mauvaise photo affichée). */
function pickExactMatch<T>(items: T[], name: string, nameOf: (item: T) => string | undefined): T | null {
  const wanted = normalizeName(name);
  return items.find((item) => {
    const candidate = nameOf(item);
    return candidate !== undefined && normalizeName(candidate) === wanted;
  }) ?? null;
}

function largestImage(sources: SpotifyImageSource[] | undefined): string | null {
  if (!sources || sources.length === 0) return null;
  const sorted = [...sources].filter((s) => s.url).sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sorted[0]?.url ?? null;
}

function artistUrl(id: string): string {
  return `https://open.spotify.com/artist/${id}`;
}

// ---------------------------------------------------------------------------------------------
// API officielle
// ---------------------------------------------------------------------------------------------

interface OfficialArtist {
  id: string;
  name?: string;
  images?: SpotifyImageSource[];
  followers?: { total?: number };
  genres?: string[];
}

export async function getSpotifyAppToken(
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SpotifyAccessToken> {
  const response = await fetchImpl("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) {
    throw new SpotifyRequestError(
      response.status === 400 || response.status === 401
        ? "Identifiants Spotify refusés (Client ID / Secret)"
        : `Échec de l'authentification Spotify (${response.status})`,
      response.status,
    );
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new SpotifyRequestError("Réponse d'authentification Spotify invalide");
  return { accessToken: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
}

async function searchOfficialArtists(
  query: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<OfficialArtist[]> {
  const params = new URLSearchParams({ q: query, type: "artist", limit: "10" });
  const response = await fetchImpl(`https://api.spotify.com/v1/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new SpotifyRequestError(`Échec de la recherche Spotify (${response.status})`, response.status);
  const data = (await response.json()) as { artists?: { items?: OfficialArtist[] } };
  return data.artists?.items ?? [];
}

/** Profil via l'API officielle : photo, abonnés, genres — pas de bannière (non exposée). */
export async function findSpotifyArtistOfficial(
  name: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SpotifyArtistProfile | null> {
  const match = pickExactMatch(await searchOfficialArtists(name, token, fetchImpl), name, (a) => a.name);
  if (!match) return null;
  return {
    id: match.id,
    name: match.name ?? name,
    url: artistUrl(match.id),
    avatarUrl: largestImage(match.images),
    bannerUrl: null,
    followers: match.followers?.total ?? null,
    monthlyListeners: null,
    worldRank: null,
    biography: null,
    genres: match.genres ?? [],
    topCities: [],
  };
}

// ---------------------------------------------------------------------------------------------
// API non officielle (approche SpotAPI)
// ---------------------------------------------------------------------------------------------

const WEB_PLAYER_URL = "https://open.spotify.com/";
const PATHFINDER_V1_URL = "https://api-partner.spotify.com/pathfinder/v1/query";
const PATHFINDER_V2_URL = "https://api-partner.spotify.com/pathfinder/v2/query";
// Page « embed » publique de n'importe quel artiste : son __NEXT_DATA__ embarque un jeton anonyme
// du lecteur web, sans le calcul TOTP qu'exige désormais /api/token (que SpotAPI doit suivre).
const TOKEN_BOOTSTRAP_EMBED_URL = "https://open.spotify.com/embed/artist/4tZwfgrHOc3mvqYlEYSvVi";
// Au-delà, on abandonne la recherche de hashes plutôt que de télécharger tout le lecteur web.
const MAX_CHUNKS_TO_SCAN = 8;

export type SpotifyPersistedQuery = "searchArtists" | "queryArtistOverview";
export type SpotifyQueryHashes = Partial<Record<SpotifyPersistedQuery, string>>;

const REQUIRED_QUERIES: SpotifyPersistedQuery[] = ["searchArtists", "queryArtistOverview"];

export async function getSpotifyAnonymousToken(fetchImpl: typeof fetch = fetch): Promise<SpotifyAccessToken> {
  const response = await fetchImpl(TOKEN_BOOTSTRAP_EMBED_URL);
  if (!response.ok) throw new SpotifyRequestError(`Page Spotify inaccessible (${response.status})`, response.status);
  const html = await response.text();
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new SpotifyRequestError("Jeton anonyme Spotify introuvable (page modifiée)");

  try {
    const data = JSON.parse(match[1]) as {
      props?: {
        pageProps?: {
          state?: { settings?: { session?: { accessToken?: string; accessTokenExpirationTimestampMs?: number } } };
        };
      };
    };
    const session = data.props?.pageProps?.state?.settings?.session;
    if (!session?.accessToken) throw new Error("accessToken absent");
    return {
      accessToken: session.accessToken,
      expiresAt: session.accessTokenExpirationTimestampMs ?? Date.now() + 30 * 60_000,
    };
  } catch (err) {
    throw new SpotifyRequestError(`Jeton anonyme Spotify illisible (${err instanceof Error ? err.message : String(err)})`);
  }
}

function extractHashes(source: string, into: SpotifyQueryHashes): void {
  for (const name of REQUIRED_QUERIES) {
    if (into[name]) continue;
    const match = source.match(new RegExp(`"${name}","query","([0-9a-f]{64})"`));
    if (match) into[name] = match[1];
  }
}

function hasAllHashes(hashes: SpotifyQueryHashes): boolean {
  return REQUIRED_QUERIES.every((name) => Boolean(hashes[name]));
}

/** Comme SpotAPI (`BaseClient.get_sha256_hash`) : les hashes des persisted queries sont lus dans
 *  le bundle du lecteur web, puis, à défaut, dans ses chunks chargés à la demande (table
 *  `id:"nom"` / `id:"hash"` du bundle principal) — en ne visant que les chunks liés aux artistes
 *  et à la recherche. Les hashes changent à chaque version du lecteur : à mettre en cache, et à
 *  re-résoudre si le serveur les refuse (SpotifyRequestError.staleQueryHash). */
export async function resolveSpotifyQueryHashes(fetchImpl: typeof fetch = fetch): Promise<SpotifyQueryHashes> {
  const homeResponse = await fetchImpl(WEB_PLAYER_URL);
  if (!homeResponse.ok) throw new SpotifyRequestError(`Lecteur web Spotify inaccessible (${homeResponse.status})`, homeResponse.status);
  const html = await homeResponse.text();

  const bundleUrls = [...html.matchAll(/src="(https:\/\/[^"]+\/web-player\/[^"]+\.js)"/g)].map((m) => m[1]);
  if (bundleUrls.length === 0) throw new SpotifyRequestError("Bundle du lecteur web Spotify introuvable");

  const hashes: SpotifyQueryHashes = {};
  const chunkCandidates: string[] = [];

  for (const url of bundleUrls) {
    const response = await fetchImpl(url);
    if (!response.ok) continue;
    const source = await response.text();
    extractHashes(source, hashes);
    if (hasAllHashes(hashes)) return hashes;

    const baseUrl = url.slice(0, url.lastIndexOf("/") + 1);
    for (const [, id, chunkName] of source.matchAll(/[{,](\d+):"((?:xpui-routes-)?[a-z-]*(?:artist|search)[a-z-]*)"/g)) {
      const hashMatch = source.match(new RegExp(`[{,]${id}:"([0-9a-f]{8,})"`));
      if (hashMatch) chunkCandidates.push(`${baseUrl}${chunkName}.${hashMatch[1]}.js`);
    }
  }

  for (const url of [...new Set(chunkCandidates)].slice(0, MAX_CHUNKS_TO_SCAN)) {
    const response = await fetchImpl(url);
    if (!response.ok) continue;
    extractHashes(await response.text(), hashes);
    if (hasAllHashes(hashes)) break;
  }

  if (!hashes.queryArtistOverview) {
    throw new SpotifyRequestError("Requête « queryArtistOverview » introuvable dans le lecteur web Spotify");
  }
  return hashes;
}

interface PathfinderResponse<T> {
  data?: T;
  errors?: { message?: string }[];
}

async function pathfinderQuery<T>(
  operationName: SpotifyPersistedQuery,
  variables: Record<string, unknown>,
  hash: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<T> {
  const extensions = { persistedQuery: { version: 1, sha256Hash: hash } };
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "app-platform": "WebPlayer",
  };

  const params = new URLSearchParams({
    operationName,
    variables: JSON.stringify(variables),
    extensions: JSON.stringify(extensions),
  });
  let response = await fetchImpl(`${PATHFINDER_V1_URL}?${params.toString()}`, { headers });
  // Le lecteur web récent n'utilise plus que la v2 (POST) : repli si la v1 est retirée.
  if (response.status === 404 || response.status === 405) {
    response = await fetchImpl(PATHFINDER_V2_URL, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json;charset=UTF-8" },
      body: JSON.stringify({ operationName, variables, extensions }),
    });
  }

  const text = await response.text();
  const staleHash = /PersistedQueryNotFound/i.test(text);
  if (!response.ok || staleHash) {
    throw new SpotifyRequestError(`Échec de la requête Spotify ${operationName} (${response.status})`, response.status, staleHash);
  }

  const body = JSON.parse(text) as PathfinderResponse<T>;
  if (!body.data) {
    throw new SpotifyRequestError(body.errors?.[0]?.message ?? `Réponse Spotify ${operationName} vide`);
  }
  return body.data;
}

interface SearchArtistsData {
  searchV2?: {
    artists?: { items?: { data?: { uri?: string; profile?: { name?: string } } }[] };
  };
}

interface ArtistOverviewData {
  artistUnion?: {
    id?: string;
    profile?: { name?: string; biography?: { text?: string } };
    stats?: {
      followers?: number;
      monthlyListeners?: number;
      worldRank?: number;
      topCities?: { items?: { city?: string; country?: string; numberOfListeners?: number }[] };
    };
    visuals?: {
      avatarImage?: { sources?: SpotifyImageSource[] } | null;
      headerImage?: { sources?: SpotifyImageSource[] } | null;
    };
  };
}

async function findArtistIdUnofficial(
  name: string,
  token: string,
  hashes: SpotifyQueryHashes,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  if (hashes.searchArtists) {
    const data = await pathfinderQuery<SearchArtistsData>(
      "searchArtists",
      {
        searchTerm: name,
        offset: 0,
        limit: 10,
        numberOfTopResults: 5,
        includeAudiobooks: false,
        includePreReleases: false,
      },
      hashes.searchArtists,
      token,
      fetchImpl,
    );
    const items = (data.searchV2?.artists?.items ?? []).map((item) => item.data ?? {});
    const match = pickExactMatch(items, name, (item) => item.profile?.name);
    return match?.uri?.split(":").pop() ?? null;
  }

  // Hash de recherche introuvable dans le lecteur web : l'API Web publique accepte aussi le
  // jeton anonyme du lecteur pour une simple recherche.
  const match = pickExactMatch(await searchOfficialArtists(name, token, fetchImpl), name, (a) => a.name);
  return match?.id ?? null;
}

/** Profil complet via l'API non officielle : bannière, photo, auditeurs mensuels, classement
 *  mondial, biographie et villes principales. */
export async function findSpotifyArtistUnofficial(
  name: string,
  token: string,
  hashes: SpotifyQueryHashes,
  fetchImpl: typeof fetch = fetch,
): Promise<SpotifyArtistProfile | null> {
  if (!hashes.queryArtistOverview) throw new SpotifyRequestError("Hash « queryArtistOverview » manquant", 0, true);

  const id = await findArtistIdUnofficial(name, token, hashes, fetchImpl);
  if (!id) return null;

  const data = await pathfinderQuery<ArtistOverviewData>(
    "queryArtistOverview",
    { uri: `spotify:artist:${id}`, locale: "", includePrelease: true },
    hashes.queryArtistOverview,
    token,
    fetchImpl,
  );
  const artist = data.artistUnion;
  if (!artist) return null;

  return {
    id,
    name: artist.profile?.name ?? name,
    url: artistUrl(id),
    avatarUrl: largestImage(artist.visuals?.avatarImage?.sources),
    bannerUrl: largestImage(artist.visuals?.headerImage?.sources),
    followers: artist.stats?.followers ?? null,
    monthlyListeners: artist.stats?.monthlyListeners ?? null,
    worldRank: artist.stats?.worldRank ? artist.stats.worldRank : null,
    biography: artist.profile?.biography?.text || null,
    genres: [],
    topCities: (artist.stats?.topCities?.items ?? [])
      .filter((c) => c.city && c.country)
      .slice(0, 5)
      .map((c) => ({ city: c.city!, country: c.country!, listeners: c.numberOfListeners ?? 0 })),
  };
}
