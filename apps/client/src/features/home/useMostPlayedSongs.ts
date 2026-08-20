import { useEffect, useState } from "react";
import type { SongDTO } from "@resonia/api-client";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";

const TOP_SONGS_LIMIT = 20;

export function useMostPlayedSongs() {
  const [songs, setSongs] = useState<SongDTO[]>([]);
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
      .search3("", { songCount: 500, albumCount: 0, artistCount: 0 })
      .then((results) => {
        if (cancelled) return;
        const sorted = results.song
          .filter((s) => (s.playCount ?? 0) > 0)
          .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
          .slice(0, TOP_SONGS_LIMIT);
        setSongs(sorted);
      })
      .catch((err) => console.error("[home] Échec du chargement des titres les plus joués", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [servers, activeServerId]);

  return { songs, loading };
}
