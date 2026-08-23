import { useEffect, useState } from "react";
import type { SongDTO } from "@resonia/api-client";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";

export function useRandomSongs(enabled: boolean, size = 20) {
  const [songs, setSongs] = useState<SongDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const server = servers.find((s) => s.id === activeServerId);
    if (!server) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getClientForServer(server)
      .getRandomSongs(size)
      .then((result) => {
        if (!cancelled) setSongs(result);
      })
      .catch((err) => console.error("[playlist] Échec du chargement des titres aléatoires", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, size, servers, activeServerId]);

  return { songs, loading };
}
