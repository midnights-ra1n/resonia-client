import { useEffect, useState } from "react";
import { downloadStore } from "./downloadStore";

/** Ids des pistes (parmi `trackIds`) déjà téléchargées — à n'importe quelle qualité, voir
 *  `downloadStore.hasAnyEntry`. Une seule requête groupée par changement plutôt qu'un
 *  abonnement par ligne de piste : plus léger sur un album/une playlist de plusieurs
 *  centaines de titres. */
export function useDownloadedTrackIds(trackIds: string[]): Set<string> {
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (trackIds.length === 0) {
        if (!cancelled) setDownloadedIds(new Set());
        return;
      }
      const flags = await Promise.all(trackIds.map((id) => downloadStore.hasAnyEntry(id)));
      if (cancelled) return;
      setDownloadedIds(new Set(trackIds.filter((_, i) => flags[i])));
    }

    refresh();
    const unsubQueue = downloadStore.onQueueChange(refresh);
    const unsubSize = downloadStore.onSizeChange(refresh);
    return () => {
      cancelled = true;
      unsubQueue();
      unsubSize();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIds.join(",")]);

  return downloadedIds;
}
