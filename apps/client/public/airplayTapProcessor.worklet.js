// AudioWorkletProcessor exécuté sur le thread audio — voir GaplessEngine.attachAirplayTap.
// Reste volontairement minimal : accumule des échantillons Float32 stéréo bruts (AUCUN
// rééchantillonnage/encodage ici, voir airplayTap.ts côté thread principal) puis les transmet
// par lots via `port.postMessage` avec transfert de propriété (pas de copie). Tout calcul plus
// lourd (interpolation, conversion Int16) est délibérément laissé au thread principal : le
// thread audio ne doit jamais risquer de retarder le rendu de la lecture normale, qui reste
// entièrement indépendante de ce tap (branché en dérivation additive, voir le commentaire de
// attachAirplayTap).
const FLUSH_FRAMES = 2048;

class AirplayTapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left = new Float32Array(FLUSH_FRAMES);
    this.right = new Float32Array(FLUSH_FRAMES);
    this.writePos = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const left = input[0];
      const right = input.length > 1 ? input[1] : input[0];
      for (let i = 0; i < left.length; i++) {
        this.left[this.writePos] = left[i];
        this.right[this.writePos] = right[i];
        this.writePos++;
        if (this.writePos >= FLUSH_FRAMES) this.flush();
      }
    }
    // `true` : garde le processeur vivant même pendant un silence numérique (piste en pause
    // côté lecture normale, ce tap n'a pas à savoir pourquoi) — arrêter le node casserait le
    // flux AirPlay au prochain redémarrage.
    return true;
  }

  flush() {
    if (this.writePos === 0) return;
    const left = this.writePos === FLUSH_FRAMES ? this.left : this.left.slice(0, this.writePos);
    const right = this.writePos === FLUSH_FRAMES ? this.right : this.right.slice(0, this.writePos);
    this.port.postMessage({ left, right, sampleRate }, [left.buffer, right.buffer]);
    this.left = new Float32Array(FLUSH_FRAMES);
    this.right = new Float32Array(FLUSH_FRAMES);
    this.writePos = 0;
  }
}

registerProcessor("airplay-tap-processor", AirplayTapProcessor);
