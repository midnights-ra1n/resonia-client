import { getClientForServer } from "../subsonic/getClientForServer";
import { getQualityById } from "../audio/qualityOptions";
import { useServersStore } from "../../stores/serversStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { Track } from "../../stores/playerStore";
import type { DownloadedTrackMeta } from "./types";

export interface DownloadSource {
  streamUrl: string;
  qualityId: string;
  format: DownloadedTrackMeta["format"];
}

/** Résout l'URL de flux à utiliser pour télécharger une piste, à la qualité audio
 *  actuellement configurée dans les paramètres — même logique que la résolution de lecture
 *  (`resolvePlayableTrack` dans `playerStore.ts`), dupliquée ici volontairement : les
 *  téléchargements ne doivent pas dépendre de l'état interne du lecteur. "raw" (lossless)
 *  n'étant pas supporté par la résolution de flux, il ne l'est pas non plus ici. */
export function resolveDownloadSource(track: Track): DownloadSource | null {
  const { servers, activeServerId } = useServersStore.getState();
  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;
  if (!client) return null;

  const quality = getQualityById(useSettingsStore.getState().audioQualityId);
  if (!quality || quality.format === "raw") return null;

  const streamUrl = client.getStreamUrl(track.id, { format: quality.format, maxBitRate: quality.maxBitRate });
  return { streamUrl, qualityId: quality.id, format: quality.format };
}
