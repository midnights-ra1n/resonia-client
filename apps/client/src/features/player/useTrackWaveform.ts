import { useEffect, useState } from "react";
import { getCachedWaveform, loadWaveform, onWaveformReady, type Waveform } from "../../lib/audio/waveform/waveform";
import { usePlayerStore } from "../../stores/playerStore";

/** Forme d'onde de la piste en cours, ou `undefined` tant qu'elle n'est pas disponible (piste pas
 *  encore décodée : elle apparaît dès que le gapless l'a préparée). */
export function useTrackWaveform(trackId: string | undefined): Waveform | undefined {
  const [resolved, setResolved] = useState<{ trackId: string; waveform: Waveform } | null>(null);
  const ensureCurrentWaveform = usePlayerStore((s) => s.ensureCurrentWaveform);

  useEffect(() => {
    if (!trackId) return;
    let cancelled = false;
    const accept = (waveform: Waveform | null | undefined) => {
      if (!cancelled && waveform) setResolved({ trackId, waveform });
    };
    const unsubscribe = onWaveformReady((readyId) => {
      if (readyId === trackId) accept(getCachedWaveform(trackId));
    });
    void loadWaveform(trackId).then((waveform) => {
      if (waveform) accept(waveform);
      // Ni en mémoire ni sur disque : calculée depuis le buffer décodé s'il existe déjà.
      else if (!cancelled) ensureCurrentWaveform();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [trackId, ensureCurrentWaveform]);

  if (!trackId) return undefined;
  if (resolved?.trackId === trackId) return resolved.waveform;
  return getCachedWaveform(trackId);
}
