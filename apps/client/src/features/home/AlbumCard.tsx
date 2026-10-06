import { useState } from "react";
import { MusicNotes, Play } from "../../components/icons";
import type { AlbumSummary } from "@resonia/api-client";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore } from "../../stores/playerStore";
import { useCoverArt } from "../../hooks/useCoverArt";
import { useInViewport } from "../../hooks/useInViewport";
import { usePlayCollection } from "./usePlayCollection";
import { Link, useNavigate } from "react-router-dom";
import { InfoModal } from "../../components/InfoModal";
import { ContextMenu } from "../../components/menu/ContextMenu";
import { buildAlbumMenuItems } from "../../components/menu/buildAlbumMenuItems";
import { useContextMenu } from "../../components/menu/useContextMenu";
import { formatAlbumDuration } from "../../lib/format/duration";
import { useTranslation } from "../../lib/i18n";
import { CoverImage } from "../../components/CoverImage";
import { albumPrefetchProps } from "../album/useAlbum";

interface AlbumCardProps {
  album: AlbumSummary;
}

export function AlbumCard({ album }: AlbumCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const { playAlbum, loadingId } = usePlayCollection();
  const loading = loadingId === album.id;
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const menu = useContextMenu();
  const [infoOpen, setInfoOpen] = useState(false);

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;
  const coverUrl = client && album.coverArt ? client.getCoverArtUrl(album.coverArt, 300) : undefined;
  const [coverRef, coverInView] = useInViewport<HTMLDivElement>();
  const cachedCoverUrl = useCoverArt(
    activeServerId ?? undefined,
    coverInView ? album.coverArt : undefined,
    300,
    coverUrl,
  );

  function handlePlay(e: React.MouseEvent) {
    e.stopPropagation();
    void playAlbum(album);
  }


  return (
    <div
      className="group relative w-full rounded-panel p-3 transition-colors hover:bg-surface-2"
      onContextMenu={menu.handleContextMenu}
      {...albumPrefetchProps(album.id)}
    >
      {/* Le bouton Play est volontairement HORS du <Link> (frère de la pochette, pas enfant) :
          un bouton dans un lien est du HTML invalide, et surtout le clic remontait jusqu'à
          l'ancre — `stopPropagation()` court-circuitait la navigation client de React Router
          sans annuler l'action par défaut du navigateur, qui suivait alors le lien en
          rechargeant TOUTE la page (musique coupée). Même risque avec le bouton `disabled`
          pendant le chargement, dont Chromium peut transmettre le clic au parent. */}
      <div className="relative mb-3">
        <Link to={`/albums/${album.id}`} tabIndex={-1} className="block cursor-pointer">
          <div ref={coverRef} className="relative aspect-square w-full overflow-hidden rounded-cover bg-surface-2 shadow-e1 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-inset after:ring-white/[0.06]">
            {cachedCoverUrl ? (
              <CoverImage src={cachedCoverUrl} alt={album.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
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

      <Link to={`/albums/${album.id}`} className="block cursor-pointer">
        <p className="truncate text-sm font-medium text-white">{album.name}</p>
      </Link>

      {album.artistId ? (
        <Link
          to={`/artists/${album.artistId}`}
          className="inline-block max-w-full truncate align-top text-xs text-neutral-400 hover:text-white hover:underline"
        >
          {album.artist}
        </Link>
      ) : (
        <p className="truncate text-xs text-neutral-400">{album.artist}</p>
      )}

      {menu.open && client && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={menu.close}
          items={buildAlbumMenuItems({
            album,
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
          title={album.name}
          coverUrl={cachedCoverUrl ?? undefined}
          onClose={() => setInfoOpen(false)}
          rows={[
            { label: t("search.artistLabel"), value: album.artist },
            ...(album.year ? [{ label: t("album.yearLabel"), value: String(album.year) }] : []),
            { label: t("album.trackCount", { count: album.songCount }), value: formatAlbumDuration(album.duration, t) },
          ]}
        />
      )}
    </div>
  );
}