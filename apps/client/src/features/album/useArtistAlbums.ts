import { useEffect, useState } from "react";
import type { AlbumSummary } from "@resonia/api-client";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";

export function useArtistAlbums(artistId: string | undefined, excludeAlbumId: string) {
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);

useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!artistId) {
        if (!cancelled) setLoading(false);
        return;
      }

      const server = servers.find((s) => s.id === activeServerId);
      if (!server) {
        if (!cancelled) setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const result = await getClientForServer(server).getArtist(artistId);
        if (!cancelled) {
          setAlbums((result.album ?? []).filter((a) => a.id !== excludeAlbumId).slice(0, 100));
        }
      } catch (err) {
        console.error("[album] Échec du chargement des albums de l'artiste", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [artistId, excludeAlbumId, servers, activeServerId]);

  return { albums, loading };
}