export type DeckId = "A" | "B";

interface Deck {
  audio: HTMLAudioElement;
  gain: GainNode;
  analyser: AnalyserNode;
}

export const CROSSFADE_SECONDS = 0.05;
const SILENCE_THRESHOLD = 0.015; // amplitude linéaire (~ -36 dB)
const ONSET_DETECTION_TIMEOUT_MS = 500; // garde-fou si jamais aucun signal n'est détecté

class HybridAudioEngine {
  readonly context: AudioContext;
  private masterGain: GainNode;
  private decks: Record<DeckId, Deck>;
  private activeDeck: DeckId = "A";
  private onEndedCallback: (() => void) | null = null;
  private onTimeUpdateCallback: ((time: number, duration: number) => void) | null = null;

  private crossfadeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private onsetRafId: number | null = null;
  private onsetTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pendingPlayingHandler: { deck: Deck; handler: () => void } | null = null;

  constructor() {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.decks = { A: this.createDeck(), B: this.createDeck() };
    this.attachDeckEvents("A");
    this.attachDeckEvents("B");
    this.startProgressLoop();
  }

  private createDeck(): Deck {
    const audio = new Audio();
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    const source = this.context.createMediaElementSource(audio);
    const gain = this.context.createGain();
    gain.gain.value = 0;

    const analyser = this.context.createAnalyser();
    analyser.fftSize = 512;

    // Le tap d'analyse se branche directement sur la source, AVANT le gain :
    // sinon, tant que gain=0 (pendant le préchargement), l'analyseur ne verrait
    // jamais rien puisque tout serait multiplié par zéro.
    source.connect(analyser);
    source.connect(gain);
    gain.connect(this.masterGain);

    return { audio, gain, analyser };
  }

  private attachDeckEvents(id: DeckId) {
    const deck = this.decks[id];
    deck.audio.addEventListener("ended", () => {
      if (this.activeDeck === id) this.onEndedCallback?.();
    });
  }

  private startProgressLoop() {
    const tick = () => {
      const deck = this.decks[this.activeDeck];
      if (deck.audio.duration) {
        this.onTimeUpdateCallback?.(deck.audio.currentTime, deck.audio.duration);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private cancelPendingCrossfade() {
    if (this.crossfadeTimeoutId) {
      clearTimeout(this.crossfadeTimeoutId);
      this.crossfadeTimeoutId = null;
    }
    if (this.onsetRafId !== null) {
      cancelAnimationFrame(this.onsetRafId);
      this.onsetRafId = null;
    }
    if (this.onsetTimeoutId) {
      clearTimeout(this.onsetTimeoutId);
      this.onsetTimeoutId = null;
    }
    if (this.pendingPlayingHandler) {
      this.pendingPlayingHandler.deck.audio.removeEventListener("playing", this.pendingPlayingHandler.handler);
      this.pendingPlayingHandler = null;
    }
  }

  /** Attend que du signal audio réel (au-dessus du seuil de silence) sorte du deck, puis appelle onDetected. */
  private waitForAudibleOnset(deck: Deck, onDetected: () => void) {
    const buffer = new Float32Array(deck.analyser.fftSize);

    const poll = () => {
      deck.analyser.getFloatTimeDomainData(buffer);
      let peak = 0;
      for (let i = 0; i < buffer.length; i++) {
        const abs = Math.abs(buffer[i]);
        if (abs > peak) peak = abs;
      }

      if (peak > SILENCE_THRESHOLD) {
        this.onsetRafId = null;
        if (this.onsetTimeoutId) {
          clearTimeout(this.onsetTimeoutId);
          this.onsetTimeoutId = null;
        }
        onDetected();
        return;
      }

      this.onsetRafId = requestAnimationFrame(poll);
    };

    this.onsetRafId = requestAnimationFrame(poll);

    // Garde-fou : si aucun signal n'est détecté après 500ms (piste au silence
    // réellement long, ou souci imprévu), on démarre quand même le fondu.
    this.onsetTimeoutId = setTimeout(() => {
      if (this.onsetRafId !== null) {
        cancelAnimationFrame(this.onsetRafId);
        this.onsetRafId = null;
      }
      onDetected();
    }, ONSET_DETECTION_TIMEOUT_MS);
  }

  setVolume(v: number) {
    this.masterGain.gain.value = v;
  }

  onEnded(cb: () => void) {
    this.onEndedCallback = cb;
  }

  onTimeUpdate(cb: (time: number, duration: number) => void) {
    this.onTimeUpdateCallback = cb;
  }

  private get inactiveDeckId(): DeckId {
    return this.activeDeck === "A" ? "B" : "A";
  }

  get currentTime(): number {
    return this.decks[this.activeDeck].audio.currentTime;
  }

  get duration(): number {
    return this.decks[this.activeDeck].audio.duration || 0;
  }

  playNew(url: string, offset = 0) {
    if (this.context.state === "suspended") this.context.resume();

    this.cancelPendingCrossfade();

    const now = this.context.currentTime;
    (["A", "B"] as DeckId[]).forEach((id) => {
      const deck = this.decks[id];
      deck.audio.pause();
      deck.gain.gain.cancelScheduledValues(now);
      deck.gain.gain.setValueAtTime(0, now);
    });

    this.activeDeck = "A";
    const deck = this.decks.A;
    deck.gain.gain.cancelScheduledValues(now);
    deck.gain.gain.setValueAtTime(1, now);
    deck.audio.src = url;
    deck.audio.currentTime = offset;
    deck.audio.play().catch((err) => console.error("[player] Lecture impossible", err));
  }

  preload(url: string) {
    const deck = this.decks[this.inactiveDeckId];
    if (deck.audio.src === url) return;
    deck.audio.src = url;
    deck.audio.load();
  }

  crossfadeToPreloaded(onSwapComplete: () => void) {
    const from = this.decks[this.activeDeck];
    const toId = this.inactiveDeckId;
    const to = this.decks[toId];

    to.audio.currentTime = 0;

    const beginFade = () => {
      this.pendingPlayingHandler = null;

      // On attend le vrai signal audio (au-delà du padding silencieux AAC)
      // avant de commencer le fondu.
      this.waitForAudibleOnset(to, () => {
        const now = this.context.currentTime;
        from.gain.gain.cancelScheduledValues(now);
        from.gain.gain.setValueAtTime(from.gain.gain.value, now);
        from.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_SECONDS);

        to.gain.gain.cancelScheduledValues(now);
        to.gain.gain.setValueAtTime(0, now);
        to.gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_SECONDS);

        this.crossfadeTimeoutId = setTimeout(() => {
          from.audio.pause();
          this.activeDeck = toId;
          this.crossfadeTimeoutId = null;
          onSwapComplete();
        }, CROSSFADE_SECONDS * 1000);
      });
    };

    this.pendingPlayingHandler = { deck: to, handler: beginFade };
    to.audio.addEventListener("playing", beginFade, { once: true });

    to.audio.play().catch((err) => {
      console.error("[player] Lecture du deck préchargé impossible", err);
      to.audio.removeEventListener("playing", beginFade);
      this.pendingPlayingHandler = null;
    });
  }

  pause() {
    this.cancelPendingCrossfade();
    (["A", "B"] as DeckId[]).forEach((id) => this.decks[id].audio.pause());
  }

  resume() {
    this.decks[this.activeDeck].audio.play().catch((err) => console.error("[player] Lecture impossible", err));
  }

  seek(time: number) {
    this.decks[this.activeDeck].audio.currentTime = time;
  }

  stop() {
    this.cancelPendingCrossfade();
    (["A", "B"] as DeckId[]).forEach((id) => {
      const deck = this.decks[id];
      deck.audio.pause();
      deck.gain.gain.value = 0;
    });
  }
}

let engine: HybridAudioEngine | null = null;
export function getHybridEngine(): HybridAudioEngine {
  if (!engine) engine = new HybridAudioEngine();
  return engine;
}
