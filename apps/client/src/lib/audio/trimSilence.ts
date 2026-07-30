export interface SilenceTrim {
  start: number; // secondes
  end: number;   // secondes
}

const SILENCE_THRESHOLD = 0.01; // amplitude linéaire (~ -40 dB) : en dessous = silence
const MAX_TRIM_SECONDS = 0.5;   // sécurité : jamais plus de 500ms rognées de chaque côté

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

  return {
    start: startSample / sampleRate,
    end: trimmedFromEnd / sampleRate,
  };
}
