import { useEffect, useState } from "react";
import type { ArtistWithAlbumsDTO } from "@resonia/api-client";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";

export function useArtist(artistId: string | undefined) {
  const [artist, setArtist] = useState<ArtistWithAlbumsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);

  useEffect(() => {
    if (!artistId) {
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
      .getArtist(artistId)
      .then((result) => {
        if (!cancelled) setArtist(result);
      })
      .catch((err) => {
        console.error("[artist] Échec du chargement", err);
        if (!cancelled) setError("Impossible de charger cet artiste");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [artistId, servers, activeServerId]);

  return { artist, loading, error };
}
