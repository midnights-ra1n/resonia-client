import { useState } from "react";
import { Play } from "lucide-react";
import type { AlbumSummary } from "@resonia/api-client";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useCoverArt } from "../../hooks/useCoverArt";
import { Link } from "react-router-dom";

interface AlbumCardProps {
  album: AlbumSummary;
}

export function AlbumCard({ album }: AlbumCardProps) {
  const [loading, setLoading] = useState(false);
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;
  const coverUrl = client && album.coverArt ? client.getCoverArtUrl(album.coverArt, 300) : undefined;
  const cachedCoverUrl = useCoverArt(activeServerId ?? undefined, album.coverArt, 300, coverUrl);

  async function handlePlay(e: React.MouseEvent) {
    e.stopPropagation();
    if (!client || loading) return;

    setLoading(true);
    try {
      const full = await client.getAlbum(album.id);
      const queue: Track[] = full.song.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        album: s.album,
        duration: s.duration,
        coverUrl: s.coverArt ? client.getCoverArtUrl(s.coverArt, 300) : coverUrl,
      }));

      if (queue.length > 0) {
        await playTrack(queue[0], queue);
      }
    } catch (err) {
      console.error("[home] Impossible de lancer l'album", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Link
      to={`/albums/${album.id}`}
      className="group relative block w-full cursor-pointer rounded-lg bg-neutral-900 p-3 transition-colors hover:bg-neutral-800"
    >
      <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-md bg-neutral-800">
        {cachedCoverUrl ? (
          <img src={cachedCoverUrl} alt={album.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-600">♪</div>
        )}

        <button
          onClick={handlePlay}
          disabled={loading}
          className="absolute bottom-2 right-2 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-emerald-500 opacity-0 shadow-lg transition-all duration-200 hover:scale-105 hover:bg-emerald-400 group-hover:translate-y-0 group-hover:opacity-100 disabled:opacity-50"
          title="Lecture"
        >
          <Play size={18} fill="black" className="ml-0.5 text-neutral-900" />
        </button>
      </div>

      <p className="truncate text-sm font-medium text-white">{album.name}</p>
      <p className="truncate text-xs text-neutral-400">{album.artist}</p>
    </Link>
  );
}