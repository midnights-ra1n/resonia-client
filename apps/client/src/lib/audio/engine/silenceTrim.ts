export interface SilenceTrim {
  start: number;
  end: number;
}

// Seuil volontairement strict (~-58 dB) : le but est de ne détecter que le silence
// numérique réel (padding de conteneur, encoder delay), jamais un passage audible mais
// calme (fade-in, ambiance) — un seuil trop permissif (ex: l'ancien -42 dB) rogne des
// intros entières et décale le début audible de la piste, perceptible surtout en lecture
// depuis le cache décodé (démarrage direct en mode buffer, sans streaming natif pour
// masquer l'écart).
const SILENCE_THRESHOLD = 0.0012;
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
