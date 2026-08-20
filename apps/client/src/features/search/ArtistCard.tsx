import type { ArtistSummary } from "@resonia/api-client";
import { Link } from "react-router-dom";
import { useCoverArt } from "../../hooks/useCoverArt";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useServersStore } from "../../stores/serversStore";
import { useTranslation } from "../../lib/i18n";

interface ArtistCardProps {
  artist: ArtistSummary;
}

export function ArtistCard({ artist }: ArtistCardProps) {
  const { t } = useTranslation();
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;
  const coverUrl = client && artist.coverArt ? client.getCoverArtUrl(artist.coverArt, 300) : undefined;
  const cachedCoverUrl = useCoverArt(activeServerId ?? undefined, artist.coverArt, 300, coverUrl);

  return (
    <Link
      to={`/artists/${artist.id}`}
      className="flex w-40 shrink-0 flex-col items-center gap-3 rounded-lg p-3 text-center transition-colors hover:bg-neutral-800"
    >
      <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-neutral-800">
        {cachedCoverUrl ? (
          <img src={cachedCoverUrl} alt={artist.name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-3xl text-neutral-600">♪</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{artist.name}</p>
        <p className="truncate text-xs text-neutral-400">{t("search.artistLabel")}</p>
      </div>
    </Link>
  );
}
