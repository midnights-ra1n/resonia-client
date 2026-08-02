import { useEffect, useState } from "react";
import { useServersStore } from "../stores/serversStore";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { useTranslation } from "../lib/i18n";

export interface PlaylistItem {
  id: string;
  name: string;
  songCount: number;
  coverArt?: string;
  lastPlayedTrackIds?: Set<string>;
}

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const { t } = useTranslation();

  useEffect(() => {
    const server = servers.find((s) => s.id === activeServerId);
    if (!server) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const client = getClientForServer(server);

    client
      .getPlaylists()
      .then((result) => {
        if (cancelled) return;
        setPlaylists(
          result.map((p) => ({
            id: p.id,
            name: p.name,
            songCount: p.songCount,
            coverArt: p.coverArt ? client.getCoverArtUrl(p.coverArt, 80) : undefined,
          })),
        );
      })
      .catch((err) => {
        console.error("[playlists] Échec du chargement", err);
        if (!cancelled) setError(t("playlists.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [servers, activeServerId, t]);

  return { playlists, loading, error };
}
