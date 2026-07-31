import { useEffect, useState } from "react";
import type { AlbumSummary } from "@resonia/api-client";
import { useServersStore } from "../stores/serversStore";
import { getClientForServer } from "../lib/subsonic/getClientForServer";

export function useMostPlayedAlbums() {
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
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
      .getAlbumList2("frequent", 20)
      .then((result) => {
        if (!cancelled) setAlbums(result);
      })
      .catch((err) => console.error("[home] Échec du chargement des albums les plus joués", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [servers, activeServerId]);

  return { albums, loading };
}
