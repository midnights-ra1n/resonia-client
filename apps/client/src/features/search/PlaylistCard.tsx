import { useState } from "react";
import { Play } from "lucide-react";
import type { PlaylistSummary } from "@resonia/api-client";
import { MarqueeText } from "../../components/MarqueeText";
import { useCoverArt } from "../../hooks/useCoverArt";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { useTranslation } from "../../lib/i18n";

interface PlaylistCardProps {
  playlist: PlaylistSummary;
}

export function PlaylistCard({ playlist }: PlaylistCardProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const playFromStart = usePlayerStore((s) => s.playFromStart);

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
      }));
      if (queue.length > 0) await playFromStart(queue);
    } catch (err) {
      console.error("[search] Impossible de lancer la playlist", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="group relative w-40 shrink-0 rounded-lg bg-neutral-900 p-3 transition-colors hover:bg-neutral-800">
      <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-md bg-neutral-800">
        {cachedCoverUrl ? (
          <img src={cachedCoverUrl} alt={playlist.name} className="h-full w-full object-cover" />
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

      <MarqueeText text={playlist.name} className="text-sm font-medium text-white" />
      <p className="truncate text-xs text-neutral-400">{t("search.playlistLabel")}</p>
    </div>
  );
}
