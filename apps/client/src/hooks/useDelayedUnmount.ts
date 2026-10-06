import { useEffect, useState } from "react";

/** Garde un élément monté `delayMs` après qu'il doit disparaître, le temps de son animation de
 *  sortie (ex : panneau qui se replie). Monté de nouveau immédiatement s'il réapparaît. */
export function useDelayedUnmount(show: boolean, delayMs: number): boolean {
  const [mounted, setMounted] = useState(show);
  if (show && !mounted) setMounted(true);

  useEffect(() => {
    if (show || !mounted) return;
    const timer = window.setTimeout(() => setMounted(false), delayMs);
    return () => window.clearTimeout(timer);
  }, [show, mounted, delayMs]);

  return mounted;
}
