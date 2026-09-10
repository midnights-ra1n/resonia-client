import { useState } from "react";
import { Link } from "react-router-dom";
import { Library, Play, Pause } from "lucide-react";
import { MarqueeText } from "../../components/MarqueeText";
import { InfoModal } from "../../components/InfoModal";
import { ConfirmDeleteModal } from "../../components/ConfirmDeleteModal";
import { ContextMenu } from "../../components/menu/ContextMenu";
import { buildPlaylistMenuItems } from "../../components/menu/buildPlaylistMenuItems";
import { useContextMenu } from "../../components/menu/useContextMenu";
import { useTranslation } from "../../lib/i18n";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import type { PlaylistItem } from "../../hooks/usePlaylists";
import { RenamePlaylistModal } from "./RenamePlaylistModal";

interface PlaylistSidebarItemProps {
  playlist: PlaylistItem;
  onChanged: () => void;
}

export function PlaylistSidebarItem({ playlist, onChanged }: PlaylistSidebarItemProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const playFromStart = usePlayerStore((s) => s.playFromStart);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const menu = useContextMenu();
  const [infoOpen, setInfoOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
        coverArtId: s.coverArt,
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
    <>
      <Link
        to={`/playlists/${playlist.id}`}
        onContextMenu={menu.handleContextMenu}
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

        <div className="min-w-0 flex-1">
          <MarqueeText text={playlist.name} className="text-neutral-300 group-hover:text-white" />
        </div>
      </Link>

      {menu.open && client && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={menu.close}
          items={buildPlaylistMenuItems({
            playlist,
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

      {infoOpen && (
        <InfoModal
          title={playlist.name}
          coverUrl={playlist.coverArt}
          onClose={() => setInfoOpen(false)}
          rows={[{ label: t("playlist.songCountLabel"), value: String(playlist.songCount) }]}
        />
      )}

      {renameOpen && client && (
        <RenamePlaylistModal
          playlistId={playlist.id}
          currentName={playlist.name}
          client={client}
          onClose={() => setRenameOpen(false)}
          onRenamed={onChanged}
        />
      )}

      {deleteOpen && client && (
        <ConfirmDeleteModal
          title={t("playlists.deleteTitle")}
          message={t("playlists.deleteConfirm", { name: playlist.name })}
          confirmLabel={t("contextMenu.delete")}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await client.deletePlaylist(playlist.id);
            onChanged();
          }}
        />
      )}
    </>
  );
}
