export interface CacheProgress {
  bytesCached: number;
  /** Taille totale du fichier, ≤ 0 si inconnue (flux transcodé à la volée). */
  totalBytes: number;
  complete: boolean;
}

/** Position (secondes de piste) jusqu'où la piste est chargée : le plus avancé entre le tampon du
 *  lecteur (`playerBufferedEnd`) et le téléchargement en cache.
 *
 *  Pour un fichier de taille connue, la part téléchargée se convertit directement en durée. Pour
 *  un flux transcodé (taille inconnue), elle se déduit du débit d'encodage (`bitrateKbps`) —
 *  plafonnée sous la fin tant que le téléchargement n'est pas complet, le débit réel d'un
 *  encodage VBR s'écartant un peu de la cible. */
export function estimateBufferedTime(
  playerBufferedEnd: number,
  progress: CacheProgress | null,
  duration: number,
  bitrateKbps: number,
): number {
  if (duration <= 0) return 0;
  let buffered = playerBufferedEnd;
  if (progress) {
    const { bytesCached, totalBytes, complete } = progress;
    if (complete) buffered = duration;
    else if (totalBytes > 0) buffered = Math.max(buffered, (bytesCached / totalBytes) * duration);
    else if (bitrateKbps > 0) {
      buffered = Math.max(buffered, Math.min(duration * 0.98, (bytesCached * 8) / (bitrateKbps * 1000)));
    }
  }
  return Math.min(duration, Math.max(0, buffered));
}
