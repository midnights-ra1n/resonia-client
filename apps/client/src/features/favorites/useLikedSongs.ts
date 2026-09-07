import { useEffect, useState } from "react";
import type { SongDTO } from "@resonia/api-client";
import { useServersStore } from "../../stores/serversStore";
import { useFavoritesStore } from "../../stores/favoritesStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";

export function useLikedSongs() {
  const [songs, setSongs] = useState<SongDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const server = servers.find((s) => s.id === activeServerId);

  useEffect(() => {
    if (!server) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getClientForServer(server)
      .getStarred2()
      .then((result) => {
        if (!cancelled) {
          setSongs(result);
          useFavoritesStore.getState().setLiked(result.map((s) => s.id));
        }
      })
      .catch((err) => {
        console.error("[favorites] Échec du chargement", err);
        if (!cancelled) setError("Impossible de charger les titres likés");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [server]);

  function unlike(songId: string) {
    setSongs((prev) => prev.filter((s) => s.id !== songId));
    useFavoritesStore.getState().unlike(songId);
  }

  return { songs, loading, error, unlike };
}
