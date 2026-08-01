import { useEffect, useState } from "react";
import { useServersStore } from "../stores/serversStore";
import type { StoredServer } from "../stores/serversStore";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import type { AlbumSummary } from "@resonia/api-client/src/subsonic/types";

export function usePlaylists() {
  const { servers, activeServerId } = useServersStore();
  
  const [playlists, setPlaylists] = useState<AlbumSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeServerId || !servers.length) {
      return;
    }

    const fetchPlaylists = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const server = servers.find((s) => s.id === activeServerId);
        if (!server) return;

        const client = getClientForServer(server);
        
        // Fetch frequent playlists (most similar to Spotify's "Recently Played" / "Popular")
        const frequent = await client.getAlbumList2("frequent", 15, 0);
        
        setPlaylists(frequent);
      } catch (err) {
        setError((err as Error).message || "Erreur lors du chargement des playlists");
      } finally {
        setLoading(false);
      }
    };

    fetchPlaylists();
  }, [activeServerId, servers]);

  return { playlists, loading, error };
}
