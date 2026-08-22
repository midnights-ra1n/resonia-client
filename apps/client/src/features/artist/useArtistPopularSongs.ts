import { useEffect, useState } from "react";
import { getLastfmTopTracks, type SongDTO } from "@resonia/api-client";
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

export function useArtistPopularSongs(artistName: string | undefined) {
  const [songs, setSongs] = useState<SongDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<PopularSongsSource>("local");
  // Erreur Last.fm spécifique (clé invalide, requête réseau échouée...), distincte d'un
  // simple repli "aucun des titres Last.fm n'est présent sur ce serveur" (matched.length
  // === 0, pas une erreur) — sans ça l'échec était uniquement loggé en console, invisible
  // dans un build desktop packagé sans DevTools, donc indiscernable d'une clé "ignorée".
  const [lastfmError, setLastfmError] = useState<string | null>(null);

  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const lastfmApiKey = useSettingsStore((s) => s.lastfmApiKey);

  useEffect(() => {
    if (!artistName) {
      setLoading(false);
      return;
    }

    const server = servers.find((s) => s.id === activeServerId);
    if (!server) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLastfmError(null);
    const client = getClientForServer(server);

    async function loadFromLastfm(): Promise<SongDTO[]> {
      const [ranked, local] = await Promise.all([
        getLastfmTopTracks(artistName!, lastfmApiKey.trim(), LASTFM_CANDIDATES_LIMIT),
        client.search3(artistName!, { songCount: LOCAL_SEARCH_SONG_COUNT, albumCount: 0, artistCount: 0 }),
      ]);

      // Le classement Last.fm ne connaît que des noms de titres, pas les identifiants
      // de la bibliothèque locale : on ne peut lire que ce que le serveur possède réellement.
      const byTitle = new Map<string, SongDTO>();
      for (const song of local.song) {
        if (normalize(song.artist) === normalize(artistName!)) {
          byTitle.set(normalize(song.title), song);
        }
      }

      const matched: SongDTO[] = [];
      for (const track of ranked) {
        const found = byTitle.get(normalize(track.name));
        if (found && !matched.some((m) => m.id === found.id)) matched.push(found);
        if (matched.length >= SONGS_LIMIT) break;
      }
      return matched;
    }

    async function run() {
      try {
        if (lastfmApiKey.trim()) {
          try {
            const matched = await loadFromLastfm();
            if (matched.length > 0) {
              if (!cancelled) {
                setSongs(matched);
                setSource("lastfm");
              }
              return;
            }
          } catch (err) {
            // Erreur Last.fm (clé invalide, réseau...) : on la garde pour l'affichage, mais
            // on ne fait pas échouer tout le chargement — repli sur les stats locales.
            console.error("[artist] Échec de la récupération Last.fm", err);
            if (!cancelled) setLastfmError(err instanceof Error ? err.message : String(err));
          }
        }

        // Repli : statistiques d'écoute locales Navidrome (pas de clé Last.fm configurée,
        // échec Last.fm, ou aucun des titres les plus populaires selon Last.fm n'est présent
        // sur ce serveur).
        const result = await client.getTopSongs(artistName!, SONGS_LIMIT);
        if (!cancelled) {
          setSongs(result);
          setSource("local");
        }
      } catch (err) {
        console.error("[artist] Échec du chargement des titres populaires", err);
        if (!cancelled) setSongs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [artistName, servers, activeServerId, lastfmApiKey]);

  return { songs, loading, source, lastfmError };
}
