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

// Creux de bord (voir `edgeDropoutSamples`) : fenêtres de 3 ms (assez longues pour ne pas confondre
// un passage par zéro d'une basse avec un creux), 21 ms retirées au plus, niveau de référence
// mesuré sur les 45 ms suivantes, seuil à 1/32 de la puissance (-15 dB).
const DROPOUT_WINDOW_SECONDS = 0.003;
const DROPOUT_MAX_SECONDS = 0.021;
const DROPOUT_REFERENCE_SECONDS = 0.045;
const DROPOUT_RELATIVE_POWER = 1 / 32;

function meanPower(channel: Float32Array, from: number, count: number): number {
  let sum = 0;
  for (let i = from; i < from + count; i++) sum += channel[i] * channel[i];
  return sum / count;
}

/** Creux de bord : la première / dernière fenêtre d'un fichier AAC décodé seul est souvent mal
 *  reconstruite (pas de fenêtre voisine pour le recouvrement) et retombe de 20-30 dB sur quelques
 *  ms — une micro-coupure audible au raccord gapless alors que le raccord lui-même est exact. Les
 *  fenêtres de 3 ms qui restent sous 1/32 de la puissance de la musique voisine (jusqu'à 21 ms)
 *  sont retirées. Ne touche jamais une piste qui n'a pas de creux : une musique régulière ne passe
 *  jamais sous son propre niveau.
 *  `from` : premier échantillon utile ; `to` : dernier (exclu). Renvoie les échantillons à retirer. */
function edgeDropoutSamples(channel: Float32Array, from: number, to: number, sampleRate: number): { head: number; tail: number } {
  const w = Math.max(1, Math.round(sampleRate * DROPOUT_WINDOW_SECONDS));
  const maxCut = Math.round(sampleRate * DROPOUT_MAX_SECONDS);
  const ref = Math.round(sampleRate * DROPOUT_REFERENCE_SECONDS);
  if (to - from <= 2 * (maxCut + ref)) return { head: 0, tail: 0 };

  const headLimit = meanPower(channel, from + maxCut, ref) * DROPOUT_RELATIVE_POWER;
  let head = 0;
  while (head < maxCut && meanPower(channel, from + head, w) < headLimit) head += w;

  const tailLimit = meanPower(channel, to - maxCut - ref, ref) * DROPOUT_RELATIVE_POWER;
  let tail = 0;
  while (tail < maxCut && meanPower(channel, to - tail - w, w) < tailLimit) tail += w;

  return { head, tail };
}

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

  const dropout = edgeDropoutSamples(channel, startSample, channel.length - trimmedFromEnd, sampleRate);
  return { start: (startSample + dropout.head) / sampleRate, end: (trimmedFromEnd + dropout.tail) / sampleRate };
}

export function logicalDuration(buffer: AudioBuffer, trim: SilenceTrim): number {
  return Math.max(buffer.duration - trim.start - trim.end, 0);
}
