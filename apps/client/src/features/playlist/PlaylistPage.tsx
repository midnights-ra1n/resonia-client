import { ArrowDownAZ, ArrowUpAZ, Check, ChevronDown, GripVertical, Pause, Play, Shuffle } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PlaylistWithSongsDTO } from "@resonia/api-client";
import { MarqueeText } from "../../components/MarqueeText";
import { ConfirmDeleteModal } from "../../components/ConfirmDeleteModal";
import { InfoModal } from "../../components/InfoModal";
import { ContextMenu, type MenuItem } from "../../components/menu/ContextMenu";
import { buildPlaylistMenuItems } from "../../components/menu/buildPlaylistMenuItems";
import { buildTrackMenuItems } from "../../components/menu/buildTrackMenuItems";
import { useContextMenu } from "../../components/menu/useContextMenu";
import { RenamePlaylistModal } from "../../app/layout/RenamePlaylistModal";
import { formatAlbumDuration, formatTrackDuration } from "../../lib/format/duration";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { useSettingsStore, type PlaylistSortBy } from "../../stores/settingsStore";
import { usePlaylist } from "./usePlaylist";
import { useRandomSongs } from "./useRandomSongs";
import { RandomSongsCarousel } from "./RandomSongsCarousel";

const SORT_FIELDS: PlaylistSortBy[] = ["default", "title", "artist", "album"];

type PlaylistEntry = PlaylistWithSongsDTO["entry"][number];

function sortPlaylistEntries(
  entries: PlaylistEntry[],
  sortBy: PlaylistSortBy,
  direction: "asc" | "desc",
): PlaylistEntry[] {
  if (sortBy === "default") return entries;

  const field: Record<Exclude<PlaylistSortBy, "default">, (entry: PlaylistEntry) => string> = {
    title: (entry) => entry.title,
    artist: (entry) => entry.artist,
    album: (entry) => entry.album,
  };
  const getValue = field[sortBy];

  const sorted = [...entries].sort((a, b) => getValue(a).localeCompare(getValue(b)));
  return direction === "asc" ? sorted : sorted.reverse();
}

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

  const playlistSortBy = useSettingsStore((s) => s.playlistSortBy);
  const playlistSortDirection = useSettingsStore((s) => s.playlistSortDirection);
  const setPlaylistSort = useSettingsStore((s) => s.setPlaylistSort);
  const [sortMenu, setSortMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 });

  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const isShuffle = usePlayerStore((s) => s.isShuffle);

  const isEmpty = !loading && !error && !!playlist && playlist.entry.length === 0;
  const { songs: randomSongs } = useRandomSongs(isEmpty, 20);

  // Ordre "personnalisé" (glisser-déposer) maintenu en local : on ne le fait pas dépendre
  // de la playlist chargée pour éviter de perdre l'ordre en cours de manipulation si le
  // fetch se rejoue — il est simplement remis à zéro quand on change de playlist.
  const [orderOverride, setOrderOverride] = useState<PlaylistEntry[] | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after">("before");
  const [orderOverrideId, setOrderOverrideId] = useState(id);
  if (id !== orderOverrideId) {
    setOrderOverrideId(id);
    setOrderOverride(null);
  }

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

  const canReorder = playlistSortBy === "default";
  const defaultEntries = orderOverride ?? playlist.entry;
  const sortedEntries = sortPlaylistEntries(defaultEntries, playlistSortBy, playlistSortDirection);

  function handleRowDragStart(index: number) {
    setDragIndex(index);
  }

  function handleRowDragOver(e: React.DragEvent, index: number) {
    if (dragIndex === null) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const isTopHalf = e.clientY < rect.top + rect.height / 2;
    setHoverIndex(index);
    setDropPosition(isTopHalf ? "before" : "after");
  }

  function handleRowDragEnd() {
    setDragIndex(null);
    setHoverIndex(null);
  }

  function handleRowDrop() {
    if (dragIndex === null || hoverIndex === null) {
      setDragIndex(null);
      setHoverIndex(null);
      return;
    }

    let toIndex = hoverIndex + (dropPosition === "after" ? 1 : 0);
    if (dragIndex < toIndex) toIndex -= 1;

    if (dragIndex !== toIndex) {
      const newOrder = [...defaultEntries];
      const [moved] = newOrder.splice(dragIndex, 1);
      newOrder.splice(toIndex, 0, moved);
      setOrderOverride(newOrder);
      client
        .reorderPlaylist(playlist.id, newOrder.map((entry) => entry.id), defaultEntries.length)
        .catch((err) => console.error("[playlist] Échec de la réorganisation", err));
    }

    setDragIndex(null);
    setHoverIndex(null);
  }

  const isThisPlaylistCurrent = currentTrack !== null && playlist.entry.some((s) => s.id === currentTrack.id);
  const isThisPlaylistPlaying = isThisPlaylistCurrent && isPlaying;

  function handlePlayPlaylist() {
    if (isThisPlaylistPlaying) {
      togglePlay();
      return;
    }
    const queue = sortedEntries.map(toTrack);
    if (queue.length > 0) playFromStart(queue);
  }

  function handleTrackClick(song: PlaylistWithSongsDTO["entry"][number]) {
    if (currentTrack?.id === song.id) {
      togglePlay();
      return;
    }
    const queue = sortedEntries.map(toTrack);
    playTrack(toTrack(song), queue);
  }

  function handleSortSelect(field: PlaylistSortBy) {
    if (field === "default") {
      setPlaylistSort("default", "asc");
      return;
    }
    if (playlistSortBy === field) {
      setPlaylistSort(field, playlistSortDirection === "asc" ? "desc" : "asc");
    } else {
      setPlaylistSort(field, "asc");
    }
  }

  const SORT_LABEL_KEYS: Record<PlaylistSortBy, string> = {
    default: "playlist.sortDefault",
    title: "playlist.sortTitle",
    artist: "playlist.sortArtist",
    album: "playlist.sortAlbum",
  };

  const sortMenuItems: MenuItem[] = SORT_FIELDS.map((field) => ({
    type: "action",
    label: t(SORT_LABEL_KEYS[field]),
    icon: playlistSortBy === field ? Check : undefined,
    onClick: () => handleSortSelect(field),
  }));

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
        {!isEmpty && (
          <>
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

            <button
              onClick={toggleShuffle}
              className={`transition-colors ${isShuffle ? "text-emerald-400" : "text-neutral-400 hover:text-white"}`}
              title={t("playlist.shuffle")}
            >
              <Shuffle size={24} />
            </button>

            <button
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setSortMenu({ open: true, x: rect.left, y: rect.bottom + 4 });
              }}
              className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-neutral-400 transition hover:text-white"
              title={t("playlist.sortLabel")}
            >
              <span>{t(SORT_LABEL_KEYS[playlistSortBy])}</span>
              {playlistSortBy !== "default" &&
                (playlistSortDirection === "asc" ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />)}
              <ChevronDown size={14} />
            </button>
          </>
        )}
      </div>

      <div className="px-8 pb-12">
        {isEmpty ? (
          <>
            <div className="rounded-lg border border-dashed border-neutral-800 px-6 py-10 text-center">
              <p className="text-lg font-semibold text-white">{t("playlist.emptyTitle")}</p>
              <p className="mt-1 text-sm text-neutral-400">{t("playlist.emptySubtitle")}</p>
            </div>

            {randomSongs.length > 0 && (
              <RandomSongsCarousel title={t("playlist.emptySuggestions")} songs={randomSongs} client={client} />
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-[32px_1fr_1fr_auto] gap-3 border-b border-neutral-800 px-2 pb-2 text-xs uppercase tracking-wider text-neutral-500">
              <span className="text-center">#</span>
              <span>{t("playlist.columnTitle")}</span>
              <span>{t("playlist.columnAlbum")}</span>
              <span>{t("playlist.columnDuration")}</span>
            </div>

            <div onDragOver={(e) => canReorder && e.preventDefault()} onDrop={canReorder ? handleRowDrop : undefined}>
              {sortedEntries.map((song, index) => {
                const isCurrent = currentTrack?.id === song.id;
                return (
                  <div
                    key={`${song.id}-${index}`}
                    draggable={canReorder}
                    onDragStart={canReorder ? () => handleRowDragStart(index) : undefined}
                    onDragOver={canReorder ? (e) => handleRowDragOver(e, index) : undefined}
                    onDragEnd={canReorder ? handleRowDragEnd : undefined}
                    onClick={() => handleTrackClick(song)}
                    onContextMenu={(e) => {
                      setActiveRowSongId(song.id);
                      rowMenu.handleContextMenu(e);
                    }}
                    className={`group relative grid cursor-pointer grid-cols-[32px_1fr_1fr_auto] items-center gap-3 rounded-md px-2 py-3 hover:bg-neutral-800/60 ${
                      dragIndex === index ? "opacity-40" : ""
                    }`}
                  >
                    {canReorder && hoverIndex === index && dropPosition === "before" && (
                      <div className="pointer-events-none absolute -top-px left-0 right-0 z-10 h-0.5 bg-emerald-500" />
                    )}

                    <div className="flex items-center justify-center text-sm text-neutral-400">
                      {isCurrent && isPlaying ? (
                        <Pause size={14} className="text-emerald-400" fill="currentColor" />
                      ) : canReorder ? (
                        <>
                          <span className="group-hover:hidden">{index + 1}</span>
                          <GripVertical
                            size={14}
                            className="hidden cursor-grab text-neutral-400 group-hover:block active:cursor-grabbing"
                          />
                        </>
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
                        <Link
                          to={`/albums/${song.albumId}`}
                          onClick={(e) => e.stopPropagation()}
                          draggable={false}
                          className="block truncate text-xs text-neutral-400 hover:text-white hover:underline"
                        >
                          {song.album}
                        </Link>
                      ) : (
                        <span className="block truncate text-xs text-neutral-400">{song.album}</span>
                      )}
                    </div>

                    <span className="text-xs text-neutral-400 tabular-nums">{formatTrackDuration(song.duration)}</span>

                    {canReorder && hoverIndex === index && dropPosition === "after" && (
                      <div className="pointer-events-none absolute -bottom-px left-0 right-0 z-10 h-0.5 bg-emerald-500" />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {sortMenu.open && (
        <ContextMenu
          x={sortMenu.x}
          y={sortMenu.y}
          onClose={() => setSortMenu((s) => ({ ...s, open: false }))}
          items={sortMenuItems}
        />
      )}

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
