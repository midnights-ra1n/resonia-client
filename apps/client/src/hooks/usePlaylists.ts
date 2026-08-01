import type { AlbumSummary } from "@resonia/api-client/src/subsonic/types";
import { useEffect, useState } from "react";

export function usePlaylists() {
  // L'API Subsonic/Navidrome n'a PAS d'endpoint pour les playlists.
  // Il n'existe que des endpoints albums (`getAlbumList2`, `getAlbum`, etc.)
  // On retourne toujours un tableau vide car il n'y a pas de support native pour les playlists.
  const [playlists, setPlaylists] = useState<AlbumSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Aucun appel API nécessaire — pas d'endpoint playlists dans Subsonic/Navidrome.
    setPlaylists([]);
    setLoading(false);
    setError(null);
  }, []);

  return { playlists, loading, error };
}
