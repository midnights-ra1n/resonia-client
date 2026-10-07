import {
  findSpotifyArtistOfficial,
  findSpotifyArtistUnofficial,
  getSpotifyAnonymousToken,
  getSpotifyAppToken,
  resolveSpotifyQueryHashes,
  SpotifyRequestError,
  type SpotifyAccessToken,
  type SpotifyArtistProfile,
  type SpotifyQueryHashes,
} from "@resonia/api-client";
import { clearQueries, useCachedQuery } from "../cache/queryCache";
import { electronFetch } from "../net/electronFetch";
import { isElectron } from "../platform";
import { storage } from "../storage";
import { useSettingsStore, type SpotifyMetadataMode } from "../../stores/settingsStore";

/** Point d'entrée unique vers Spotify. Garantie de confidentialité : tant que le réglage vaut
 *  "off" (défaut), aucune fonction de ce module n'émet de requête — `useSpotifyArtist` ne
 *  calcule même pas de clé de cache. Seul le nom de l'artiste consulté est envoyé (plus
 *  l'adresse IP, inévitablement) ; aucun compte Spotify n'est utilisé. */

// Profils mis en cache une semaine : photos et bannières changent rarement, et chaque visite
// d'une page artiste ne doit pas redonner l'information à Spotify.
const PROFILE_STALE_MS = 7 * 24 * 60 * 60_000;
// Hashes du lecteur web : stables entre deux versions du lecteur, re-résolus si refusés.
const HASHES_STORAGE_KEY = "resonia:spotify:queryHashes";
const HASHES_MAX_AGE_MS = 3 * 24 * 60 * 60_000;
// Marge avant expiration d'un jeton, pour ne pas l'utiliser à la dernière seconde.
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const CACHE_KEY_PREFIX = "spotify:";

interface StoredHashes {
  hashes: SpotifyQueryHashes;
  fetchedAt: number;
}

let cachedToken: { mode: SpotifyMetadataMode; clientId: string; token: SpotifyAccessToken } | null = null;
let hashesPromise: Promise<SpotifyQueryHashes> | null = null;

/** Hors Electron, seule l'API officielle (api.spotify.com, accounts.spotify.com) répond au CORS. */
export function isSpotifyModeAvailable(mode: SpotifyMetadataMode): boolean {
  return mode !== "unofficial" || isElectron();
}

const spotifyFetch: typeof fetch = (input, init) => (isElectron() ? electronFetch(input, init) : fetch(input, init));

function normalizeKey(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

async function getToken(mode: SpotifyMetadataMode): Promise<string> {
  const { spotifyClientId, spotifyClientSecret } = useSettingsStore.getState();
  if (
    cachedToken &&
    cachedToken.mode === mode &&
    cachedToken.clientId === spotifyClientId &&
    cachedToken.token.expiresAt - TOKEN_EXPIRY_MARGIN_MS > Date.now()
  ) {
    return cachedToken.token.accessToken;
  }

  const token =
    mode === "official"
      ? await getSpotifyAppToken(spotifyClientId, spotifyClientSecret, spotifyFetch)
      : await getSpotifyAnonymousToken(spotifyFetch);
  cachedToken = { mode, clientId: spotifyClientId, token };
  return token.accessToken;
}

async function getHashes(forceRefresh = false): Promise<SpotifyQueryHashes> {
  if (!forceRefresh) {
    const stored = await storage.get<StoredHashes>(HASHES_STORAGE_KEY);
    if (stored && Date.now() - stored.fetchedAt < HASHES_MAX_AGE_MS) return stored.hashes;
  }
  // Une seule résolution à la fois, même si plusieurs pages artiste la demandent.
  hashesPromise ??= resolveSpotifyQueryHashes(spotifyFetch)
    .then(async (hashes) => {
      await storage.set(HASHES_STORAGE_KEY, { hashes, fetchedAt: Date.now() } satisfies StoredHashes);
      return hashes;
    })
    .finally(() => {
      hashesPromise = null;
    });
  return hashesPromise;
}

async function fetchProfile(mode: SpotifyMetadataMode, artistName: string): Promise<SpotifyArtistProfile | null> {
  if (mode === "off" || !isSpotifyModeAvailable(mode)) return null;
  const token = await getToken(mode);

  if (mode === "official") return findSpotifyArtistOfficial(artistName, token, spotifyFetch);

  try {
    return await findSpotifyArtistUnofficial(artistName, token, await getHashes(), spotifyFetch);
  } catch (err) {
    // Nouvelle version du lecteur web : hashes périmés, une seule nouvelle tentative.
    if (err instanceof SpotifyRequestError && err.staleQueryHash) {
      return findSpotifyArtistUnofficial(artistName, token, await getHashes(true), spotifyFetch);
    }
    // Jeton anonyme révoqué avant son expiration annoncée.
    if (err instanceof SpotifyRequestError && err.status === 401) cachedToken = null;
    throw err;
  }
}

/** Profil Spotify de l'artiste, ou undefined (désactivé, en cours, introuvable, ou échec — la
 *  page se replie alors silencieusement sur les données Navidrome). */
export function useSpotifyArtist(artistName: string | undefined): SpotifyArtistProfile | undefined {
  const mode = useSettingsStore((s) => s.spotifyMetadataMode);
  const hasCredentials = useSettingsStore((s) => Boolean(s.spotifyClientId && s.spotifyClientSecret));

  const enabled =
    mode !== "off" && isSpotifyModeAvailable(mode) && (mode !== "official" || hasCredentials) && Boolean(artistName);
  const key = enabled ? `${CACHE_KEY_PREFIX}${mode}:${normalizeKey(artistName!)}` : null;

  const { data } = useCachedQuery(key, () => fetchProfile(mode, artistName!), PROFILE_STALE_MS);
  return data ?? undefined;
}

export type SpotifyTestResult = { ok: true; artistName: string } | { ok: false; message: string };

/** Bouton « Tester » des réglages : une recherche réelle, déclenchée uniquement par l'utilisateur. */
export async function testSpotifyConnection(mode: SpotifyMetadataMode): Promise<SpotifyTestResult> {
  cachedToken = null;
  try {
    const profile = await fetchProfile(mode, "Daft Punk");
    if (!profile) return { ok: false, message: "Aucun résultat" };
    return { ok: true, artistName: profile.name };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Oublie tout ce qui vient de Spotify (profils, jeton, hashes) : appelé à la désactivation ou au
 *  changement de source, pour qu'aucune donnée Spotify ne reste affichée ni stockée. */
export async function clearSpotifyData(): Promise<void> {
  cachedToken = null;
  clearQueries((key) => key.startsWith(CACHE_KEY_PREFIX));
  await storage.remove(HASHES_STORAGE_KEY);
}
