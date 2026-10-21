import { useCallback, useEffect, useState } from "react";
import type { NavidromeSong, NavidromeSongSort, SongDTO } from "@resonia/api-client";
import { getNativeClientForServer } from "../../lib/subsonic/getNativeClientForServer";
import { useServersStore } from "../../stores/serversStore";

export const PAGE_SIZE = 100;

interface SongList {
  key: string | null;
  songs: SongDTO[];
  /** null tant que le serveur n'a pas donné le total (ni renvoyé de tranche incomplète). */
  total: number | null;
  /** Nombre de titres demandés : une tranche se charge tant que `songs` n'y est pas. */
  wanted: number;
}

// Dernière liste affichée, gardée en mémoire : revenir sur la page (depuis un album, un
// artiste...) la réaffiche à l'identique, sans recharger ni perdre les tranches déjà vues.
let lastList: SongList | null = null;

function emptyList(key: string | null): SongList {
  return lastList?.key === key ? lastList : { key, songs: [], total: null, wanted: PAGE_SIZE };
}

/** Pochette de l'album (et non `mf-<id>`) : la même image pour tous les titres d'un album,
 *  donc un seul téléchargement et une seule entrée de cache par album. */
function toSongDTO(song: NavidromeSong): SongDTO {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist ?? "",
    artistId: song.artistId,
    album: song.album ?? "",
    albumId: song.albumId,
    coverArt: song.albumId ? `al-${song.albumId}` : undefined,
    duration: Math.round(song.duration ?? 0),
    track: song.trackNumber,
    playCount: song.playCount,
    year: song.year,
    suffix: song.suffix,
    bitRate: song.bitRate,
    starred: song.starred ? song.starredAt : undefined,
  };
}

/** Tous les titres de la bibliothèque, par tranches de PAGE_SIZE via l'API native Navidrome
 *  (tri et recherche côté serveur : rien n'impose de télécharger toute la bibliothèque). */
export function useLibrarySongs(sort: NavidromeSongSort, order: "ASC" | "DESC", query: string) {
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const key = server ? `${server.id}:${sort}:${order}:${query}` : null;

  const [list, setList] = useState(() => emptyList(key));
  const [error, setError] = useState<{ key: string; unavailable: boolean } | null>(null);
  // Changement de tri, de recherche ou de serveur : on repart de la liste correspondante.
  if (list.key !== key) setList(emptyList(key));

  const current = list.key === key ? list : emptyList(key);
  const hasMore = current.total === null || current.songs.length < current.total;
  const failed = error !== null && error.key === key;
  const loading = key !== null && !failed && hasMore && current.songs.length < current.wanted;

  useEffect(() => {
    if (!loading || !server || list.key !== key) return;
    let cancelled = false;
    const start = list.songs.length;

    (async () => {
      const native = await getNativeClientForServer(server);
      if (!native) {
        if (!cancelled) setError({ key: key!, unavailable: true });
        return;
      }
      const page = await native.getSongs({ sort, order, start, end: start + PAGE_SIZE, query: query || undefined });
      if (cancelled) return;
      const songs = [...list.songs, ...page.songs.map(toSongDTO)];
      const total = page.total ?? (page.songs.length < PAGE_SIZE ? songs.length : null);
      const next = { ...list, songs, total };
      lastList = next;
      setList(next);
    })().catch((err) => {
      console.error("[tracks] Échec du chargement des morceaux", err);
      if (!cancelled) setError({ key: key!, unavailable: false });
    });

    return () => {
      cancelled = true;
    };
  }, [loading, server, key, list, sort, order, query]);

  const loadMore = useCallback(
    () => setList((l) => (l.key === key ? { ...l, wanted: l.songs.length + PAGE_SIZE } : l)),
    [key],
  );

  return {
    songs: current.songs,
    total: current.total,
    loading,
    hasMore: hasMore && !failed,
    unavailable: failed && error.unavailable,
    failed: failed && !error.unavailable,
    loadMore,
    retry: () => setError(null),
  };
}
