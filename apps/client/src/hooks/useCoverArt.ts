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
        // Repli terminal uniquement en cas d'échec réel du cache : voir le commentaire sur le
        // rendu plus bas pour la raison de ne JAMAIS exposer `liveUrl` pendant que la
        // résolution est encore en cours.
        if (!cancelled) setResolved({ key: cacheKey, url: liveUrl });
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

  // Dérivé au rendu : tant que rien n'est résolu pour cette clé (cache pas encore lu, ou
  // téléchargement+mise en cache encore en vol), on renvoie `undefined` plutôt que `liveUrl` —
  // les appelants affichent un placeholder dans cet intervalle. Exposer `liveUrl` ici
  // déclencherait un chargement réseau direct via `<img src>` EN PARALLÈLE de celui fait par
  // `loadAndCacheCover` ci-dessus (même image, deux téléchargements), puis un remplacement du
  // `src` une fois le cache prêt — un clignotement visible sur chaque pochette une fois
  // "affichée" (second décodage qui repeint l'image par-dessus la précédente), en plus de la
  // bande passante gaspillée. `resolved.url` n'est posé qu'une seule fois par clé (voir
  // l'effet ci-dessus, `liveUrl` y compris comme repli terminal en cas d'échec), donc `<img
  // src>` ne change plus jamais après son tout premier paint.
  if (resolved && resolved.key === cacheKey) {
    return resolved.url;
  }
  return undefined;
}