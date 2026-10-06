import { useEffect, useState } from "react";
import type { AlbumWithSongsDTO } from "@resonia/api-client";
import { useServersStore, type StoredServer } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";

// Cache mémoire des albums déjà chargés (ou en cours de chargement) : une page album déjà vue,
// ou préchargée au survol de sa carte (voir prefetchAlbum), s'affiche INSTANTANÉMENT, sans
// passer par un état de chargement. Borné (LRU simple) pour ne pas grossir indéfiniment.
const MAX_CACHED_ALBUMS = 60;
const albumCache = new Map<string, Promise<AlbumWithSongsDTO>>();
const resolvedAlbums = new Map<string, AlbumWithSongsDTO>();

function cacheKey(serverId: string, albumId: string) {
  return `${serverId}:${albumId}`;
}

function fetchAlbum(server: StoredServer, albumId: string): Promise<AlbumWithSongsDTO> {
  const key = cacheKey(server.id, albumId);
  const existing = albumCache.get(key);
  if (existing) {
    // LRU : réinsère en fin de Map (ordre d'insertion = ordre d'usage).
    albumCache.delete(key);
    albumCache.set(key, existing);
    return existing;
  }

  const promise = getClientForServer(server).getAlbum(albumId);
  albumCache.set(key, promise);
  promise.then(
    (album) => resolvedAlbums.set(key, album),
    // Un échec ne doit pas rester en cache : la prochaine visite réessaie.
    () => albumCache.delete(key),
  );

  while (albumCache.size > MAX_CACHED_ALBUMS) {
    const oldest = albumCache.keys().next().value as string;
    albumCache.delete(oldest);
    resolvedAlbums.delete(oldest);
  }
  return promise;
}

/** Précharge un album (survol d'une carte) : la page s'ouvrira sans délai au clic. */
export function prefetchAlbum(albumId: string) {
  const { servers, activeServerId } = useServersStore.getState();
  const server = servers.find((s) => s.id === activeServerId);
  if (server) fetchAlbum(server, albumId).catch(() => {});
}

interface LoadedAlbum {
  key: string;
  album: AlbumWithSongsDTO | null;
  error: string | null;
}

export function useAlbum(albumId: string | undefined) {
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const server = servers.find((s) => s.id === activeServerId);
  const key = server && albumId ? cacheKey(server.id, albumId) : null;

  const [loaded, setLoaded] = useState<LoadedAlbum | null>(null);

  useEffect(() => {
    if (!server || !albumId || !key) return;
    let cancelled = false;
    fetchAlbum(server, albumId)
      .then((album) => {
        if (!cancelled) setLoaded({ key, album, error: null });
      })
      .catch((err) => {
        console.error("[album] Échec du chargement", err);
        if (!cancelled) setLoaded({ key, album: null, error: "Impossible de charger cet album" });
      });
    return () => {
      cancelled = true;
    };
  }, [server, albumId, key]);

  // Dérivé au rendu : données déjà en mémoire → affichées dès le premier rendu.
  const current = loaded && loaded.key === key ? loaded : null;
  const album = current?.album ?? (key ? (resolvedAlbums.get(key) ?? null) : null);
  const error = current?.error ?? null;
  const loading = !!key && !album && !error;

  return { album, loading, error };
}

const HOVER_PREFETCH_DELAY_MS = 120;

/** Props à poser sur une carte/ligne d'album : précharge l'album si le pointeur s'y attarde
 *  (120 ms — un simple passage de la souris au-dessus d'un carrousel ne lance rien), pour que
 *  la page s'ouvre sans état de chargement au clic. */
const hoverTimers = new Map<string, number>();

export function albumPrefetchProps(albumId: string) {
  return {
    onPointerEnter: () => {
      window.clearTimeout(hoverTimers.get(albumId));
      hoverTimers.set(
        albumId,
        window.setTimeout(() => {
          hoverTimers.delete(albumId);
          prefetchAlbum(albumId);
        }, HOVER_PREFETCH_DELAY_MS),
      );
    },
    onPointerLeave: () => {
      window.clearTimeout(hoverTimers.get(albumId));
      hoverTimers.delete(albumId);
    },
  };
}
