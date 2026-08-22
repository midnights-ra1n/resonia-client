import { useEffect, useState } from "react";
import type { PlaylistWithSongsDTO } from "@resonia/api-client";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";

export function usePlaylist(playlistId: string | undefined) {
  const [playlist, setPlaylist] = useState<PlaylistWithSongsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);

  useEffect(() => {
    if (!playlistId) {
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
    setError(null);

    getClientForServer(server)
      .getPlaylist(playlistId)
      .then((result) => {
        if (!cancelled) setPlaylist(result);
      })
      .catch((err) => {
        console.error("[playlist] Échec du chargement", err);
        if (!cancelled) setError("Impossible de charger cette playlist");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playlistId, servers, activeServerId]);

  return { playlist, loading, error };
}
