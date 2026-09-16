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
//
// Tampons `Float32Array` réutilisés en place (`copyWithin` pour compacter, jamais de nouvelle
// allocation dans le cas courant) plutôt que des `number[]` avec `Array.from`/`concat`/`slice` à
// chaque appel : ce module tourne plusieurs fois par seconde sur le thread principal du
// renderer — le laisser générer beaucoup de mémoire jetable (donc de pauses GC) retardait
// l'envoi IPC des chunks, perçu côté AirPlay comme des micro-coupures (le buffer circulaire de
// la lib se remplit alors avec du silence zero-fill entre deux envois, voir son code).

const TARGET_SAMPLE_RATE = 44100;
// ~50ms à 44.1kHz (anciennement 100ms) : chaque chunk plus petit ajoute un aller-retour IPC
// supplémentaire (négligeable, Electron IPC en LAN local), mais retire d'autant de latence de
// mise en tampon avant même d'atteindre le buffer de gigue de la lib côté process principal —
// significatif dans la chaîne de délai perçu à la pause/au seek (voir aussi packets_in_buffer/
// stream_latency dans electron/main/index.ts, réduits pour la même raison).
const OUTPUT_CHUNK_FRAMES = 2205;

// Un seul lot du worklet ne dépasse jamais FLUSH_FRAMES (2048, voir
// airplayTapProcessor.worklet.js) : cette capacité initiale ne devrait donc jamais avoir besoin
// de grandir en pratique — la marge est là par sécurité, pas par dimensionnement fin.
const INITIAL_CARRY_CAPACITY = 8192;
const INITIAL_OUT_CAPACITY = OUTPUT_CHUNK_FRAMES * 4;

function clampToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

export class AirplayPcmEncoder {
  private onChunk: (chunk: Uint8Array) => void;

  // Reliquat non consommé du dernier ré-échantillonnage (`carryLen` premiers échantillons
  // valides), pour préserver la continuité entre deux lots successifs du worklet — sans ça, un
  // micro-artefact à chaque frontière de lot.
  private carryLeft = new Float32Array(INITIAL_CARRY_CAPACITY);
  private carryRight = new Float32Array(INITIAL_CARRY_CAPACITY);
  private carryLen = 0;
  private carryPos = 0;

  // Échantillons déjà ré-échantillonnés à 44.1kHz (`outLen` premiers valides), en attente d'un
  // chunk de sortie complet.
  private outLeft = new Float32Array(INITIAL_OUT_CAPACITY);
  private outRight = new Float32Array(INITIAL_OUT_CAPACITY);
  private outLen = 0;

  // Diagnostic temporaire (preuve de concept) — voir le commentaire équivalent dans
  // GaplessEngine.attachAirplayTap.
  private pushCount = 0;
  private chunkCount = 0;

  constructor(onChunk: (chunk: Uint8Array) => void) {
    this.onChunk = onChunk;
  }

  push(left: Float32Array, right: Float32Array, sourceRate: number): void {
    this.pushCount++;
    if (this.pushCount === 1 || this.pushCount % 50 === 0) {
      console.log(`[airplay-encoder] push #${this.pushCount}, sourceRate=${sourceRate}, chunks émis jusqu'ici=${this.chunkCount}`);
    }

    const newLen = left.length;
    const n = this.carryLen + newLen;
    if (n > this.carryLeft.length) this.growCarryBuffers(n);
    this.carryLeft.set(left, this.carryLen);
    this.carryRight.set(right, this.carryLen);

    const ratio = sourceRate / TARGET_SAMPLE_RATE; // échantillons d'entrée par échantillon de sortie
    let pos = this.carryPos;
    // Estimation large (jamais exacte, `ratio` n'est pas forcément entier) du nombre
    // d'échantillons de sortie que cette passe peut produire, pour ne réallouer qu'une fois par
    // appel au pire plutôt qu'à chaque échantillon écrit dans la boucle ci-dessous.
    this.ensureOutCapacity(this.outLen + Math.ceil((n - pos) / ratio) + 1);

    while (Math.floor(pos) + 1 < n) {
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      this.outLeft[this.outLen] = this.carryLeft[i0] + (this.carryLeft[i0 + 1] - this.carryLeft[i0]) * frac;
      this.outRight[this.outLen] = this.carryRight[i0] + (this.carryRight[i0 + 1] - this.carryRight[i0]) * frac;
      this.outLen++;
      pos += ratio;
    }

    const consumedWhole = Math.floor(pos);
    this.carryLeft.copyWithin(0, consumedWhole, n);
    this.carryRight.copyWithin(0, consumedWhole, n);
    this.carryLen = n - consumedWhole;
    this.carryPos = pos - consumedWhole;

    this.flushReadyChunks();
  }

  private growCarryBuffers(minCapacity: number): void {
    const capacity = Math.max(minCapacity, this.carryLeft.length * 2);
    const newLeft = new Float32Array(capacity);
    const newRight = new Float32Array(capacity);
    newLeft.set(this.carryLeft.subarray(0, this.carryLen));
    newRight.set(this.carryRight.subarray(0, this.carryLen));
    this.carryLeft = newLeft;
    this.carryRight = newRight;
  }

  private ensureOutCapacity(minCapacity: number): void {
    if (minCapacity <= this.outLeft.length) return;
    const capacity = Math.max(minCapacity, this.outLeft.length * 2);
    const newLeft = new Float32Array(capacity);
    const newRight = new Float32Array(capacity);
    newLeft.set(this.outLeft.subarray(0, this.outLen));
    newRight.set(this.outRight.subarray(0, this.outLen));
    this.outLeft = newLeft;
    this.outRight = newRight;
  }

  private flushReadyChunks(): void {
    let offset = 0;
    while (this.outLen - offset >= OUTPUT_CHUNK_FRAMES) {
      const buffer = new ArrayBuffer(OUTPUT_CHUNK_FRAMES * 2 /* channels */ * 2 /* octets/échantillon */);
      const view = new DataView(buffer);
      for (let i = 0; i < OUTPUT_CHUNK_FRAMES; i++) {
        view.setInt16(i * 4, clampToInt16(this.outLeft[offset + i]), true);
        view.setInt16(i * 4 + 2, clampToInt16(this.outRight[offset + i]), true);
      }
      offset += OUTPUT_CHUNK_FRAMES;
      this.chunkCount++;
      this.onChunk(new Uint8Array(buffer));
    }
    if (offset > 0) {
      this.outLeft.copyWithin(0, offset, this.outLen);
      this.outRight.copyWithin(0, offset, this.outLen);
      this.outLen -= offset;
    }
  }

  reset(): void {
    this.carryLen = 0;
    this.carryPos = 0;
    this.outLen = 0;
  }
}
