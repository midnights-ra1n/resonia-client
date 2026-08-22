import { useEffect, useState } from "react";
import type { AlbumSummary, ArtistSummary, PlaylistSummary, SongDTO } from "@resonia/api-client";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useServersStore } from "../../stores/serversStore";

const MIN_QUERY_LENGTH = 2;
const SONG_LIMIT = 30;
const ALBUM_LIMIT = 12;
const ARTIST_LIMIT = 12;
const PLAYLIST_LIMIT = 12;

export interface SearchResults {
  songs: SongDTO[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
  playlists: PlaylistSummary[];
}

const EMPTY_RESULTS: SearchResults = { songs: [], albums: [], artists: [], playlists: [] };

export function useSearch(query: string) {
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);

  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(EMPTY_RESULTS);
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
    const client = getClientForServer(server);

    Promise.all([
      client.search3(trimmed, { songCount: SONG_LIMIT, albumCount: ALBUM_LIMIT, artistCount: ARTIST_LIMIT }),
      // L'API Subsonic n'a pas d'endpoint de recherche pour les playlists : on filtre
      // côté client sur la liste complète, déjà chargée par la sidebar dans la plupart des cas.
      client.getPlaylists(),
    ])
      .then(([search, allPlaylists]) => {
        if (cancelled) return;
        const needle = trimmed.toLowerCase();
        setResults({
          songs: search.song,
          albums: search.album,
          artists: search.artist,
          playlists: allPlaylists.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, PLAYLIST_LIMIT),
        });
      })
      .catch((err) => {
        console.error("[search] Échec de la recherche", err);
        if (!cancelled) setResults(EMPTY_RESULTS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, servers, activeServerId]);

  function removePlaylistLocally(playlistId: string) {
    setResults((prev) => ({ ...prev, playlists: prev.playlists.filter((p) => p.id !== playlistId) }));
  }

  return { results, loading, removePlaylistLocally };
}
