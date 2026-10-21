import { useCachedQuery } from "../../lib/cache/queryCache";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useServersStore } from "../../stores/serversStore";

export function artistQueryKey(serverId: string, artistId: string): string {
  return `${serverId}:artist:${artistId}`;
}

/** Servi par le cache des requêtes : revenir sur un artiste l'affiche sans squelette ni
 *  attente, rafraîchi en arrière-plan s'il est périmé. */
export function useArtist(artistId: string | undefined) {
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const { data, loading } = useCachedQuery(server && artistId ? artistQueryKey(server.id, artistId) : null, () =>
    getClientForServer(server!).getArtist(artistId!),
  );
  return { artist: data ?? null, loading };
}
