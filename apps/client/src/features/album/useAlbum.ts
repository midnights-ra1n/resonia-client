import { useEffect, useState } from "react";
import type { AlbumWithSongsDTO } from "@resonia/api-client";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";

export function useAlbum(albumId: string | undefined) {
  const [album, setAlbum] = useState<AlbumWithSongsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);

  useEffect(() => {
    if (!albumId) {
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
      .getAlbum(albumId)
      .then((result) => {
        if (!cancelled) setAlbum(result);
      })
      .catch((err) => {
        console.error("[album] Échec du chargement", err);
        if (!cancelled) setError("Impossible de charger cet album");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [albumId, servers, activeServerId]);

  return { album, loading, error };
}