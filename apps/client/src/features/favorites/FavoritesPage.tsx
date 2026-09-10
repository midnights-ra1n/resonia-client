import { Heart, Pause, Play, Shuffle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SongDTO } from "@resonia/api-client";
import { MarqueeText } from "../../components/MarqueeText";
import { InfoModal } from "../../components/InfoModal";
import { ContextMenu } from "../../components/menu/ContextMenu";
import { buildTrackMenuItems } from "../../components/menu/buildTrackMenuItems";
import { useContextMenu } from "../../components/menu/useContextMenu";
import { formatTrackDuration } from "../../lib/format/duration";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { useTrackListSelection } from "../../hooks/useTrackListSelection";
import { useLikedSongs } from "./useLikedSongs";

export function FavoritesPage() {
  const { songs, loading, error, unlike } = useLikedSongs();
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
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const isShuffle = usePlayerStore((s) => s.isShuffle);

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;

  const rowMenu = useContextMenu();
  const [activeRowSongId, setActiveRowSongId] = useState<string | null>(null);
  const [rowInfoOpen, setRowInfoOpen] = useState(false);

  const {
    selectedIndices,
    isSelected: isSongSelected,
    handleRowClick: handleRowSelectClick,
    handleKeyDown: handleListKeyDown,
    ensureSelected,
    containerRef: trackListRef,
    registerRow: registerTrackRow,
  } = useTrackListSelection(songs.length);

  if (loading) {
    return <div className="p-8 text-neutral-400">{t("common.loading")}</div>;
  }

  if (error || !client) {
    return <div className="p-8 text-neutral-400">{error}</div>;
  }

  function toTrack(song: SongDTO): Track {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      artistId: song.artistId,
      album: song.album,
      albumId: song.albumId,
      duration: song.duration,
      coverUrl: song.coverArt
        ? client!.getCoverArtUrl(song.coverArt, 300)
        : undefined,
      coverArtId: song.coverArt,
    };
  }

  const isEmpty = songs.length === 0;
  const isThisListCurrent =
    currentTrack !== null && songs.some((s) => s.id === currentTrack.id);
  const isThisListPlaying = isThisListCurrent && isPlaying;

  function handlePlayAll() {
    if (isThisListPlaying) {
      togglePlay();
      return;
    }
    const queue = songs.map(toTrack);
    if (queue.length > 0) playFromStart(queue);
  }

  function handleTrackClick(song: SongDTO) {
    if (currentTrack?.id === song.id) {
      togglePlay();
      return;
    }
    playTrack(toTrack(song), songs.map(toTrack));
  }

  const activeRowSong = songs.find((s) => s.id === activeRowSongId) ?? null;

  return (
    <div>
      <div className="flex items-end gap-6 bg-gradient-to-b from-purple-800 to-neutral-900 px-8 pb-6 pt-16">
        <div className="flex h-56 w-56 shrink-0 items-center justify-center rounded bg-gradient-to-br from-indigo-500 to-purple-700 shadow-2xl">
          <Heart size={80} className="text-white" fill="currentColor" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{t("favorites.title")}</p>
          <h1 className="mt-2">
            <MarqueeText
              text={t("favorites.title")}
              className="text-5xl font-black text-white"
            />
          </h1>
          <div className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
            <span>{t("favorites.trackCount", { count: songs.length })}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 bg-neutral-900/40 px-8 py-6 mb-6">
        {!isEmpty && (
          <>
            <button
              onClick={handlePlayAll}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg transition hover:scale-105 hover:bg-emerald-400"
              title={t("favorites.play")}
            >
              {isThisListPlaying ? (
                <Pause size={22} fill="black" className="text-neutral-900" />
              ) : (
                <Play size={22} fill="black" className="ml-1 text-neutral-900" />
              )}
            </button>

            <button
              onClick={toggleShuffle}
              className={`transition-colors ${isShuffle ? "text-emerald-400" : "text-neutral-400 hover:text-white"}`}
              title={t("favorites.shuffle")}
            >
              <Shuffle size={24} />
            </button>
          </>
        )}
      </div>

      <div className="px-8 pb-12">
        {isEmpty ? (
          <div className="rounded-lg border border-dashed border-neutral-800 px-6 py-10 text-center">
            <p className="text-lg font-semibold text-white">
              {t("favorites.emptyTitle")}
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              {t("favorites.emptySubtitle")}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[32px_1fr_1fr_72px_96px_40px] gap-3 border-b border-neutral-800 px-2 pb-2 text-xs uppercase tracking-wider text-neutral-500">
              <span className="text-center">#</span>
              <span>{t("playlist.columnTitle")}</span>
              <span>{t("playlist.columnAlbum")}</span>
              <span className="text-right">{t("playlist.columnDuration")}</span>
              <span />
              <span />
            </div>

            <div
              ref={trackListRef}
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              className="outline-none"
            >
              {songs.map((song, index) => {
                const isCurrent = currentTrack?.id === song.id;
                const isSelected = isSongSelected(index);
                return (
                  <div
                    key={`${song.id}-${index}`}
                    ref={(el) => registerTrackRow(index, el)}
                    onClick={(e) => handleRowSelectClick(e, index)}
                    onDoubleClick={() => handleTrackClick(song)}
                    onContextMenu={(e) => {
                      ensureSelected(index);
                      setActiveRowSongId(song.id);
                      rowMenu.handleContextMenu(e);
                    }}
                    className={`track-row-cv group relative grid cursor-pointer select-none grid-cols-[32px_1fr_1fr_72px_96px_40px] items-center gap-3 rounded-md px-2 py-3 hover:bg-neutral-800/60 ${
                      isSelected ? "bg-neutral-800/70" : ""
                    }`}
                  >
                    <div className="flex items-center justify-center text-sm text-neutral-400">
                      {isCurrent && isPlaying ? (
                        <Pause size={14} className="text-emerald-400" fill="currentColor" />
                      ) : (
                        <>
                          <span className="group-hover:hidden">{index + 1}</span>
                          <Play
                            size={14}
                            className="hidden text-white group-hover:block"
                            fill="currentColor"
                          />
                        </>
                      )}
                    </div>

                    <div className="min-w-0">
                      <MarqueeText
                        text={song.title}
                        draggable={false}
                        className={`text-sm ${isCurrent ? "text-emerald-400" : "text-white"}`}
                      />
                      <MarqueeText
                        text={song.artist}
                        to={song.artistId ? `/artists/${song.artistId}` : undefined}
                        onClick={(e) => e.stopPropagation()}
                        draggable={false}
                        className="text-xs text-neutral-400 hover:text-white hover:underline"
                      />
                    </div>

                    <div className="min-w-0">
                      {song.albumId ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/albums/${song.albumId}`);
                          }}
                          className="block truncate text-left text-xs text-neutral-400 hover:text-white hover:underline"
                        >
                          {song.album}
                        </button>
                      ) : (
                        <span className="block truncate text-xs text-neutral-400">
                          {song.album}
                        </span>
                      )}
                    </div>

                    <span className="text-right text-xs text-neutral-400 tabular-nums">
                      {formatTrackDuration(song.duration)}
                    </span>

                    <span />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        unlike(song.id);
                      }}
                      title={t("favorites.unlike")}
                      className="flex items-center justify-center text-emerald-400 opacity-0 transition hover:scale-110 group-hover:opacity-100"
                    >
                      <Heart size={16} fill="currentColor" />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

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
            selectedTrackIds: Array.from(selectedIndices)
              .map((i) => songs[i]?.id)
              .filter((id): id is string => id !== undefined),
          })}
        />
      )}

      {rowInfoOpen && activeRowSong && (
        <InfoModal
          title={activeRowSong.title}
          coverUrl={
            activeRowSong.coverArt
              ? client.getCoverArtUrl(activeRowSong.coverArt, 300)
              : undefined
          }
          onClose={() => setRowInfoOpen(false)}
          rows={[
            { label: t("playlist.columnTitle"), value: activeRowSong.title },
            { label: t("search.artistLabel"), value: activeRowSong.artist },
            { label: t("album.labelAlbum"), value: activeRowSong.album },
            {
              label: t("playlist.columnDuration"),
              value: formatTrackDuration(activeRowSong.duration),
            },
          ]}
        />
      )}
    </div>
  );
}
