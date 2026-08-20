import { Play } from "lucide-react";
import type { SongDTO } from "@resonia/api-client";
import { useCoverArt } from "../../hooks/useCoverArt";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface TrackResultRowProps {
  song: SongDTO;
  songs: SongDTO[];
}

export function TrackResultRow({ song, songs }: TrackResultRowProps) {
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;
  const coverUrl = client && song.coverArt ? client.getCoverArtUrl(song.coverArt, 80) : undefined;
  const cachedCoverUrl = useCoverArt(activeServerId ?? undefined, song.coverArt, 80, coverUrl);

  const isCurrent = currentTrackId === song.id;

  function toTrack(s: SongDTO): Track {
    return {
      id: s.id,
      title: s.title,
      artist: s.artist,
      album: s.album,
      duration: s.duration,
      coverUrl: client && s.coverArt ? client.getCoverArtUrl(s.coverArt, 300) : undefined,
    };
  }

  function handlePlay() {
    if (!client) return;
    playTrack(toTrack(song), songs.map(toTrack));
  }

  return (
    <button
      onClick={handlePlay}
      className={`group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-neutral-800/80 ${
        isCurrent ? "bg-neutral-800/60" : ""
      }`}
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-neutral-800">
        {cachedCoverUrl ? (
          <img src={cachedCoverUrl} alt={song.album} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-600">♪</div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <Play size={16} fill="white" className="text-white" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${isCurrent && isPlaying ? "text-emerald-400" : "text-white"}`}>
          {song.title}
        </p>
        <p className="truncate text-xs text-neutral-400">{song.artist}</p>
      </div>

      <span className="shrink-0 text-xs text-neutral-500">{formatDuration(song.duration)}</span>
    </button>
  );
}
