import { Play } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SongDTO } from "@resonia/api-client";
import { InfoModal } from "../../components/InfoModal";
import { MarqueeText } from "../../components/MarqueeText";
import { ContextMenu } from "../../components/menu/ContextMenu";
import { buildTrackMenuItems } from "../../components/menu/buildTrackMenuItems";
import { useContextMenu } from "../../components/menu/useContextMenu";
import { useCoverArt } from "../../hooks/useCoverArt";
import { formatTrackDuration } from "../../lib/format/duration";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";

function formatDuration(seconds: number): string {
  return formatTrackDuration(seconds);
}

interface TrackResultRowProps {
  song: SongDTO;
  songs: SongDTO[];
}

export function TrackResultRow({ song, songs }: TrackResultRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const menu = useContextMenu();
  const [infoOpen, setInfoOpen] = useState(false);

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
      artistId: s.artistId,
      album: s.album,
      albumId: s.albumId,
      duration: s.duration,
      coverUrl: client && s.coverArt ? client.getCoverArtUrl(s.coverArt, 300) : undefined,
    };
  }

  function handlePlay() {
    if (!client) return;
    playTrack(toTrack(song), songs.map(toTrack));
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handlePlay}
      onKeyDown={(e) => e.key === "Enter" && handlePlay()}
      onContextMenu={menu.handleContextMenu}
      className={`group flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-neutral-800/80 ${
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
        <MarqueeText
          text={song.title}
          to={song.albumId ? `/albums/${song.albumId}` : undefined}
          onClick={(e) => e.stopPropagation()}
          className={`text-sm font-medium hover:underline ${isCurrent && isPlaying ? "text-emerald-400" : "text-white"}`}
        />
        <MarqueeText
          text={song.artist}
          to={song.artistId ? `/artists/${song.artistId}` : undefined}
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-neutral-400 hover:text-white hover:underline"
        />
      </div>

      <span className="shrink-0 text-xs text-neutral-500">{formatDuration(song.duration)}</span>

      {menu.open && client && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={menu.close}
          items={buildTrackMenuItems({
            track: toTrack(song),
            client,
            t,
            navigate,
            addToQueue,
            onOpenInfo: () => setInfoOpen(true),
          })}
        />
      )}

      {infoOpen && (
        <InfoModal
          title={song.title}
          coverUrl={cachedCoverUrl ?? undefined}
          onClose={() => setInfoOpen(false)}
          rows={[
            { label: t("search.artistLabel"), value: song.artist },
            { label: t("album.labelAlbum"), value: song.album },
            { label: t("playlist.columnDuration"), value: formatTrackDuration(song.duration) },
          ]}
        />
      )}
    </div>
  );
}
