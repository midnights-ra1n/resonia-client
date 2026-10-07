import type { AlbumSummary } from "@resonia/api-client";

export type ReleaseCategory = "album" | "single" | "compilation";

/** Classe une parution selon les tags MusicBrainz exposés par OpenSubsonic (`releaseTypes`). Sans
 *  ces tags (serveur Subsonic classique, fichiers non tagués), tout reste dans « Albums ». */
export function releaseCategory(album: AlbumSummary): ReleaseCategory {
  const types = (album.releaseTypes ?? []).map((type) => type.toLowerCase());
  if (album.isCompilation || types.includes("compilation")) return "compilation";
  if (types.includes("single") || types.includes("ep")) return "single";
  return "album";
}

/** Plus récentes d'abord, comme la discographie Spotify. */
export function sortByYearDesc(albums: AlbumSummary[]): AlbumSummary[] {
  return [...albums].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}
