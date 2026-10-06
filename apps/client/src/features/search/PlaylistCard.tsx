import { useState } from "react";
import { Link } from "react-router-dom";
import { MusicNotes, Play } from "../../components/icons";
import type { PlaylistSummary } from "@resonia/api-client";
import { MarqueeText } from "../../components/MarqueeText";
import { InfoModal } from "../../components/InfoModal";
import { ConfirmDeleteModal } from "../../components/ConfirmDeleteModal";
import { ContextMenu } from "../../components/menu/ContextMenu";
import { buildPlaylistMenuItems } from "../../components/menu/buildPlaylistMenuItems";
import { useContextMenu } from "../../components/menu/useContextMenu";
import { RenamePlaylistModal } from "../../app/layout/RenamePlaylistModal";
import { useCoverArt } from "../../hooks/useCoverArt";
import { useInViewport } from "../../hooks/useInViewport";
import { usePlayCollection } from "../home/usePlayCollection";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { useTranslation } from "../../lib/i18n";
import { CoverImage } from "../../components/CoverImage";
import { emitPlaylistsChanged } from "../../lib/playlists/playlistEvents";

interface PlaylistCardProps {
  playlist: PlaylistSummary;
  onDeleted?: () => void;
}

export function PlaylistCard({ playlist, onDeleted }: PlaylistCardProps) {
  const { t } = useTranslation();
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const playFromStart = usePlayerStore((s) => s.playFromStart);
  const { playPlaylist, loadingId } = usePlayCollection();
  const loading = loadingId === playlist.id;
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const menu = useContextMenu();
  const [infoOpen, setInfoOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;
  const coverUrl = client && playlist.coverArt ? client.getCoverArtUrl(playlist.coverArt, 300) : undefined;
  const [coverRef, coverInView] = useInViewport<HTMLDivElement>();
  const cachedCoverUrl = useCoverArt(
    activeServerId ?? undefined,
    playlist.coverArt,
    300,
    coverUrl,
    coverInView,
  );

  function handlePlay(e: React.MouseEvent) {
    e.stopPropagation();
    void playPlaylist(playlist);
  }


  const name = displayName ?? playlist.name;

  return (
    <div
      className="grid-card-cv group relative w-40 shrink-0 rounded-panel p-3 transition-colors hover:bg-surface-2"
      onContextMenu={menu.handleContextMenu}
    >
      {/* Le bouton Play est volontairement HORS du <Link> (frère de la pochette, pas enfant) :
          un bouton dans un lien est du HTML invalide, et surtout le clic remontait jusqu'à
          l'ancre — `stopPropagation()` court-circuitait la navigation client de React Router
          sans annuler l'action par défaut du navigateur, qui suivait alors le lien en
          rechargeant TOUTE la page (musique coupée). Même risque avec le bouton `disabled`
          pendant le chargement, dont Chromium peut transmettre le clic au parent. */}
      <div className="relative mb-3">
        <Link to={`/playlists/${playlist.id}`} tabIndex={-1} className="block cursor-pointer">
          <div ref={coverRef} className="relative aspect-square w-full overflow-hidden rounded-cover bg-surface-2 shadow-e1 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-inset after:ring-white/[0.06]">
            {cachedCoverUrl ? (
              <CoverImage src={cachedCoverUrl} alt={name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-neutral-600">
                <MusicNotes size={32} />
              </div>
            )}
          </div>
        </Link>
        <button
          onClick={handlePlay}
          disabled={loading}
          className="absolute bottom-2 right-2 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-accent opacity-0 shadow-play transition-[opacity,transform,translate,scale,background-color] duration-200 hover:scale-105 hover:bg-accent-hover group-hover:translate-y-0 group-hover:opacity-100 disabled:opacity-50"
          title={t("album.play")}
        >
          <Play size={18} fill="currentColor" className="ml-0.5 text-on-accent" />
        </button>
      </div>

      <Link to={`/playlists/${playlist.id}`} className="block cursor-pointer">
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
            emitPlaylistsChanged();
            onDeleted?.();
          }}
        />
      )}
    </div>
  );
}
