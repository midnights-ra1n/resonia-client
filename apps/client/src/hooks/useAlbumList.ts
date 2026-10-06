import type { AlbumSummary } from "@resonia/api-client";
import { useCachedQuery } from "../lib/cache/queryCache";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { useServersStore } from "../stores/serversStore";

type AlbumListType = "frequent" | "recent" | "newest" | "random" | "highest";

// Référence stable : un nouveau [] à chaque rendu relancerait les useMemo des appelants.
const NO_ALBUMS: AlbumSummary[] = [];

/** Listes d'albums de l'accueil, servies par le cache mémoire (voir lib/cache/queryCache) :
 *  revenir sur l'accueil réaffiche instantanément les mêmes carrousels — y compris la
 *  sélection « random », qui ne change donc pas à chaque retour. */
export function useAlbumList(type: AlbumListType, size = 20) {
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const key = server ? `${server.id}:albumList:${type}:${size}` : null;

  const { data, loading } = useCachedQuery(key, () => getClientForServer(server!).getAlbumList2(type, size));

  return { albums: data ?? NO_ALBUMS, loading };
}
