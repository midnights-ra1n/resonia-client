import type { SilenceTrim } from "./trimSilence";

interface EngineState {
  mode: "native" | "buffer";
  bufferSource?: AudioBufferSourceNode;
  buffer?: AudioBuffer;
  trim?: SilenceTrim;
  trackStartContextTime: number;
  pauseOffset: number;
  isPaused: boolean;
  preciseTrim?: SilenceTrim;
  preciseDuration?: number;
}

const NO_TRIM: SilenceTrim = { start: 0, end: 0 };

export class InstantGaplessEngine {
  readonly context: AudioContext;
  private masterGain: GainNode;
  private nativeAudio: HTMLAudioElement;
  private nativeGain: GainNode;

  private state: EngineState | null = null;
  private nextTrigger: AudioBufferSourceNode | null = null;
  private nextBufferSource: AudioBufferSourceNode | null = null;
  private onEndedCallback: (() => void) | null = null;

  constructor() {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);

    this.nativeAudio = new Audio();
    this.nativeAudio.preload = "auto";
    this.nativeAudio.crossOrigin = "anonymous";
    const source = this.context.createMediaElementSource(this.nativeAudio);
    this.nativeGain = this.context.createGain();
    source.connect(this.nativeGain);
    this.nativeGain.connect(this.masterGain);
  }

  setVolume(v: number) {
    this.masterGain.gain.value = v;
  }

  onEnded(cb: () => void) {
    this.onEndedCallback = cb;
  }

  async decode(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return this.context.decodeAudioData(arrayBuffer.slice(0));
  }

  private cancelScheduledNext() {
    if (this.nextTrigger) {
      this.nextTrigger.onended = null;
      try { this.nextTrigger.stop(); } catch { }
      this.nextTrigger = null;
    }
    if (this.nextBufferSource) {
      this.nextBufferSource.onended = null;
      try { this.nextBufferSource.stop(); } catch { }
      this.nextBufferSource = null;
    }
  }

  /** Démarrage instantané via streaming natif — aucune attente de téléchargement complet. */
  playInstant(url: string, offset = 0) {
    if (this.context.state === "suspended") this.context.resume();
    this.cancelScheduledNext();

    this.nativeAudio.pause();
    if (this.state?.bufferSource) {
      this.state.bufferSource.onended = null;
      try { this.state.bufferSource.stop(); } catch { }
    }

    const now = this.context.currentTime;
    this.nativeGain.gain.cancelScheduledValues(now);
    this.nativeGain.gain.setValueAtTime(1, now);

    this.nativeAudio.src = url;
    this.nativeAudio.currentTime = offset;
    this.nativeAudio.play().catch((err) => console.error("[player] Lecture instantanée impossible", err));

    this.nativeAudio.onended = () => {
      if (this.state?.mode === "native") this.onEndedCallback?.();
    };

    this.state = {
      mode: "native",
      trackStartContextTime: now,
      pauseOffset: offset,
      isPaused: false,
    };
  }

  /** À appeler une fois le décodage en arrière-plan terminé : affine la durée logique (padding exclu). */
  attachPreciseTrim(trim: SilenceTrim, rawDuration: number) {
    if (!this.state || this.state.mode !== "native") return;
    this.state.preciseTrim = trim;
    this.state.preciseDuration = Math.max(rawDuration - trim.start - trim.end, 0);
  }

  get currentTime(): number {
    if (!this.state) return 0;
    if (this.state.isPaused) return this.state.pauseOffset;
    if (this.state.mode === "native") return this.nativeAudio.currentTime;
    return this.state.pauseOffset + (this.context.currentTime - this.state.trackStartContextTime);
  }

  get duration(): number {
    if (!this.state) return 0;
    if (this.state.mode === "native") {
      return this.state.preciseDuration ?? this.nativeAudio.duration ?? 0;
    }
    if (!this.state.buffer) return 0;
    const trim = this.state.trim ?? NO_TRIM;
    return Math.max(this.state.buffer.duration - trim.start - trim.end, 0);
  }

  pause() {
    if (!this.state || this.state.isPaused) return;
    this.state.pauseOffset = this.currentTime;
    this.state.isPaused = true;
    this.cancelScheduledNext();

    if (this.state.mode === "native") {
      this.nativeAudio.pause();
    } else if (this.state.bufferSource) {
      this.state.bufferSource.onended = null;
      try { this.state.bufferSource.stop(); } catch { }
    }
  }

  resume() {
    if (!this.state || !this.state.isPaused) return;
    if (this.state.mode === "native") {
      this.state.isPaused = false;
      this.nativeAudio.play().catch((err) => console.error("[player] Lecture impossible", err));
      this.state.trackStartContextTime = this.context.currentTime - this.nativeAudio.currentTime;
    } else if (this.state.buffer) {
      this.playBufferFrom(this.state.buffer, this.state.trim ?? NO_TRIM, this.state.pauseOffset);
    }
  }

  seek(time: number) {
    if (!this.state) return;
    const clamped = Math.max(0, Math.min(time, this.duration));
    this.cancelScheduledNext();

    if (this.state.mode === "native") {
      this.nativeAudio.currentTime = clamped;
      this.state.pauseOffset = clamped;
      this.state.trackStartContextTime = this.context.currentTime - clamped;
    } else if (this.state.buffer) {
      if (this.state.isPaused) {
        this.state.pauseOffset = clamped;
      } else {
        this.playBufferFrom(this.state.buffer, this.state.trim ?? NO_TRIM, clamped);
      }
    }
  }

  private playBufferFrom(buffer: AudioBuffer, trim: SilenceTrim, offset: number) {
    if (this.state?.bufferSource) {
      this.state.bufferSource.onended = null;
      try { this.state.bufferSource.stop(); } catch { }
    }

    const logicalDuration = Math.max(buffer.duration - trim.start - trim.end, 0);
    const rawOffset = trim.start + offset;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain);
    source.start(0, rawOffset);
    try {
      source.stop(this.context.currentTime + Math.max(logicalDuration - offset, 0));
    } catch { }

    source.onended = () => {
      if (this.state?.mode === "buffer" && this.state.bufferSource === source) {
        this.onEndedCallback?.();
      }
    };

    this.state = {
      mode: "buffer",
      buffer,
      trim,
      bufferSource: source,
      trackStartContextTime: this.context.currentTime,
      pauseOffset: offset,
      isPaused: false,
    };
  }

  /** Planifie le titre suivant (déjà décodé) pour un enchaînement sample-accurate. */
  scheduleNext(nextBuffer: AudioBuffer, nextTrim: SilenceTrim, onSwap: () => void) {
    if (!this.state) return;

    // IMPORTANT : on annule toute planification précédente avant d'en créer une nouvelle.
    // Sans ça, un second appel à scheduleNext() (re-render, timeupdate, etc.) laissait
    // l'ancien AudioBufferSourceNode "next" orphelin : plus aucune référence ne pointait
    // dessus, mais il restait planifié sur l'horloge de l'AudioContext et se lançait tout
    // seul au moment prévu, sans que pause()/cancelScheduledNext() puisse l'arrêter.
    this.cancelScheduledNext();

    const remaining = Math.max(this.duration - this.currentTime, 0);
    const startAt = this.context.currentTime + remaining;
    const nextLogicalDuration = Math.max(nextBuffer.duration - nextTrim.start - nextTrim.end, 0);

    const source = this.context.createBufferSource();
    source.buffer = nextBuffer;
    source.connect(this.masterGain);
    source.start(startAt, nextTrim.start);
    try {
      source.stop(startAt + nextLogicalDuration);
    } catch { }
    this.nextBufferSource = source;

    // Minuteur silencieux basé sur l'horloge audio (précis, insensible au throttling
    // des setTimeout en arrière-plan) pour déclencher le basculement d'état au bon moment.
    const sampleCount = Math.max(1, Math.ceil(remaining * this.context.sampleRate));
    const triggerBuffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate);
    const trigger = this.context.createBufferSource();
    trigger.buffer = triggerBuffer;
    trigger.connect(this.masterGain);
    trigger.start(this.context.currentTime);
    this.nextTrigger = trigger;

    const previousState = this.state;

    trigger.onended = () => {
      if (this.nextTrigger !== trigger) return;
      this.nextTrigger = null;
      // La source "next" devient la source courante : on retire la référence pour
      // qu'un futur cancelScheduledNext()/pause() n'aille pas la stopper par erreur
      // en la confondant avec une piste encore "en attente".
      if (this.nextBufferSource === source) this.nextBufferSource = null;

      if (previousState.mode === "native") {
        this.nativeAudio.pause();
      } else if (previousState.bufferSource) {
        previousState.bufferSource.onended = null;
        try { previousState.bufferSource.stop(); } catch { }
      }

      this.state = {
        mode: "buffer",
        buffer: nextBuffer,
        trim: nextTrim,
        bufferSource: source,
        trackStartContextTime: startAt,
        pauseOffset: 0,
        isPaused: false,
      };

      source.onended = () => {
        if (this.state?.mode === "buffer" && this.state.bufferSource === source) {
          this.onEndedCallback?.();
        }
      };

      onSwap();
    };
  }

  stop() {
    this.cancelScheduledNext();
    this.nativeAudio.pause();
    if (this.state?.bufferSource) {
      this.state.bufferSource.onended = null;
      try { this.state.bufferSource.stop(); } catch { }
    }
    this.state = null;
  }
}

let engine: InstantGaplessEngine | null = null;
export function getInstantGaplessEngine(): InstantGaplessEngine {
  if (!engine) engine = new InstantGaplessEngine();
  return engine;
}
