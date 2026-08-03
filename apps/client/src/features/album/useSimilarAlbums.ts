import { useEffect, useState } from "react";
import type { AlbumSummary } from "@resonia/api-client";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";

type SimilarAlbumsTitle = "random" | undefined;

export function useSimilarAlbums(
  artistId: string | undefined,
  excludeAlbumId: string,
  title?: SimilarAlbumsTitle,
) {
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
        // Suggestions aléatoires via getAlbumList2 (type: random)
        const randomAlbums: AlbumSummary[] = await getClientForServer(server).getAlbumList2("random", 20, 0);

        const allAlbums = randomAlbums.filter((a) => a.id !== excludeAlbumId).slice(0, 20);

        if (!cancelled) {
          setAlbums(allAlbums);
        }
      } catch (err) {
        console.error("[album] Échec du chargement des albums similaires", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [artistId, excludeAlbumId, servers, activeServerId, title]);

  return { albums, loading };
}