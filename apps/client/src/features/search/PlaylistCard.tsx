import { useState } from "react";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import type { PlaylistSummary } from "@resonia/api-client";
import { MarqueeText } from "../../components/MarqueeText";
import { InfoModal } from "../../components/InfoModal";
import { ConfirmDeleteModal } from "../../components/ConfirmDeleteModal";
import { ContextMenu } from "../../components/menu/ContextMenu";
import { buildPlaylistMenuItems } from "../../components/menu/buildPlaylistMenuItems";
import { useContextMenu } from "../../components/menu/useContextMenu";
import { RenamePlaylistModal } from "../../app/layout/RenamePlaylistModal";
import { useCoverArt } from "../../hooks/useCoverArt";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { useTranslation } from "../../lib/i18n";

interface PlaylistCardProps {
  playlist: PlaylistSummary;
  onDeleted?: () => void;
}

export function PlaylistCard({ playlist, onDeleted }: PlaylistCardProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const playFromStart = usePlayerStore((s) => s.playFromStart);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const menu = useContextMenu();
  const [infoOpen, setInfoOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;
  const coverUrl = client && playlist.coverArt ? client.getCoverArtUrl(playlist.coverArt, 300) : undefined;
  const cachedCoverUrl = useCoverArt(activeServerId ?? undefined, playlist.coverArt, 300, coverUrl);

  async function handlePlay(e: React.MouseEvent) {
    e.stopPropagation();
    if (!client || loading) return;

    setLoading(true);
    try {
      const full = await client.getPlaylist(playlist.id);
      const queue: Track[] = full.entry.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        artistId: s.artistId,
        album: s.album,
        albumId: s.albumId,
        duration: s.duration,
        coverUrl: s.coverArt ? client.getCoverArtUrl(s.coverArt, 300) : coverUrl,
        coverArtId: s.coverArt ?? playlist.coverArt,
      }));
      if (queue.length > 0) await playFromStart(queue);
    } catch (err) {
      console.error("[search] Impossible de lancer la playlist", err);
    } finally {
      setLoading(false);
    }
  }

  const name = displayName ?? playlist.name;

  return (
    <div
      className="group relative w-40 shrink-0 rounded-lg bg-neutral-900 p-3 transition-colors hover:bg-neutral-800"
      onContextMenu={menu.handleContextMenu}
    >
      <Link to={`/playlists/${playlist.id}`} className="block cursor-pointer">
        <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-md bg-neutral-800">
          {cachedCoverUrl ? (
            <img src={cachedCoverUrl} alt={name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-600">♪</div>
          )}

          <button
            onClick={handlePlay}
            disabled={loading}
            className="absolute bottom-2 right-2 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-emerald-500 opacity-0 shadow-lg transition-all duration-200 hover:scale-105 hover:bg-emerald-400 group-hover:translate-y-0 group-hover:opacity-100 disabled:opacity-50"
            title={t("album.play")}
          >
            <Play size={18} fill="black" className="ml-0.5 text-neutral-900" />
          </button>
        </div>

        <MarqueeText text={name} className="text-sm font-medium text-white" />
        <p className="truncate text-xs text-neutral-400">{t("search.playlistLabel")}</p>
      </Link>

      {menu.open && client && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={menu.close}
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

      {infoOpen && (
        <InfoModal
          title={name}
          coverUrl={cachedCoverUrl ?? undefined}
          onClose={() => setInfoOpen(false)}
          rows={[{ label: t("playlist.songCountLabel"), value: String(playlist.songCount) }]}
        />
      )}

      {renameOpen && client && (
        <RenamePlaylistModal
          playlistId={playlist.id}
          currentName={name}
          client={client}
          onClose={() => setRenameOpen(false)}
          onRenamed={setDisplayName}
        />
      )}

      {deleteOpen && client && (
        <ConfirmDeleteModal
          title={t("playlists.deleteTitle")}
          message={t("playlists.deleteConfirm", { name })}
          confirmLabel={t("contextMenu.delete")}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await client.deletePlaylist(playlist.id);
            onDeleted?.();
          }}
        />
      )}
    </div>
  );
}
