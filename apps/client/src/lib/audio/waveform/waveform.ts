import { createBlobStore } from "../../storage/blobStore";

/** Forme d'onde « vue d'ensemble » façon logiciel DJ : par colonne, l'amplitude crête de trois
 *  bandes de fréquences (graves, médiums, aigus), quantifiée sur 0-255. Calculée une seule fois
 *  par piste depuis l'AudioBuffer déjà décodé pour l'enchaînement gapless (aucun décodage en plus),
 *  puis gardée en mémoire et sur disque : ~1,5 Ko par piste. */
export interface Waveform {
  bins: number;
  low: Uint8Array;
  mid: Uint8Array;
  high: Uint8Array;
}

// Colonnes calculées : assez pour une barre de lecture large en HiDPI, assez peu pour rester
// minuscule sur disque. Le rendu regroupe/étire selon la largeur réelle (voir WaveformBar).
const BINS = 480;
// Format sur disque : [version, bins (2 octets), low…, mid…, high…]. Changer la version
// invalide les formes d'onde déjà en cache (recalculées au prochain décodage).
const FORMAT_VERSION = 1;
const HEADER_BYTES = 3;
// Fréquences de coupure des filtres passe-bas à un pôle séparant les bandes.
const LOW_CUTOFF_HZ = 200;
const HIGH_CUTOFF_HZ = 2500;
// Échantillons traités avant de rendre la main au thread principal : un calcul d'une traite
// (~10 M d'échantillons pour 4 min en stéréo) monopoliserait l'interface plusieurs dizaines de ms.
const SAMPLES_PER_SLICE = 400_000;
const MAX_MEMORY_ENTRIES = 30;

const blobStore = createBlobStore("resonia-waveforms");
const memory = new Map<string, Waveform>();
const pending = new Map<string, Promise<Waveform | null>>();
// Un seul calcul par piste à la fois (piste suivante préparée puis devenue active, par exemple).
const computing = new Map<string, Promise<void>>();
const listeners = new Set<(trackId: string) => void>();

function remember(trackId: string, waveform: Waveform) {
  memory.delete(trackId);
  memory.set(trackId, waveform);
  while (memory.size > MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value as string);
  listeners.forEach((cb) => cb(trackId));
}

function encode(w: Waveform): Uint8Array {
  const out = new Uint8Array(HEADER_BYTES + w.bins * 3);
  out[0] = FORMAT_VERSION;
  out[1] = w.bins >> 8;
  out[2] = w.bins & 0xff;
  out.set(w.low, HEADER_BYTES);
  out.set(w.mid, HEADER_BYTES + w.bins);
  out.set(w.high, HEADER_BYTES + w.bins * 2);
  return out;
}

function decode(bytes: Uint8Array): Waveform | null {
  if (bytes.byteLength < HEADER_BYTES || bytes[0] !== FORMAT_VERSION) return null;
  const bins = (bytes[1] << 8) | bytes[2];
  if (bins === 0 || bytes.byteLength !== HEADER_BYTES + bins * 3) return null;
  return {
    bins,
    low: bytes.slice(HEADER_BYTES, HEADER_BYTES + bins),
    mid: bytes.slice(HEADER_BYTES + bins, HEADER_BYTES + bins * 2),
    high: bytes.slice(HEADER_BYTES + bins * 2),
  };
}

/** Rend la main au thread principal entre deux tranches. Par MessageChannel plutôt que
 *  `setTimeout(0)` : les navigateurs ralentissent les timers d'un onglet en arrière-plan (jusqu'à
 *  1 s chacun), ce qui étirait le calcul sur une trentaine de secondes. */
function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/** Crêtes par bande, en une passe : deux passe-bas à un pôle séparent graves (< LOW_CUTOFF_HZ),
 *  médiums et aigus (> HIGH_CUTOFF_HZ) sur le signal mono. Pas de FFT : quelques opérations par
 *  échantillon suffisent pour une vue d'ensemble. */
async function compute(buffer: AudioBuffer): Promise<Waveform> {
  const length = buffer.length;
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const alphaLow = 1 - Math.exp((-2 * Math.PI * LOW_CUTOFF_HZ) / buffer.sampleRate);
  const alphaHigh = 1 - Math.exp((-2 * Math.PI * HIGH_CUTOFF_HZ) / buffer.sampleRate);

  const low = new Float32Array(BINS);
  const mid = new Float32Array(BINS);
  const high = new Float32Array(BINS);
  const samplesPerBin = length / BINS;
  let lpLow = 0;
  let lpHigh = 0;

  for (let start = 0; start < length; start += SAMPLES_PER_SLICE) {
    const end = Math.min(length, start + SAMPLES_PER_SLICE);
    for (let i = start; i < end; i++) {
      const x = (left[i] + right[i]) * 0.5;
      lpLow += alphaLow * (x - lpLow);
      lpHigh += alphaHigh * (x - lpHigh);
      const bin = Math.min(BINS - 1, (i / samplesPerBin) | 0);
      const l = Math.abs(lpLow);
      const m = Math.abs(lpHigh - lpLow);
      const h = Math.abs(x - lpHigh);
      if (l > low[bin]) low[bin] = l;
      if (m > mid[bin]) mid[bin] = m;
      if (h > high[bin]) high[bin] = h;
    }
    if (end < length) await yieldToMainThread();
  }

  // Normalisation commune aux trois bandes (leurs proportions restent lisibles), sur la crête
  // globale de la piste : une piste calme n'apparaît pas écrasée.
  let peak = 0;
  for (let i = 0; i < BINS; i++) peak = Math.max(peak, low[i], mid[i], high[i]);
  const scale = peak > 0 ? 255 / peak : 0;
  const quantize = (values: Float32Array) => Uint8Array.from(values, (v) => Math.min(255, Math.round(v * scale)));
  return { bins: BINS, low: quantize(low), mid: quantize(mid), high: quantize(high) };
}

async function readFromDisk(trackId: string): Promise<Waveform | null> {
  try {
    const bytes = await blobStore.readAll(trackId);
    return bytes ? decode(new Uint8Array(bytes)) : null;
  } catch {
    return null;
  }
}

async function writeToDisk(trackId: string, waveform: Waveform): Promise<void> {
  const bytes = encode(waveform);
  const writer = await blobStore.createWriter(trackId);
  try {
    await writer.seek(0);
    await writer.write(bytes.buffer as ArrayBuffer);
  } finally {
    await writer.close();
  }
}

/** Forme d'onde déjà connue en mémoire (synchrone, pour le premier rendu). */
export function getCachedWaveform(trackId: string): Waveform | undefined {
  return memory.get(trackId);
}

/** Charge la forme d'onde depuis le disque si elle y est, sans rien calculer. */
export function loadWaveform(trackId: string): Promise<Waveform | null> {
  const known = memory.get(trackId);
  if (known) return Promise.resolve(known);
  let task = pending.get(trackId);
  if (!task) {
    task = readFromDisk(trackId).then((waveform) => {
      if (waveform) remember(trackId, waveform);
      return waveform;
    });
    task.finally(() => pending.delete(trackId));
    pending.set(trackId, task);
  }
  return task;
}

/** Garantit la forme d'onde d'une piste décodée : disque d'abord, sinon calcul puis écriture. */
export function ensureWaveform(trackId: string, buffer: AudioBuffer): Promise<void> {
  let task = computing.get(trackId);
  if (!task) {
    task = (async () => {
      if (await loadWaveform(trackId)) return;
      try {
        const waveform = await compute(buffer);
        remember(trackId, waveform);
        await writeToDisk(trackId, waveform);
      } catch (err) {
        console.warn("[waveform] Calcul ou écriture impossible", err);
      }
    })().finally(() => computing.delete(trackId));
    computing.set(trackId, task);
  }
  return task;
}

/** Prévenu dès qu'une forme d'onde devient disponible (calculée ou relue). */
export function onWaveformReady(cb: (trackId: string) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
