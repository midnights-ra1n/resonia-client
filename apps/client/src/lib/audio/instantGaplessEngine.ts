import type { SilenceTrim } from "./trimSilence";

interface EngineState {
  mode: "native" | "buffer";
  bufferSource?: AudioBufferSourceNode;
  bufferGain?: GainNode;
  buffer?: AudioBuffer;
  trim?: SilenceTrim;
  trackStartContextTime: number;
  pauseOffset: number;
  isPaused: boolean;
  preciseTrim?: SilenceTrim;
  preciseDuration?: number;
}

const NO_TRIM: SilenceTrim = { start: 0, end: 0 };

// Fondu très court appliqué au moment de la bascule gapless : masque un éventuel
// décalage résiduel de quelques millisecondes sous forme de fondu inaudible plutôt
// que d'une coupure sèche ou d'un clic.
const SWAP_CROSSFADE = 0.012;

// Instant (en secondes avant la bascule prévue) auquel on revérifie/recorrige la
// planification gapless une dernière fois. Corrige la dérive entre l'horloge du
// <audio> natif (streaming réseau, sujette au rebuffering) et celle, imperturbable,
// de l'AudioContext — dérive nettement plus marquée sur Firefox que sur Chromium.
const RESYNC_LEAD = 0.6;
const RESYNC_TOLERANCE = 0.03;

interface PendingSchedule {
  nextBuffer: AudioBuffer;
  nextTrim: SilenceTrim;
  onSwap: () => void;
}

export class InstantGaplessEngine {
  readonly context: AudioContext;
  private masterGain: GainNode;
  private nativeAudio: HTMLAudioElement;
  private nativeGain: GainNode;

  private state: EngineState | null = null;
  private nextTrigger: AudioBufferSourceNode | null = null;
  private nextBufferSource: AudioBufferSourceNode | null = null;
  private nextBufferGain: GainNode | null = null;
  private onEndedCallback: (() => void) | null = null;

  private pending: PendingSchedule | null = null;
  private resyncTimer: number | null = null;
  private stalledDuringSchedule = false;

  constructor() {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);

    this.nativeAudio = new Audio();
    this.nativeAudio.preload = "auto";
    // NB : pas de crossOrigin ici. On ne lit jamais les échantillons bruts du flux
    // natif (aucun AnalyserNode / getChannelData dessus), donc le CORS n'est pas
    // nécessaire pour la lecture. Le régler à "anonymous" sans en-têtes CORS
    // parfaitement configurés côté serveur pouvait, sur Safari, couper le son
    // entièrement au lieu de simplement bloquer la lecture des échantillons.
    const mediaSource = this.context.createMediaElementSource(this.nativeAudio);
    this.nativeGain = this.context.createGain();
    mediaSource.connect(this.nativeGain);
    this.nativeGain.connect(this.masterGain);

    this.nativeAudio.addEventListener("waiting", this.handleStall);
    this.nativeAudio.addEventListener("stalled", this.handleStall);
    this.nativeAudio.addEventListener("playing", this.handleResumeAfterStall);

    // Déblocage audio Safari / iOS : le premier resume() doit être synchrone avec
    // un vrai geste utilisateur, sinon l'AudioContext peut rester "suspended"
    // indéfiniment. Le <audio> a alors l'air de jouer (currentTime avance) mais
    // aucun son ne sort, car tout transite par ce graphe Web Audio suspendu.
    this.installAutoplayUnlock();
  }

  private installAutoplayUnlock() {
    if (typeof window === "undefined") return;
    const unlock = () => {
      if (this.context.state === "suspended") {
        this.context.resume().catch(() => { });
      }
      try {
        const buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
        const src = this.context.createBufferSource();
        src.buffer = buffer;
        src.connect(this.context.destination);
        src.start(0);
      } catch { }
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    const handler = () => {
      unlock();
      events.forEach((e) => window.removeEventListener(e, handler));
    };
    events.forEach((e) => window.addEventListener(e, handler, { once: true, passive: true }));
  }

  private handleStall = () => {
    if (this.pending && this.state?.mode === "native") {
      this.stalledDuringSchedule = true;
    }
  };

  private handleResumeAfterStall = () => {
    if (this.stalledDuringSchedule && this.pending) {
      this.stalledDuringSchedule = false;
      this.performSchedule();
    }
  };

  setVolume(v: number) {
    this.masterGain.gain.value = v;
  }

  onEnded(cb: () => void) {
    this.onEndedCallback = cb;
  }

  async decode(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return this.context.decodeAudioData(arrayBuffer.slice(0));
  }

  private clearResyncTimer() {
    if (this.resyncTimer !== null) {
      window.clearTimeout(this.resyncTimer);
      this.resyncTimer = null;
    }
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
    if (this.nextBufferGain) {
      try { this.nextBufferGain.disconnect(); } catch { }
      this.nextBufferGain = null;
    }
    this.clearResyncTimer();
    this.pending = null;
    this.stalledDuringSchedule = false;
  }

  /** Démarrage instantané via streaming natif — aucune attente de téléchargement complet. */
  playInstant(url: string, offset = 0) {
    // On ne place jamais d'`await` avant `.play()` : sur Safari, tout `await` avant
    // cet appel peut faire perdre l'activation utilisateur du geste en cours et
    // provoquer un rejet silencieux (NotAllowedError). On tente donc `.play()`
    // immédiatement et on relance `resume()` en parallèle, sans bloquer dessus.
    if (this.context.state === "suspended") {
      this.context.resume().catch(() => { });
    }
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
    this.nativeAudio.play().catch((err) => {
      console.error("[player] Lecture instantanée impossible", err);
      // Filet de sécurité Safari : si le premier essai échoue parce que le contexte
      // était encore suspendu au moment de l'appel, on retente une fois résolu.
      this.context.resume().then(() => {
        this.nativeAudio.play().catch((e) => console.error("[player] Nouvelle tentative impossible", e));
      }).catch(() => { });
    });

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
    if (this.context.state === "suspended") {
      this.context.resume().catch(() => { });
    }
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
    if (this.state?.bufferGain) {
      try { this.state.bufferGain.disconnect(); } catch { }
    }

    const logicalDuration = Math.max(buffer.duration - trim.start - trim.end, 0);
    const rawOffset = trim.start + offset;

    const gain = this.context.createGain();
    gain.gain.value = 1;
    gain.connect(this.masterGain);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
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
      bufferGain: gain,
      trackStartContextTime: this.context.currentTime,
      pauseOffset: offset,
      isPaused: false,
    };
  }

  /** Planifie le titre suivant (déjà décodé) pour un enchaînement sample-accurate. */
  scheduleNext(nextBuffer: AudioBuffer, nextTrim: SilenceTrim, onSwap: () => void) {
    if (!this.state) return;

    // On annule toute planification précédente avant d'en créer une nouvelle : sans
    // ça, un second appel à scheduleNext() laissait l'ancien AudioBufferSourceNode
    // "next" orphelin — plus aucune référence ne pointait dessus, mais il restait
    // planifié sur l'horloge de l'AudioContext et se lançait tout seul au moment
    // prévu, sans que pause()/cancelScheduledNext() puisse l'arrêter.
    this.cancelScheduledNext();
    this.pending = { nextBuffer, nextTrim, onSwap };
    this.performSchedule();
  }

  /**
   * (Re)planifie la bascule gapless à partir de l'estimation courante du temps
   * restant. Appelée à la fois par scheduleNext() et par la resynchronisation
   * tardive / la reprise après un stall réseau, pour corriger le décalage qui
   * peut s'accumuler entre l'horloge du <audio> natif et celle de l'AudioContext
   * (rebuffering, throttling...) — décalage bien plus marqué sur Firefox.
   */
  private performSchedule() {
    if (!this.state || !this.pending) return;
    const { nextBuffer, nextTrim, onSwap } = this.pending;

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
    if (this.nextBufferGain) {
      try { this.nextBufferGain.disconnect(); } catch { }
      this.nextBufferGain = null;
    }
    this.clearResyncTimer();

    const remaining = Math.max(this.duration - this.currentTime, 0);
    const startAt = this.context.currentTime + remaining;
    const nextLogicalDuration = Math.max(nextBuffer.duration - nextTrim.start - nextTrim.end, 0);

    // Gain dédié à la piste suivante : permet un fondu d'entrée très court au
    // moment exact de la bascule, pour masquer un éventuel résidu de décalage.
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(1, startAt + SWAP_CROSSFADE);
    gain.connect(this.masterGain);

    const source = this.context.createBufferSource();
    source.buffer = nextBuffer;
    source.connect(gain);
    source.start(startAt, nextTrim.start);
    try {
      source.stop(startAt + nextLogicalDuration);
    } catch { }
    this.nextBufferSource = source;
    this.nextBufferGain = gain;

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
      if (this.nextBufferSource === source) this.nextBufferSource = null;
      if (this.nextBufferGain === gain) this.nextBufferGain = null;
      this.pending = null;
      this.clearResyncTimer();

      const swapAt = this.context.currentTime;
      if (previousState.mode === "native") {
        // Fondu de sortie très court sur la piste native en cours, symétrique au
        // fondu d'entrée de la suivante, plutôt qu'une coupure sèche.
        this.nativeGain.gain.cancelScheduledValues(swapAt);
        this.nativeGain.gain.setValueAtTime(this.nativeGain.gain.value, swapAt);
        this.nativeGain.gain.linearRampToValueAtTime(0, swapAt + SWAP_CROSSFADE);
        const audioToStop = this.nativeAudio;
        window.setTimeout(() => {
          audioToStop.pause();
          this.nativeGain.gain.cancelScheduledValues(this.context.currentTime);
          this.nativeGain.gain.setValueAtTime(1, this.context.currentTime);
        }, SWAP_CROSSFADE * 1000 + 30);
      } else if (previousState.bufferSource) {
        previousState.bufferSource.onended = null;
        try { previousState.bufferSource.stop(); } catch { }
        if (previousState.bufferGain) {
          try { previousState.bufferGain.disconnect(); } catch { }
        }
      }

      this.state = {
        mode: "buffer",
        buffer: nextBuffer,
        trim: nextTrim,
        bufferSource: source,
        bufferGain: gain,
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

    // Dernière resynchronisation juste avant la bascule prévue : si l'horloge native
    // a dérivé depuis le calcul initial (mise en tampon, throttling de l'onglet...),
    // on recalcule et reprogramme avec une marge d'erreur bien plus faible. C'est ce
    // qui corrige la coupure d'environ 1s observée sur Firefox. On ne le fait que
    // s'il reste assez de marge pour que ça ait un sens (sinon on laisserait planifier
    // un resync à ~0ms en boucle).
    if (remaining > RESYNC_LEAD + RESYNC_TOLERANCE) {
      const leadMs = (remaining - RESYNC_LEAD) * 1000;
      this.resyncTimer = window.setTimeout(() => {
        this.resyncTimer = null;
        if (!this.pending || this.state?.mode !== "native") return;
        const freshRemaining = Math.max(this.duration - this.currentTime, 0);
        if (Math.abs(freshRemaining - RESYNC_LEAD) > RESYNC_TOLERANCE) {
          this.performSchedule();
        }
      }, leadMs);
    }
  }

  stop() {
    this.cancelScheduledNext();
    this.nativeAudio.pause();
    this.nativeGain.gain.cancelScheduledValues(this.context.currentTime);
    this.nativeGain.gain.setValueAtTime(1, this.context.currentTime);
    if (this.state?.bufferSource) {
      this.state.bufferSource.onended = null;
      try { this.state.bufferSource.stop(); } catch { }
    }
    if (this.state?.bufferGain) {
      try { this.state.bufferGain.disconnect(); } catch { }
    }
    this.state = null;
  }
}

let engine: InstantGaplessEngine | null = null;
export function getInstantGaplessEngine(): InstantGaplessEngine {
  if (!engine) engine = new InstantGaplessEngine();
  return engine;
}
