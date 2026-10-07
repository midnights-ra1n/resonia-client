import { useMemo } from "react";
import type { PlaylistSummary } from "@resonia/api-client";
import { useCachedQuery } from "../lib/cache/queryCache";
import { emitPlaylistsChanged } from "../lib/playlists/playlistEvents";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { useServersStore } from "../stores/serversStore";

export interface PlaylistItem {
  id: string;
  name: string;
  songCount: number;
  coverArt?: string;
  /** Identifiant Subsonic de la pochette (distinct de `coverArt`, déjà résolue en URL) :
   *  nécessaire pour clé de cache indépendante de l'URL (jeton d'auth, host…). */
  coverArtId?: string;
  lastPlayedTrackIds?: Set<string>;
}

const NO_PLAYLISTS: PlaylistSummary[] = [];

/** Playlists de la barre latérale et du sous-menu « Ajouter à une playlist ». Même entrée de cache
 *  que l'accueil (voir useHomePlaylists, clé `<serveur>:playlists`) : une seule requête pour les
 *  deux, et des données persistées d'un lancement à l'autre (voir lib/cache/queryCache) — la
 *  barre latérale est remplie dès le premier rendu. */
export function usePlaylists() {
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const key = server ? `${server.id}:playlists` : null;

  const { data, loading } = useCachedQuery(key, () => getClientForServer(server!).getPlaylists());
  const summaries = data ?? NO_PLAYLISTS;

  // URL de pochette dérivée à l'affichage (jamais persistée : elle contient le jeton d'auth).
  const playlists = useMemo<PlaylistItem[]>(() => {
    if (!server) return [];
    const client = getClientForServer(server);
    return summaries.map((p) => ({
      id: p.id,
      name: p.name,
      songCount: p.songCount,
      coverArt: p.coverArt ? client.getCoverArtUrl(p.coverArt, 80) : undefined,
      coverArtId: p.coverArt,
    }));
  }, [server, summaries]);

  return { playlists, loading, error: null, refreshPlaylists: emitPlaylistsChanged };
}
