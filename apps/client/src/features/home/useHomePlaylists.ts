import { useEffect, useState } from "react";
import type { PlaylistSummary } from "@resonia/api-client";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useServersStore } from "../../stores/serversStore";

export function useHomePlaylists() {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);

  useEffect(() => {
    const server = servers.find((s) => s.id === activeServerId);
    if (!server) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getClientForServer(server)
      .getPlaylists()
      .then((result) => {
        if (!cancelled) setPlaylists(result);
      })
      .catch((err) => console.error("[home] Échec du chargement des playlists", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [servers, activeServerId]);

  return { playlists, loading };
}
