import { Play } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AlbumSummary } from "@resonia/api-client";
import { InfoModal } from "../../components/InfoModal";
import { MarqueeText } from "../../components/MarqueeText";
import { ContextMenu } from "../../components/menu/ContextMenu";
import { buildAlbumMenuItems } from "../../components/menu/buildAlbumMenuItems";
import { useContextMenu } from "../../components/menu/useContextMenu";
import { useCoverArt } from "../../hooks/useCoverArt";
import { formatAlbumDuration } from "../../lib/format/duration";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";

interface AlbumResultRowProps {
  album: AlbumSummary;
}

export function AlbumResultRow({ album }: AlbumResultRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const menu = useContextMenu();
  const [infoOpen, setInfoOpen] = useState(false);

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;
  const coverUrl = client && album.coverArt ? client.getCoverArtUrl(album.coverArt, 80) : undefined;
  const cachedCoverUrl = useCoverArt(activeServerId ?? undefined, album.coverArt, 80, coverUrl);

  async function handlePlay(e: React.MouseEvent) {
    e.stopPropagation();
    if (!client || loading) return;

    setLoading(true);
    try {
      const full = await client.getAlbum(album.id);
      const queue: Track[] = full.song.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        artistId: s.artistId ?? album.artistId,
        album: s.album,
        albumId: s.albumId ?? album.id,
        duration: s.duration,
        coverUrl: s.coverArt ? client.getCoverArtUrl(s.coverArt, 300) : coverUrl,
      }));

      if (queue.length > 0) await playTrack(queue[0], queue);
    } catch (err) {
      console.error("[search] Impossible de lancer l'album", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/albums/${album.id}`)}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/albums/${album.id}`)}
      onContextMenu={menu.handleContextMenu}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-neutral-800/80"
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-neutral-800">
        {cachedCoverUrl ? (
          <img src={cachedCoverUrl} alt={album.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-600">♪</div>
        )}
        <button
          onClick={handlePlay}
          disabled={loading}
          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
          title={t("album.play")}
        >
          <Play size={16} fill="white" className="text-white" />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <MarqueeText text={album.name} className="text-sm font-medium text-white" />
        <MarqueeText
          text={album.artist}
          to={album.artistId ? `/artists/${album.artistId}` : undefined}
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-neutral-400 hover:text-white hover:underline"
        />
      </div>

      {album.year && <span className="hidden shrink-0 text-xs text-neutral-500 sm:block">{album.year}</span>}
      <span className="shrink-0 text-xs text-neutral-500">{formatAlbumDuration(album.duration, t)}</span>

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
