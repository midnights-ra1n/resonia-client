import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Play } from "../../components/icons";
import type { SongDTO, SubsonicClient } from "@resonia/api-client";
import { InfoModal } from "../../components/InfoModal";
import { ContextMenu } from "../../components/menu/ContextMenu";
import { buildTrackMenuItems } from "../../components/menu/buildTrackMenuItems";
import { useContextMenu } from "../../components/menu/useContextMenu";
import { useCoverArt } from "../../hooks/useCoverArt";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { formatTrackDuration } from "../../lib/format/duration";
import { useTranslation } from "../../lib/i18n";
import { CoverImage } from "../../components/CoverImage";

interface RandomSongCardProps {
  song: SongDTO;
  client: SubsonicClient;
}

export function RandomSongCard({ song, client }: RandomSongCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeServerId = useServersStore((s) => s.activeServerId);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const menu = useContextMenu();
  const [infoOpen, setInfoOpen] = useState(false);

  const coverUrl = song.coverArt ? client.getCoverArtUrl(song.coverArt, 300) : undefined;
  const cachedCoverUrl = useCoverArt(activeServerId ?? undefined, song.coverArt, 300, coverUrl);

  const track: Track = {
    id: song.id,
    title: song.title,
    artist: song.artist,
    artistId: song.artistId,
    album: song.album,
    albumId: song.albumId,
    duration: song.duration,
    coverUrl,
    coverArtId: song.coverArt,
  };

  function handlePlay(e: React.MouseEvent) {
    e.stopPropagation();
    playTrack(track, [track]);
  }

  return (
    <div
      className="group relative w-40 shrink-0 rounded-panel p-3 transition-colors hover:bg-surface-2"
      onContextMenu={menu.handleContextMenu}
    >
      <button onClick={handlePlay} className="block w-full cursor-pointer text-left">
        <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-cover bg-surface-2 shadow-e1 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-inset after:ring-white/[0.06]">
          {cachedCoverUrl ? (
            <CoverImage src={cachedCoverUrl} alt={song.title} className="h-full w-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-600">♪</div>
          )}

          <div className="absolute bottom-2 right-2 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-accent opacity-0 shadow-play transition-[opacity,transform,translate,scale] duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <Play size={18} fill="currentColor" className="ml-0.5 text-on-accent" />
          </div>
        </div>

        <p className="truncate text-sm font-medium text-white">{song.title}</p>
      </button>

      {song.artistId ? (
        <Link
          to={`/artists/${song.artistId}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-block max-w-full truncate align-top text-xs text-neutral-400 hover:text-white hover:underline"
        >
          {song.artist}
        </Link>
      ) : (
        <p className="truncate text-xs text-neutral-400">{song.artist}</p>
      )}

      {menu.open && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={menu.close}
          items={buildTrackMenuItems({
            track,
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
