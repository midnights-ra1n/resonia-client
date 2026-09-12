import { cacheStore } from "../audio/cache/cacheStore";
import { downloadStore } from "./downloadStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { Track } from "../../stores/playerStore";

/** Une piste est jouable hors-ligne si elle est téléchargée (n'importe quelle qualité) ou
 *  déjà présente dans le cache LRU à la qualité active — utilisé pour griser les pistes
 *  non disponibles localement dans les listes/la file quand le réseau est coupé. */
export async function isPlayableOffline(track: Track): Promise<boolean> {
  if (await downloadStore.hasAnyEntry(track.id)) return true;
  const qualityId = useSettingsStore.getState().audioQualityId;
  return cacheStore.isFullyCached(track.id, qualityId);
}
