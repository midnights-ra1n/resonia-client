import type { SilenceTrim } from "./silenceTrim";

export interface DecodedTrack {
  buffer: AudioBuffer;
  trim: SilenceTrim;
}

// 3 et non 5 : en régime établi, seules 2 entrées sont réellement nécessaires au moteur gapless
// (piste active + piste suivante déjà planifiée, voir scheduleGaplessNext dans playerStore) —
// la 3e ne sert qu'à un retour arrière immédiat sans redécoder. Un AudioBuffer stéréo 44.1kHz de
// quelques minutes pèse plusieurs dizaines de Mo de PCM non compressé en RAM : à 5 entrées, le
// pic pouvait dépasser 150-250 Mo rien que pour des pistes déjà passées et jamais réécoutées ;
// borner à 3 coupe ce pic d'environ 40% sans dégrader le confort d'usage courant (avance/lecture
// gapless), au prix d'un redécodage si l'utilisateur revient plus de deux pistes en arrière.
const MAX_ENTRIES = 3;

/** Petit cache LRU en mémoire des pistes déjà décodées + rognées, pour éviter de
 *  redécoder à un retour arrière ou une répétition rapprochée. Volontairement borné :
 *  un AudioBuffer stéréo 44.1kHz de quelques minutes pèse plusieurs dizaines de Mo de
 *  PCM non compressé en RAM. */
export class DecodedBufferCache {
  private map = new Map<string, DecodedTrack>();

  get(key: string): DecodedTrack | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    // Ré-insertion pour faire remonter l'entrée en position "plus récemment utilisée".
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  set(key: string, value: DecodedTrack) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  clear() {
    this.map.clear();
  }
}
