import type { PlaylistSummary } from "@resonia/api-client";
import { useCachedQuery } from "../../lib/cache/queryCache";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useServersStore } from "../../stores/serversStore";

const NO_PLAYLISTS: PlaylistSummary[] = [];

export function useHomePlaylists() {
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const key = server ? `${server.id}:playlists` : null;

  const { data, loading } = useCachedQuery(key, () => getClientForServer(server!).getPlaylists());

  return { playlists: data ?? NO_PLAYLISTS, loading };
}
