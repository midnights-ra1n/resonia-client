import type { LyricsLine } from "./lyricsService";

/** `[mm:ss.xx]` ou `[mm:ss.xxx]` — LRCLIB comme la plupart des fichiers .lrc utilisent 2 ou 3
 *  décimales selon la source. Une ligne peut porter plusieurs tags (répétition d'un refrain à
 *  plusieurs instants) : `g` + parcours manuel plutôt qu'un simple `match`. */
const TAG_PATTERN = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\]/g;

/** Parse un texte LRC standard (tel que renvoyé par `syncedLyrics` de LRCLIB) en lignes
 *  triées par instant — ignore les tags de métadonnées (`[ar:]`, `[ti:]`, `[by:]`, `[offset:]`,
 *  ...) qui ne contiennent aucun tag temporel exploitable. */
export function parseLrcText(text: string): LyricsLine[] {
  const lines: LyricsLine[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const tags = [...rawLine.matchAll(TAG_PATTERN)];
    if (tags.length === 0) continue;

    const value = rawLine.slice(tags[tags.length - 1].index! + tags[tags.length - 1][0].length).trim();

    for (const tag of tags) {
      const minutes = Number(tag[1]);
      const seconds = Number(tag[2]);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) continue;
      lines.push({ time: minutes * 60 + seconds, text: value });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}
