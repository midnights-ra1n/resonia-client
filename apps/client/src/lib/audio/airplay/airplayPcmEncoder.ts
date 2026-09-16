// Rééchantillonnage + encodage PCM pour le tap AirPlay — tourne sur le thread PRINCIPAL
// (jamais sur le thread audio, voir airplayTapProcessor.worklet.js et
// GaplessEngine.attachAirplayTap) : reçoit des lots Float32 stéréo bruts au sample rate du
// AudioContext (souvent 48kHz), les convertit vers ce que `@lox-audioserver/node-airplay-sender`
// exige (PCM 16 bits little-endian, stéréo entrelacé, 44.1kHz pile), et regroupe la sortie en
// chunks d'environ 100ms avant de les remettre à l'appelant (IPC vers le process principal,
// voir stores/playerStore.ts).
//
// Interpolation linéaire, pas un vrai ré-échantillonneur (sinc/polyphase) : suffisant pour une
// preuve de concept — AirPlay lui-même recompresse en ALAC (avec ou sans perte selon le mode),
// donc la perte de qualité introduite ici reste marginale en pratique. À reconsidérer si cette
// preuve de concept est validée et qu'on investit dans un vrai support AirPlay.

const TARGET_SAMPLE_RATE = 44100;
const OUTPUT_CHUNK_FRAMES = 4410; // ~100ms à 44.1kHz — assez petit pour rester "temps réel"

function clampToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

export class AirplayPcmEncoder {
  private onChunk: (chunk: Uint8Array) => void;

  // Reliquat non consommé du dernier ré-échantillonnage, pour préserver la continuité entre
  // deux lots successifs du worklet (sans ça : un micro-artefact à chaque frontière de lot).
  private carryLeft: number[] = [];
  private carryRight: number[] = [];
  private carryPos = 0;

  // Échantillons déjà ré-échantillonnés à 44.1kHz, en attente d'un chunk de sortie complet.
  private outLeft: number[] = [];
  private outRight: number[] = [];

  constructor(onChunk: (chunk: Uint8Array) => void) {
    this.onChunk = onChunk;
  }

  push(left: Float32Array, right: Float32Array, sourceRate: number): void {
    const combinedLeft = this.carryLeft.length ? this.carryLeft.concat(Array.from(left)) : Array.from(left);
    const combinedRight = this.carryRight.length ? this.carryRight.concat(Array.from(right)) : Array.from(right);
    const ratio = sourceRate / TARGET_SAMPLE_RATE; // échantillons d'entrée par échantillon de sortie
    const n = combinedLeft.length;
    let pos = this.carryPos;

    while (Math.floor(pos) + 1 < n) {
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      this.outLeft.push(combinedLeft[i0] + (combinedLeft[i0 + 1] - combinedLeft[i0]) * frac);
      this.outRight.push(combinedRight[i0] + (combinedRight[i0 + 1] - combinedRight[i0]) * frac);
      pos += ratio;
    }

    const consumedWhole = Math.floor(pos);
    this.carryLeft = combinedLeft.slice(consumedWhole);
    this.carryRight = combinedRight.slice(consumedWhole);
    this.carryPos = pos - consumedWhole;

    this.flushReadyChunks();
  }

  private flushReadyChunks(): void {
    while (this.outLeft.length >= OUTPUT_CHUNK_FRAMES) {
      const frames = OUTPUT_CHUNK_FRAMES;
      const buffer = new ArrayBuffer(frames * 2 /* channels */ * 2 /* octets/échantillon */);
      const view = new DataView(buffer);
      for (let i = 0; i < frames; i++) {
        view.setInt16(i * 4, clampToInt16(this.outLeft[i]), true);
        view.setInt16(i * 4 + 2, clampToInt16(this.outRight[i]), true);
      }
      this.outLeft = this.outLeft.slice(frames);
      this.outRight = this.outRight.slice(frames);
      this.onChunk(new Uint8Array(buffer));
    }
  }

  reset(): void {
    this.carryLeft = [];
    this.carryRight = [];
    this.carryPos = 0;
    this.outLeft = [];
    this.outRight = [];
  }
}
