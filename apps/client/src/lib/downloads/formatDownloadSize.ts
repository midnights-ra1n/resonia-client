/** Formatte une taille en octets en Ko/Mo (unités localisées passées en paramètre) — sous 1
 *  Mo on affiche en Ko (0 décimale, la précision de l'octet n'a pas d'intérêt à l'affichage),
 *  au-delà en Mo (1 décimale). Utilisé aussi bien pour une taille (bytesDownloaded/totalBytes)
 *  que pour un débit (l'appelant ajoute lui-même le suffixe "/s"). */
export function formatDownloadSize(bytes: number, unitKb: string, unitMb: string): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} ${unitMb}`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} ${unitKb}`;
}
