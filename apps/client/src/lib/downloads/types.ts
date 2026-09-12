import type { Track } from "../../stores/playerStore";

export type DownloadStatus = "not-downloaded" | "queued" | "downloading" | "downloaded" | "error";

export interface DownloadedTrackMeta {
  key: string; // `${trackId}:${qualityId}`
  trackId: string;
  qualityId: string;
  format: "aac" | "mp3" | "opus";
  totalBytes: number; // -1 tant qu'inconnu
  bytesDownloaded: number;
  complete: boolean;
  downloadedAt: number;
  // Métadonnées dénormalisées : la page Téléchargements et les garde-fous hors-ligne
  // doivent pouvoir lister/afficher les pistes sans jamais appeler l'API Navidrome.
  track: Track;
}

export function downloadKeyFor(trackId: string, qualityId: string): string {
  return `${trackId}:${qualityId}`;
}
