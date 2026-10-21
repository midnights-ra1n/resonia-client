import { getLastfmTopTracks, type SongDTO, type SubsonicClient } from "@resonia/api-client";
import { useCachedQuery } from "../../lib/cache/queryCache";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useServersStore } from "../../stores/serversStore";
import { useSettingsStore } from "../../stores/settingsStore";

const SONGS_LIMIT = 10;
const LASTFM_CANDIDATES_LIMIT = SONGS_LIMIT * 3;
const LOCAL_SEARCH_SONG_COUNT = 300;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export type PopularSongsSource = "lastfm" | "local";

interface PopularSongs {
  songs: SongDTO[];
  source: PopularSongsSource;
  // Erreur Last.fm spécifique (clé invalide, requête réseau échouée...), distincte d'un
  // simple repli "aucun des titres Last.fm n'est présent sur ce serveur" (matched.length
  // === 0, pas une erreur) — sans ça l'échec était uniquement loggé en console, invisible
  // dans un build desktop packagé sans DevTools, donc indiscernable d'une clé "ignorée".
  lastfmError: string | null;
}

// Le classement bouge peu : quelques heures avant rafraîchissement en arrière-plan évitent de
// relancer Last.fm + une recherche de 300 titres à chaque visite.
const POPULAR_SONGS_STALE_MS = 6 * 60 * 60_000;
const NO_SONGS: SongDTO[] = [];

async function loadPopularSongs(
  client: SubsonicClient,
  artistName: string,
  lastfmApiKey: string,
): Promise<PopularSongs> {
  let lastfmError: string | null = null;
  if (lastfmApiKey) {
    try {
      const [ranked, local] = await Promise.all([
        getLastfmTopTracks(artistName, lastfmApiKey, LASTFM_CANDIDATES_LIMIT),
        client.search3(artistName, {
          songCount: LOCAL_SEARCH_SONG_COUNT,
          albumCount: 0,
          artistCount: 0,
        }),
      ]);

      // Le classement Last.fm ne connaît que des noms de titres, pas les identifiants
      // de la bibliothèque locale : on ne peut lire que ce que le serveur possède réellement.
      const byTitle = new Map<string, SongDTO>();
      for (const song of local.song) {
        if (normalize(song.artist) === normalize(artistName)) {
          byTitle.set(normalize(song.title), song);
        }
      }

      const matched: SongDTO[] = [];
      for (const track of ranked) {
        const found = byTitle.get(normalize(track.name));
        if (found && !matched.some((m) => m.id === found.id)) matched.push(found);
        if (matched.length >= SONGS_LIMIT) break;
      }
      if (matched.length > 0) return { songs: matched, source: "lastfm", lastfmError: null };
    } catch (err) {
      // Erreur Last.fm (clé invalide, réseau...) : on la garde pour l'affichage, mais
      // on ne fait pas échouer tout le chargement — repli sur les stats locales.
      console.error("[artist] Échec de la récupération Last.fm", err);
      lastfmError = err instanceof Error ? err.message : String(err);
    }
  }

  // Repli : statistiques d'écoute locales Navidrome (pas de clé Last.fm configurée,
  // échec Last.fm, ou aucun des titres les plus populaires selon Last.fm n'est présent
  // sur ce serveur). Un échec ici n'est pas mis en cache : nouvel essai à la prochaine visite.
  return {
    songs: await client.getTopSongs(artistName, SONGS_LIMIT),
    source: "local",
    lastfmError,
  };
}

export function useArtistPopularSongs(artistName: string | undefined) {
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const lastfmApiKey = useSettingsStore((s) => s.lastfmApiKey).trim();
  // La clé elle-même n'entre pas dans la clé de cache (persistée en clair) : seulement sa présence.
  const key =
    server && artistName ? `${server.id}:popularSongs:${lastfmApiKey ? "lastfm" : "local"}:${artistName}` : null;

  const { data, loading } = useCachedQuery(
    key,
    () => loadPopularSongs(getClientForServer(server!), artistName!, lastfmApiKey),
    POPULAR_SONGS_STALE_MS,
  );

  return {
    songs: data?.songs ?? NO_SONGS,
    loading,
    source: data?.source ?? "local",
    lastfmError: data?.lastfmError ?? null,
  };
}
