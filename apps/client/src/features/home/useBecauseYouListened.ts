import { useEffect, useState } from "react";
import type { AlbumSummary, ArtistSummary } from "@resonia/api-client";
import { useCachedQuery } from "../../lib/cache/queryCache";
import { getPlays } from "../../lib/stats/listeningHistory";
import { pickSeedArtist } from "../../lib/recommendations/seedArtist";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useServersStore } from "../../stores/serversStore";
import { useArtistInfo } from "../artist/useArtistInfo";

// Peu d'artistes interrogés : une requête chacun, une seule fois par heure.
const SIMILAR_USED = 5;
const ALBUMS_MAX = 20;
const STALE_MS = 60 * 60_000;

/** « Parce que vous avez écouté X » : artiste du moment (historique local), ses artistes
 *  similaires présents sur le serveur (Navidrome/Last.fm) et leurs albums, entrelacés. */
export function useBecauseYouListened() {
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const [seed, setSeed] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    setSeed(null);
    if (!server) return;
    let cancelled = false;
    getPlays(server.id)
      .then((plays) => !cancelled && setSeed(pickSeedArtist(plays)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [server]);

  const similar: ArtistSummary[] = useArtistInfo(seed?.id)?.similarArtist ?? [];
  const used = similar.slice(0, SIMILAR_USED);

  const { data: albums } = useCachedQuery<AlbumSummary[]>(
    server && seed && used.length > 0 ? `${server.id}:because:${seed.id}:${used.map((a) => a.id).join(",")}` : null,
    async () => {
      const client = getClientForServer(server!);
      const lists = await Promise.all(
        [seed!.id, ...used.map((a) => a.id)].map((id) => client.getArtist(id).then((a) => a.album ?? []).catch(() => [])),
      );
      // Un album par artiste à tour de rôle, pour varier au lieu d'aligner un seul discographie.
      const out: AlbumSummary[] = [];
      for (let i = 0; out.length < ALBUMS_MAX && lists.some((l) => i < l.length); i++) {
        for (const l of lists) if (i < l.length && out.length < ALBUMS_MAX) out.push(l[i]);
      }
      return out;
    },
    STALE_MS,
  );

  return { seed, similar, albums: albums ?? [] };
}
