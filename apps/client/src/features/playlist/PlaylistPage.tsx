import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PlaylistWithSongsDTO } from "@resonia/api-client";
import { MarqueeText } from "../../components/MarqueeText";
import { ConfirmDeleteModal } from "../../components/ConfirmDeleteModal";
import { InfoModal } from "../../components/InfoModal";
import { ContextMenu } from "../../components/menu/ContextMenu";
import { buildPlaylistMenuItems } from "../../components/menu/buildPlaylistMenuItems";
import { buildTrackMenuItems } from "../../components/menu/buildTrackMenuItems";
import { useContextMenu } from "../../components/menu/useContextMenu";
import { RenamePlaylistModal } from "../../app/layout/RenamePlaylistModal";
import { formatAlbumDuration, formatTrackDuration } from "../../lib/format/duration";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { usePlaylist } from "./usePlaylist";

export function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const { playlist, loading, error } = usePlaylist(id);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const playFromStart = usePlayerStore((s) => s.playFromStart);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;

  const headerMenu = useContextMenu();
  const [infoOpen, setInfoOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const rowMenu = useContextMenu();
  const [activeRowSongId, setActiveRowSongId] = useState<string | null>(null);
  const [rowInfoOpen, setRowInfoOpen] = useState(false);

  if (loading) {
    return <div className="p-8 text-neutral-400">{t("common.loading")}</div>;
  }

  if (error || !playlist || !client) {
    return <div className="p-8 text-neutral-400">{error ?? t("playlists.notFound")}</div>;
  }

  const name = displayName ?? playlist.name;
  const coverUrl = playlist.coverArt ? client.getCoverArtUrl(playlist.coverArt, 600) : undefined;

  function toTrack(song: PlaylistWithSongsDTO["entry"][number]): Track {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      artistId: song.artistId,
      album: song.album,
      albumId: song.albumId,
      duration: song.duration,
      coverUrl: song.coverArt ? client!.getCoverArtUrl(song.coverArt, 300) : coverUrl,
    };
  }

  const isThisPlaylistCurrent = currentTrack !== null && playlist.entry.some((s) => s.id === currentTrack.id);
  const isThisPlaylistPlaying = isThisPlaylistCurrent && isPlaying;

  function handlePlayPlaylist() {
    if (isThisPlaylistPlaying) {
      togglePlay();
      return;
    }
    const queue = playlist!.entry.map(toTrack);
    if (queue.length > 0) playFromStart(queue);
  }

  function handleTrackClick(song: PlaylistWithSongsDTO["entry"][number]) {
    if (currentTrack?.id === song.id) {
      togglePlay();
      return;
    }
    const queue = playlist!.entry.map(toTrack);
    playTrack(toTrack(song), queue);
  }

  const activeRowSong = playlist.entry.find((s) => s.id === activeRowSongId) ?? null;

  return (
    <div>
      <div className="flex items-end gap-6 bg-gradient-to-b from-neutral-700 to-neutral-900 px-8 pb-6 pt-16">
        <div className="h-56 w-56 shrink-0 overflow-hidden rounded shadow-2xl">
          {coverUrl ? (
            <img src={coverUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-800 text-neutral-600">♪</div>
          )}
        </div>

        <div className="min-w-0 flex-1" onContextMenu={headerMenu.handleContextMenu}>
          <p className="text-sm font-medium text-white">{t("playlist.label")}</p>
          <h1 className="mt-2">
            <MarqueeText text={name} className="text-5xl font-black text-white" />
          </h1>
          <div className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
            {playlist.owner && <span className="font-semibold text-white">{playlist.owner}</span>}
            <span>· {t("playlist.trackCount", { count: playlist.songCount })}</span>
            <span>, {formatAlbumDuration(playlist.duration, t)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 bg-neutral-900/40 px-8 py-6 mb-6">
        <button
          onClick={handlePlayPlaylist}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg transition hover:scale-105 hover:bg-emerald-400"
          title={t("playlist.play")}
        >
          {isThisPlaylistPlaying ? (
            <Pause size={22} fill="black" className="text-neutral-900" />
          ) : (
            <Play size={22} fill="black" className="ml-1 text-neutral-900" />
          )}
        </button>
      </div>

      <div className="px-8 pb-12">
        <div className="grid grid-cols-[32px_1fr_auto] gap-3 border-b border-neutral-800 px-2 pb-2 text-xs uppercase tracking-wider text-neutral-500">
          <span className="text-center">#</span>
          <span>{t("playlist.columnTitle")}</span>
          <span>{t("playlist.columnDuration")}</span>
        </div>

        {playlist.entry.map((song, index) => {
          const isCurrent = currentTrack?.id === song.id;
          return (
            <div
              key={`${song.id}-${index}`}
              onClick={() => handleTrackClick(song)}
              onContextMenu={(e) => {
                setActiveRowSongId(song.id);
                rowMenu.handleContextMenu(e);
              }}
              className="group grid cursor-pointer grid-cols-[32px_1fr_auto] items-center gap-3 rounded-md px-2 py-3 hover:bg-neutral-800/60"
            >
              <div className="flex items-center justify-center text-sm text-neutral-400">
                {isCurrent && isPlaying ? (
                  <Pause size={14} className="text-emerald-400" fill="currentColor" />
                ) : (
                  <>
                    <span className="group-hover:hidden">{index + 1}</span>
                    <Play size={14} className="hidden text-white group-hover:block" fill="currentColor" />
                  </>
                )}
              </div>

              <div className="min-w-0">
                <MarqueeText
                  text={song.title}
                  className={`text-sm ${isCurrent ? "text-emerald-400" : "text-white"}`}
                />
                <MarqueeText
                  text={song.artist}
                  to={song.artistId ? `/artists/${song.artistId}` : undefined}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-neutral-400 hover:text-white hover:underline"
                />
              </div>

              <span className="text-xs text-neutral-400 tabular-nums">{formatTrackDuration(song.duration)}</span>
            </div>
          );
        })}
      </div>

      {headerMenu.open && (
        <ContextMenu
          x={headerMenu.x}
          y={headerMenu.y}
          onClose={headerMenu.close}
          items={buildPlaylistMenuItems({
            playlist: { id: playlist.id, name, coverArt: playlist.coverArt },
            client,
            t,
            playFromStart,
            addToQueue,
            onOpenInfo: () => setInfoOpen(true),
            onRename: () => setRenameOpen(true),
            onDelete: () => setDeleteOpen(true),
          })}
        />
      )}

      {rowMenu.open && activeRowSong && (
        <ContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          onClose={rowMenu.close}
          items={buildTrackMenuItems({
            track: toTrack(activeRowSong),
            client,
            t,
            navigate,
            addToQueue: (track, position) => addToQueue(track, position),
            onOpenInfo: () => setRowInfoOpen(true),
          })}
        />
      )}

      {infoOpen && (
        <InfoModal
          title={name}
          coverUrl={coverUrl}
          onClose={() => setInfoOpen(false)}
          rows={[
            ...(playlist.owner ? [{ label: t("playlist.owner"), value: playlist.owner }] : []),
            { label: t("playlist.trackCount", { count: playlist.songCount }), value: formatAlbumDuration(playlist.duration, t) },
            ...(playlist.comment ? [{ label: t("playlists.descriptionLabel"), value: playlist.comment }] : []),
          ]}
        />
      )}

      {rowInfoOpen && activeRowSong && (
        <InfoModal
          title={activeRowSong.title}
          coverUrl={activeRowSong.coverArt ? client.getCoverArtUrl(activeRowSong.coverArt, 300) : coverUrl}
          onClose={() => setRowInfoOpen(false)}
          rows={[
            { label: t("playlist.columnTitle"), value: activeRowSong.title },
            { label: t("search.artistLabel"), value: activeRowSong.artist },
            { label: t("album.labelAlbum"), value: activeRowSong.album },
            { label: t("playlist.columnDuration"), value: formatTrackDuration(activeRowSong.duration) },
          ]}
        />
      )}

      {renameOpen && (
        <RenamePlaylistModal
          playlistId={playlist.id}
          currentName={name}
          client={client}
          onClose={() => setRenameOpen(false)}
          onRenamed={(newName) => setDisplayName(newName)}
        />
      )}

      {deleteOpen && (
        <ConfirmDeleteModal
          title={t("playlists.deleteTitle")}
          message={t("playlists.deleteConfirm", { name })}
          confirmLabel={t("contextMenu.delete")}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await client.deletePlaylist(playlist.id);
            navigate("/");
          }}
        />
      )}
    </div>
  );
}
