export interface CacheProgress {
  bytesCached: number;
  /** Taille totale du fichier, ≤ 0 si inconnue (flux transcodé à la volée). */
  totalBytes: number;
  complete: boolean;
}

/** Plage de piste [début, fin] en secondes. */
export type TimeRange = [start: number, end: number];

/** Trie et fusionne les plages qui se chevauchent ou ne sont séparées que de `gap` secondes ;
 *  les plages vides disparaissent. */
export function mergeRanges(ranges: readonly TimeRange[], gap = 0.25): TimeRange[] {
  const sorted = ranges.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out: TimeRange[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1] + gap) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Position jusqu'où le téléchargement en cache (toujours un préfixe contigu depuis 0) couvre la
 *  piste. Pour un fichier de taille connue, la part téléchargée se convertit directement en durée.
 *  Pour un flux transcodé (taille inconnue), elle se déduit du débit d'encodage (`bitrateKbps`) —
 *  plafonnée sous la fin tant que le téléchargement n'est pas complet, le débit réel d'un
 *  encodage VBR s'écartant un peu de la cible. */
function cachedEnd(progress: CacheProgress, duration: number, bitrateKbps: number): number {
  const { bytesCached, totalBytes, complete } = progress;
  if (complete) return duration;
  if (totalBytes > 0) return (bytesCached / totalBytes) * duration;
  if (bitrateKbps > 0) return Math.min(duration * 0.98, (bytesCached * 8) / (bitrateKbps * 1000));
  return 0;
}

/** Plages de la piste déjà chargées : union du tampon du lecteur (`playerRanges`, plusieurs
 *  plages après un seek natif) et du téléchargement en cache, bornée à la durée. */
export function estimateBufferedRanges(
  playerRanges: readonly TimeRange[],
  progress: CacheProgress | null,
  duration: number,
  bitrateKbps: number,
): TimeRange[] {
  if (duration <= 0) return [];
  const ranges: TimeRange[] = playerRanges.map(([s, e]) => [Math.max(0, s), Math.min(duration, e)]);
  if (progress) ranges.push([0, Math.min(duration, cachedEnd(progress, duration, bitrateKbps))]);
  return mergeRanges(ranges);
}

/** Deux listes de plages identiques à `epsilon` secondes près — évite de re-rendre la barre pour
 *  un tampon qui n'a pas visiblement bougé. */
export function sameRanges(a: readonly TimeRange[], b: readonly TimeRange[], epsilon = 0.05): boolean {
  return (
    a.length === b.length &&
    a.every(([s, e], i) => Math.abs(s - b[i][0]) < epsilon && Math.abs(e - b[i][1]) < epsilon)
  );
}
