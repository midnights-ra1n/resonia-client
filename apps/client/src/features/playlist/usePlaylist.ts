import { useEffect, useState } from "react";
import type { PlaylistWithSongsDTO } from "@resonia/api-client";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { subscribePlaylistSongsChanged } from "../../lib/playlists/playlistEvents";

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
    const client = getClientForServer(server);

    // `showLoading` reste false pour un rafraîchissement déclenché par un ajout/retrait de
    // titre fait ailleurs (voir l'abonnement ci-dessous) : le contenu déjà affiché reste
    // valide en attendant la réponse, pas besoin de le remplacer par "Chargement...".
    function fetchPlaylist(showLoading: boolean) {
      if (showLoading) setLoading(true);
      setError(null);
      return client
        .getPlaylist(playlistId!)
        .then((result) => {
          if (!cancelled) setPlaylist(result);
        })
        .catch((err) => {
          console.error("[playlist] Échec du chargement", err);
          if (!cancelled) setError("Impossible de charger cette playlist");
        })
        .finally(() => {
          if (!cancelled && showLoading) setLoading(false);
        });
    }

    fetchPlaylist(true);

    // Rafraîchit automatiquement la liste si un titre est ajouté/retiré de CETTE playlist
    // depuis un menu ouvert ailleurs (ex: "Ajouter à une playlist" sur un titre d'une autre
    // page) pendant qu'on est déjà sur sa page — sans ça il fallait changer de page puis
    // revenir pour voir la liste à jour (nouveau montage = nouveau fetch).
    const unsubscribe = subscribePlaylistSongsChanged(playlistId, () => fetchPlaylist(false));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [playlistId, servers, activeServerId]);

  return { playlist, loading, error };
}
