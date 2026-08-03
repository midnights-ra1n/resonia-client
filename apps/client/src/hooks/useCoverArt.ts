import { useEffect, useRef, useState } from "react";
import { getCachedCoverUrl, loadAndCacheCover } from "../lib/image/coverCache";

interface ResolvedCover {
  key: string;
  url: string;
}

export function useCoverArt(
  serverId: string | undefined,
  coverArtId: string | undefined,
  size: number,
  liveUrl: string | undefined,
): string | undefined {
  const [resolved, setResolved] = useState<ResolvedCover | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const cacheKey = serverId && coverArtId ? `${serverId}:${coverArtId}:${size}` : undefined;

  useEffect(() => {
    if (!serverId || !coverArtId || !liveUrl || !cacheKey) return;

    let cancelled = false;

    (async () => {
      const cached = await getCachedCoverUrl(serverId, coverArtId, size);
      if (cached) {
        if (!cancelled) {
          objectUrlRef.current = cached;
          setResolved({ key: cacheKey, url: cached });
        } else {
          URL.revokeObjectURL(cached);
        }
        return;
      }

      try {
        const fresh = await loadAndCacheCover(serverId, coverArtId, size, liveUrl);
        if (!cancelled) {
          if (fresh.startsWith("blob:")) objectUrlRef.current = fresh;
          setResolved({ key: cacheKey, url: fresh });
        } else if (fresh.startsWith("blob:")) {
          URL.revokeObjectURL(fresh);
        }
      } catch (err) {
        console.error("[coverCache] Échec du cache de pochette", err);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [serverId, coverArtId, size, liveUrl, cacheKey]);

  // Dérivé au rendu : si la clé résolue ne correspond plus (id/serveur/size a changé),
  // on retombe immédiatement sur l'URL live sans passer par un setState de "reset".
  if (resolved && resolved.key === cacheKey) {
    return resolved.url;
  }
  return liveUrl;
}