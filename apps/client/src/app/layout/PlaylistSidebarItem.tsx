import { useState } from "react";
import { Link } from "react-router-dom";
import { Library, Play, Pause } from "lucide-react";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import type { PlaylistItem } from "../../hooks/usePlaylists";

interface PlaylistSidebarItemProps {
  playlist: PlaylistItem;
}

export function PlaylistSidebarItem({ playlist }: PlaylistSidebarItemProps) {
  const [loading, setLoading] = useState(false);

  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;

  // La playlist est "en cours" si le titre actif fait partie de sa dernière tracklist jouée.
  const isThisPlaylistPlaying =
    isPlaying && currentTrack !== null && playlist.lastPlayedTrackIds?.has(currentTrack.id);

  async function handlePlay(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (isThisPlaylistPlaying) {
      togglePlay();
      return;
    }

    if (!client || loading) return;

    setLoading(true);
    try {
      const full = await client.getPlaylist(playlist.id);
      const queue: Track[] = full.entry.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        album: s.album,
        duration: s.duration,
        coverUrl: s.coverArt ? client.getCoverArtUrl(s.coverArt, 300) : undefined,
      }));

      if (queue.length > 0) {
        await playTrack(queue[0], queue);
      }
    } catch (err) {
      console.error("[playlists] Impossible de lancer la playlist", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Link
      to={`/playlists/${playlist.id}`}
      className="group flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition hover:bg-neutral-900"
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-neutral-800">
        {playlist.coverArt ? (
          <img src={playlist.coverArt} alt={playlist.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-600 group-hover:hidden">
            <Library size={16} />
          </div>
        )}

        <button
          onClick={handlePlay}
          disabled={loading}
          className="absolute inset-0 flex items-center justify-center rounded bg-black/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100 disabled:opacity-50"
          title="Lecture"
        >
          {isThisPlaylistPlaying ? (
            <Pause size={16} fill="white" className="text-white" />
          ) : (
            <Play size={16} fill="white" className="ml-0.5 text-white" />
          )}
        </button>
      </div>

      <span className="truncate text-neutral-300 group-hover:text-white">{playlist.name}</span>
    </Link>
  );
}
