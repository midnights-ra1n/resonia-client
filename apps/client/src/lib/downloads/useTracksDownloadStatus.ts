import { useEffect, useState } from "react";
import { downloadStore } from "./downloadStore";

export type AggregateDownloadStatus = "none" | "partial" | "downloading" | "complete";

/** Statut agrégé du téléchargement d'un ensemble de pistes (album/playlist) — utilisé pour
 *  l'icône du bouton "Télécharger" dans les en-têtes de page. Se rafraîchit sur toute
 *  activité de la file de téléchargement (une piste de l'ensemble peut être touchée par un
 *  téléchargement démarré ailleurs, ex. menu contextuel). Ne prend que les ids : pas besoin
 *  des métadonnées complètes pour vérifier un statut. */
export function useTracksDownloadStatus(tracks: Array<{ id: string }>, qualityId: string | null): AggregateDownloadStatus {
  const [status, setStatus] = useState<AggregateDownloadStatus>("none");

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (!qualityId || tracks.length === 0) {
        if (!cancelled) setStatus("none");
        return;
      }
      const statuses = await Promise.all(tracks.map((t) => downloadStore.getStatus(t.id, qualityId)));
      if (cancelled) return;
      if (statuses.some((s) => s === "downloading" || s === "queued")) {
        setStatus("downloading");
      } else if (statuses.every((s) => s === "downloaded")) {
        setStatus("complete");
      } else if (statuses.some((s) => s === "downloaded")) {
        setStatus("partial");
      } else {
        setStatus("none");
      }
    }

    refresh();
    const unsubscribe = downloadStore.onQueueChange(refresh);
    const unsubscribeSize = downloadStore.onSizeChange(refresh);
    // En plus des événements globaux ci-dessus, s'abonne directement au statut de chaque
    // piste : c'est ce qui garantit une mise à jour immédiate à la complétion (ou l'échec)
    // d'une piste précise, sans dépendre du throttle de `onSizeChange`.
    const unsubscribeTracks = qualityId
      ? tracks.map((t) => downloadStore.onStatusChange(t.id, qualityId, refresh))
      : [];
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeSize();
      unsubscribeTracks.forEach((unsub) => unsub());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks.map((t) => t.id).join(","), qualityId]);

  return status;
}
