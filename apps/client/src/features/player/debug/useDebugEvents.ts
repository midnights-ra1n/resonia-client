import { useEffect, useState } from "react";
import {
  getDebugEntries,
  onDebugEntry,
  onDebugReset,
  type DebugCategory,
  type DebugLogEntry,
} from "../../../lib/audio/debug/audioDebugLogger";

const MAX_DISPLAYED = 80;

/** Historique (borné) des événements d'une catégorie donnée, mis à jour en direct — pour
 *  n'importe quel composant du panneau développeur. Ne s'abonne que pendant que le panneau
 *  est monté (voir DebugPanel : rien de tout ça ne tourne pour un utilisateur normal). */
export function useDebugEvents(category: DebugCategory): DebugLogEntry[] {
  const [entries, setEntries] = useState<DebugLogEntry[]>(() =>
    getDebugEntries()
      .filter((e) => e.category === category)
      .slice(-MAX_DISPLAYED),
  );
  useEffect(() => {
    const unsubscribeEntry = onDebugEntry((entry) => {
      if (entry.category !== category) return;
      setEntries((prev) => {
        const next = [...prev, entry];
        if (next.length > MAX_DISPLAYED) next.shift();
        return next;
      });
    });
    const unsubscribeReset = onDebugReset(() => setEntries([]));
    return () => {
      unsubscribeEntry();
      unsubscribeReset();
    };
  }, [category]);

  return entries;
}
