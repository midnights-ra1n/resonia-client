import { useEffect, useState } from "react";
import { getCachedDominantColor, prefetchDominantColor } from "../lib/image/dominantColorCache";

interface Resolved {
  key: string;
  color: string | null;
}

function keyFor(serverId: string | undefined, coverArtId: string | undefined): string | undefined {
  return serverId && coverArtId ? `${serverId}:${coverArtId}` : undefined;
}

/** Couleur dominante d'une pochette, sauvegardée en mémoire ET sur disque par
 *  `dominantColorCache` (contrairement à `useDominantColor`, mise en cache par URL — inutile
 *  ici car cette URL peut être un blob: éphémère recréé à chaque montage). Résout
 *  immédiatement si déjà préchargée (voir `prefetchTrackCover` dans playerStore), sinon lance
 *  l'extraction. */
export function useCachedDominantColor(
  serverId: string | undefined,
  coverArtId: string | undefined,
  imageUrl: string | undefined,
): string | null {
  const key = keyFor(serverId, coverArtId);

  const [resolved, setResolved] = useState<Resolved | undefined>(() => {
    if (!key || !serverId || !coverArtId) return undefined;
    const cached = getCachedDominantColor(serverId, coverArtId);
    return cached !== undefined ? { key, color: cached } : undefined;
  });

  useEffect(() => {
    if (!key || !serverId || !coverArtId || !imageUrl) return;

    let cancelled = false;
    const cached = getCachedDominantColor(serverId, coverArtId);
    if (cached !== undefined) {
      // Microtâche plutôt qu'un `setState` synchrone en tête d'effet (voir useDominantColor,
      // même contrainte) : évite l'avertissement "setState in effect" sans rien changer au
      // comportement perçu (résolution toujours au tour suivant, imperceptible).
      Promise.resolve().then(() => {
        if (!cancelled) setResolved({ key, color: cached });
      });
      return () => {
        cancelled = true;
      };
    }

    prefetchDominantColor(serverId, coverArtId, imageUrl).then(() => {
      if (cancelled) return;
      setResolved({ key, color: getCachedDominantColor(serverId, coverArtId) ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [key, serverId, coverArtId, imageUrl]);

  return resolved && resolved.key === key ? resolved.color : null;
}
