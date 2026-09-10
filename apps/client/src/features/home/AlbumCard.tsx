import { useState } from "react";
import { Play } from "lucide-react";
import type { AlbumSummary } from "@resonia/api-client";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useCoverArt } from "../../hooks/useCoverArt";
import { Link, useNavigate } from "react-router-dom";
import { InfoModal } from "../../components/InfoModal";
import { ContextMenu } from "../../components/menu/ContextMenu";
import { buildAlbumMenuItems } from "../../components/menu/buildAlbumMenuItems";
import { useContextMenu } from "../../components/menu/useContextMenu";
import { formatAlbumDuration } from "../../lib/format/duration";
import { useTranslation } from "../../lib/i18n";

interface AlbumCardProps {
  album: AlbumSummary;
}

export function AlbumCard({ album }: AlbumCardProps) {
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
  const coverUrl = client && album.coverArt ? client.getCoverArtUrl(album.coverArt, 300) : undefined;
  const cachedCoverUrl = useCoverArt(activeServerId ?? undefined, album.coverArt, 300, coverUrl);

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
        coverArtId: s.coverArt ?? album.coverArt,
      }));

      if (queue.length > 0) {
        await playTrack(queue[0], queue);
      }
    } catch (err) {
      console.error("[home] Impossible de lancer l'album", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="group relative w-full rounded-lg bg-neutral-900 p-3 transition-colors hover:bg-neutral-800"
      onContextMenu={menu.handleContextMenu}
    >
      <Link to={`/albums/${album.id}`} className="block cursor-pointer">
        <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-md bg-neutral-800">
          {cachedCoverUrl ? (
            <img src={cachedCoverUrl} alt={album.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-600">♪</div>
          )}

          <button
            onClick={handlePlay}
            disabled={loading}
            className="absolute bottom-2 right-2 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-emerald-500 opacity-0 shadow-lg transition-all duration-200 hover:scale-105 hover:bg-emerald-400 group-hover:translate-y-0 group-hover:opacity-100 disabled:opacity-50"
            title="Lecture"
          >
            <Play size={18} fill="black" className="ml-0.5 text-neutral-900" />
          </button>
        </div>

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