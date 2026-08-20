export interface SilenceTrim {
  start: number;
  end: number;
}

const SILENCE_THRESHOLD = 0.008;
const MAX_TRIM_SECONDS = 0.3;

/** Détecte le silence strict en bord de piste (début/fin), pour éliminer le padding de
 *  conteneur (ex: AAC) sans jamais rogner du contenu audible : ne s'arrête que sur un
 *  échantillon dont l'amplitude dépasse le seuil, jamais sur une simple moyenne/RMS
 *  glissante qui pourrait confondre un passage calme mais réel avec du silence. */
export function detectEdgeSilence(buffer: AudioBuffer): SilenceTrim {
  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const maxTrimSamples = Math.floor(MAX_TRIM_SECONDS * sampleRate);

  let startSample = 0;
  while (startSample < maxTrimSamples && startSample < channel.length) {
    if (Math.abs(channel[startSample]) > SILENCE_THRESHOLD) break;
    startSample++;
  }

  let trimmedFromEnd = 0;
  let endSample = channel.length - 1;
  while (trimmedFromEnd < maxTrimSamples && endSample > 0) {
    if (Math.abs(channel[endSample]) > SILENCE_THRESHOLD) break;
    endSample--;
    trimmedFromEnd++;
  }

  return { start: startSample / sampleRate, end: trimmedFromEnd / sampleRate };
}

export function logicalDuration(buffer: AudioBuffer, trim: SilenceTrim): number {
  return Math.max(buffer.duration - trim.start - trim.end, 0);
}
