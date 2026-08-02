import { useEffect, useState } from "react";
import type { AlbumSummary, ArtistWithAlbumsDTO } from "@resonia/api-client";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";

type SimilarAlbumsTitle = "scotter" | "random" | undefined;

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
        // Récupération des albums de l'artiste via getArtist
        const artist = await getClientForServer(server).getArtist(artistId);
        const artistAlbums: AlbumSummary[] = artist.album ?? [];

        let allAlbums: AlbumSummary[] = [];

        // Si title === "scotter", on utilise directement les albums de l'artiste
        if (title === "scotter") {
          allAlbums = artistAlbums;
        } else {
          // Suggestions aléatoires via search3("") triés par playCount
          const searchResult = await getClientForServer(server).search3("");
          const popularAlbums: AlbumSummary[] = searchResult ?? [];

          // On trie par playCount décroissant et on prend les 20 premiers (excluant l'album actuel)
          allAlbums = popularAlbums
            .filter((a) => a.id !== excludeAlbumId && a.playCount > 0)
            .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
            .slice(0, 20);
        }

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