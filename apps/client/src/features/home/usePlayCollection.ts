import { useState } from "react";
import type { AlbumSummary, PlaylistSummary } from "@resonia/api-client";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";

/** Lance la lecture d'un album ou d'une playlist depuis une carte/tuile (sans naviguer).
 *  `loadingId` = id de la collection en cours de chargement, pour désactiver SON bouton
 *  pendant la requête — un seul hook peut ainsi servir toute une grille de tuiles. */
export function usePlayCollection() {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const playFromStart = usePlayerStore((s) => s.playFromStart);

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;

  async function playAlbum(album: AlbumSummary) {
    if (!client || loadingId) return;
    setLoadingId(album.id);
    try {
      const full = await client.getAlbum(album.id);
      const fallbackCover = album.coverArt ? client.getCoverArtUrl(album.coverArt, 300) : undefined;
      const queue: Track[] = full.song.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        artistId: s.artistId ?? album.artistId,
        album: s.album,
        albumId: s.albumId ?? album.id,
        duration: s.duration,
        coverUrl: s.coverArt ? client.getCoverArtUrl(s.coverArt, 300) : fallbackCover,
        coverArtId: s.coverArt ?? album.coverArt,
      }));
      // playFromStart, jamais playTrack(queue[0]) : ce dernier ANCRE la 1re piste même en mode
      // aléatoire. Même comportement que le gros bouton Lecture des pages album/playlist.
      if (queue.length > 0) await playFromStart(queue);
    } catch (err) {
      console.error("[home] Impossible de lancer l'album", err);
    } finally {
      setLoadingId(null);
    }
  }

  async function playPlaylist(playlist: PlaylistSummary) {
    if (!client || loadingId) return;
    setLoadingId(playlist.id);
    try {
      const full = await client.getPlaylist(playlist.id);
      const fallbackCover = playlist.coverArt ? client.getCoverArtUrl(playlist.coverArt, 300) : undefined;
      const queue: Track[] = full.entry.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        artistId: s.artistId,
        album: s.album,
        albumId: s.albumId,
        duration: s.duration,
        coverUrl: s.coverArt ? client.getCoverArtUrl(s.coverArt, 300) : fallbackCover,
        coverArtId: s.coverArt ?? playlist.coverArt,
      }));
      if (queue.length > 0) await playFromStart(queue);
    } catch (err) {
      console.error("[home] Impossible de lancer la playlist", err);
    } finally {
      setLoadingId(null);
    }
  }

  return { client, loadingId, playAlbum, playPlaylist };
}
