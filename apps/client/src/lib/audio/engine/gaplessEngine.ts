import { detectEdgeSilence, logicalDuration, type SilenceTrim } from "./silenceTrim";
import type { EngineError, EngineState, EngineStateListener } from "./types";

// Fondu très court, uniquement pour masquer le point de jonction entre deux sources
// (natif→buffer, ou deux AudioBufferSourceNode consécutifs) — pas pour compenser un
// écart de timing : la planification elle-même est sample-accurate.
const SWAP_FADE_SECONDS = 0.008;

export interface DecodedTrack {
  buffer: AudioBuffer;
  trim: SilenceTrim;
}

interface ActiveNative {
  mode: "native";
  contextStartTime: number;
  pauseOffset: number;
  isPaused: boolean;
}

interface BufferPlayback {
  source: AudioBufferSourceNode;
  gain: GainNode;
  scheduledStartContextTime: number;
  startOffsetInTrim: number;
}

interface ActiveBuffer {
  mode: "buffer";
  buffer: AudioBuffer;
  trim: SilenceTrim;
  isPaused: boolean;
  pauseOffset: number; // valide uniquement quand isPaused
  playback: BufferPlayback | null; // null quand en pause (aucune source active)
}

type TrackState = ActiveNative | ActiveBuffer;

interface PendingNext {
  buffer: AudioBuffer;
  trim: SilenceTrim;
  onSwap: () => void;
  scheduled: boolean;
  scheduledSource?: AudioBufferSourceNode;
  scheduledGain?: GainNode;
}

/**
 * Moteur de lecture gapless : démarre chaque piste en streaming natif pour une réponse
 * instantanée au clic, puis la fait basculer vers un AudioBufferSourceNode dès qu'elle
 * est intégralement décodée (voir attachDecodedActive). Une fois en mode buffer, la
 * durée exacte (silence de bord rogné) est connue : la piste suivante est alors
 * PLANIFIÉE sur l'horloge de l'AudioContext (source.start à l'instant de fin calculé),
 * jamais déclenchée en réaction à un événement — c'est ce qui élimine toute coupure de
 * façon déterministe, sans heuristique de détection de silence en temps réel.
 */
export class GaplessEngine {
  readonly context: AudioContext;
  private masterGain: GainNode;
  private nativeAudio: HTMLAudioElement;
  private nativeGain: GainNode;

  private trackState: TrackState | null = null;
  private pendingNext: PendingNext | null = null;
  private onEndedCallback: (() => void) | null = null;

  private _state: EngineState = "idle";
  private _error: EngineError | null = null;
  private stateListeners = new Set<EngineStateListener>();

  /** Prévient l'appelant quand la lecture native (piste active) atteint réellement
   *  l'état "playing" — le bon moment pour démarrer les tâches de fond (cache, décodage,
   *  préchargement) sans concurrencer le tout début de la lecture au clic. */
  onNativePlaying: (() => void) | null = null;

  /** Prévient l'appelant d'une pression réseau (stall/seek en cours) pour qu'il suspende
   *  son propre préchargement en tâche de fond, et de son relâchement pour le reprendre.
   *  Délibérément découplé du cache : ce moteur ne connaît aucun module de cache. */
  onNetworkPressure: ((active: boolean) => void) | null = null;

  constructor() {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);

    this.nativeAudio = new Audio();
    this.nativeAudio.preload = "auto";
    this.nativeAudio.crossOrigin = "anonymous";
    const mediaSource = this.context.createMediaElementSource(this.nativeAudio);
    this.nativeGain = this.context.createGain();
    mediaSource.connect(this.nativeGain);
    this.nativeGain.connect(this.masterGain);

    this.nativeAudio.addEventListener("waiting", () => {
      if (this.trackState?.mode === "native") {
        this.setState("buffering");
        this.onNetworkPressure?.(true);
      }
    });
    this.nativeAudio.addEventListener("seeking", () => {
      if (this.trackState?.mode === "native") this.onNetworkPressure?.(true);
    });
    this.nativeAudio.addEventListener("canplay", () => {
      if (this.trackState?.mode === "native") {
        this.onNetworkPressure?.(false);
        if (this._state === "loading" || this._state === "buffering") this.setState("ready");
      }
    });
    this.nativeAudio.addEventListener("playing", () => {
      if (this.trackState?.mode === "native") {
        this.onNetworkPressure?.(false);
        this.setState("playing");
        this.onNativePlaying?.();
      }
    });
    this.nativeAudio.addEventListener("ended", () => this.handleNativeEnded());

    this.installAutoplayUnlock();
  }

  private installAutoplayUnlock() {
    if (typeof window === "undefined") return;
    const unlock = () => {
      if (this.context.state === "suspended") this.context.resume().catch(() => {});
      try {
        const buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
        const src = this.context.createBufferSource();
        src.buffer = buffer;
        src.connect(this.context.destination);
        src.start(0);
      } catch {
        /* noop */
      }
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    const handler = () => {
      unlock();
      events.forEach((e) => window.removeEventListener(e, handler));
    };
    events.forEach((e) => window.addEventListener(e, handler, { once: true, passive: true }));
  }

  // ---- état exposé ----

  get state(): EngineState {
    return this._state;
  }

  get error(): EngineError | null {
    return this._error;
  }

  onStateChange(cb: EngineStateListener): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  private setState(state: EngineState, error: EngineError | null = null) {
    this._state = state;
    this._error = error;
    this.stateListeners.forEach((cb) => cb(state, error));
  }

  reportError(message: string, cause?: unknown) {
    console.error(`[audio] ${message}`, cause);
    this.setState("error", { message, cause });
  }

  onEnded(cb: () => void) {
    this.onEndedCallback = cb;
  }

  setVolume(v: number) {
    this.masterGain.gain.value = v;
  }

  // ---- décodage ----

  async decode(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return this.context.decodeAudioData(arrayBuffer.slice(0));
  }

  async decodeAndTrim(arrayBuffer: ArrayBuffer): Promise<DecodedTrack> {
    const buffer = await this.decode(arrayBuffer);
    return { buffer, trim: detectEdgeSilence(buffer) };
  }

  // ---- lecture ----

  /** Démarre la lecture d'une piste. Si `decoded` est fourni (piste déjà préparée, ex:
   *  retour arrière sur une piste déjà décodée), démarre directement en mode buffer,
   *  sample-accurate dès la première image. Sinon démarre en streaming natif pour une
   *  réponse instantanée au clic. */
  loadAndPlay(url: string, offset = 0, decoded?: DecodedTrack) {
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
    this.discardPending();
    this.teardownCurrent();
    this.setState("loading");

    if (decoded) {
      this.startBufferAt(decoded.buffer, decoded.trim, offset);
      return;
    }

    // Ne jamais placer d'`await` avant `.play()` : sur Safari, un `await` avant cet appel
    // peut faire perdre l'activation utilisateur du geste en cours (rejet NotAllowedError).
    this.nativeAudio.pause();
    const now = this.context.currentTime;
    this.nativeGain.gain.cancelScheduledValues(now);
    this.nativeGain.gain.setValueAtTime(1, now);

    this.nativeAudio.src = url;
    this.nativeAudio.currentTime = offset;
    this.nativeAudio.play().catch((err) => {
      this.context
        .resume()
        .then(() => this.nativeAudio.play().catch((e) => this.reportError("Lecture impossible après reprise du contexte audio", e)))
        .catch(() => this.reportError("Lecture instantanée impossible", err));
    });

    this.trackState = { mode: "native", contextStartTime: now, pauseOffset: offset, isPaused: false };
  }

  /** Bascule la piste active du streaming natif vers un AudioBufferSourceNode dès que son
   *  décodage complet est prêt : à partir de là, la durée exacte de la piste est connue,
   *  et la transition vers la piste suivante devient planifiable au sample près. */
  attachDecodedActive(decoded: DecodedTrack) {
    if (!this.trackState || this.trackState.mode !== "native") return;
    const wasPaused = this.trackState.isPaused;
    const position = this.currentTime;

    const nativeAudioRef = this.nativeAudio;
    const now = this.context.currentTime;
    this.nativeGain.gain.cancelScheduledValues(now);
    this.nativeGain.gain.setValueAtTime(this.nativeGain.gain.value, now);
    this.nativeGain.gain.linearRampToValueAtTime(0, now + SWAP_FADE_SECONDS);
    this.nativeGain.gain.setValueAtTime(1, now + SWAP_FADE_SECONDS + 0.02);
    window.setTimeout(() => {
      if (nativeAudioRef === this.nativeAudio) nativeAudioRef.pause();
    }, SWAP_FADE_SECONDS * 1000 + 20);

    this.startBufferAt(decoded.buffer, decoded.trim, position, wasPaused);
  }

  pause() {
    if (!this.trackState) return;
    if (this.trackState.mode === "native") {
      if (this.trackState.isPaused) return;
      this.trackState.pauseOffset = this.currentTime;
      this.trackState.isPaused = true;
      this.nativeAudio.pause();
    } else {
      if (this.trackState.isPaused) return;
      const offset = this.currentTime;
      this.unschedulePending();
      this.stopCurrentBufferPlayback();
      this.trackState = { mode: "buffer", buffer: this.trackState.buffer, trim: this.trackState.trim, isPaused: true, pauseOffset: offset, playback: null };
    }
    this.setState("paused");
  }

  resume() {
    if (!this.trackState || !this.isTrackStatePaused(this.trackState)) return;
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
    if (this.trackState.mode === "native") {
      this.trackState.isPaused = false;
      this.nativeAudio.play().catch((err) => this.reportError("Reprise de lecture impossible", err));
      this.trackState.contextStartTime = this.context.currentTime - this.nativeAudio.currentTime;
      this.setState("playing");
    } else {
      this.startBufferAt(this.trackState.buffer, this.trackState.trim, this.trackState.pauseOffset);
    }
  }

  seek(time: number) {
    if (!this.trackState) return;
    const clamped = Math.max(0, Math.min(time, this.duration));

    if (this.trackState.mode === "native") {
      this.nativeAudio.currentTime = clamped;
      this.trackState.pauseOffset = clamped;
      this.trackState.contextStartTime = this.context.currentTime - clamped;
      return;
    }

    if (this.trackState.isPaused) {
      this.trackState.pauseOffset = clamped;
      return;
    }

    this.unschedulePending();
    this.startBufferAt(this.trackState.buffer, this.trackState.trim, clamped);
  }

  /** Planifie la piste suivante : dès que la piste active est en mode buffer et joue,
   *  programme immédiatement le démarrage exact du prochain AudioBufferSourceNode sur
   *  l'horloge — sinon, reste en attente jusqu'à ce que la piste active bascule en mode
   *  buffer (voir attachDecodedActive) ou reprenne après une pause/un seek. */
  scheduleNext(buffer: AudioBuffer, trim: SilenceTrim, onSwap: () => void) {
    this.discardPending();
    this.pendingNext = { buffer, trim, onSwap, scheduled: false };
    this.trySchedulePending();
  }

  stop() {
    this.discardPending();
    this.teardownCurrent();
    this.trackState = null;
    this.setState("idle");
  }

  get currentTime(): number {
    if (!this.trackState) return 0;
    if (this.trackState.mode === "native") {
      return this.trackState.isPaused ? this.trackState.pauseOffset : this.nativeAudio.currentTime;
    }
    if (this.trackState.isPaused || !this.trackState.playback) return this.trackState.pauseOffset;
    const { scheduledStartContextTime, startOffsetInTrim } = this.trackState.playback;
    return startOffsetInTrim + (this.context.currentTime - scheduledStartContextTime);
  }

  get duration(): number {
    if (!this.trackState) return 0;
    if (this.trackState.mode === "native") return this.nativeAudio.duration || 0;
    return logicalDuration(this.trackState.buffer, this.trackState.trim);
  }

  // ---- internes ----

  private isTrackStatePaused(state: TrackState): boolean {
    return state.isPaused;
  }

  private startBufferAt(buffer: AudioBuffer, trim: SilenceTrim, offset: number, startPaused = false) {
    this.stopCurrentBufferPlayback();

    if (startPaused) {
      this.trackState = { mode: "buffer", buffer, trim, isPaused: true, pauseOffset: offset, playback: null };
      this.setState("paused");
      return;
    }

    const now = this.context.currentTime;
    const gain = this.context.createGain();
    gain.gain.value = 1;
    gain.connect(this.masterGain);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(now, trim.start + offset);

    const remaining = Math.max(logicalDuration(buffer, trim) - offset, 0);
    try {
      source.stop(now + remaining);
    } catch {
      /* noop */
    }
    source.onended = () => this.handleBufferSourceEnded(source);

    this.trackState = {
      mode: "buffer",
      buffer,
      trim,
      isPaused: false,
      pauseOffset: 0,
      playback: { source, gain, scheduledStartContextTime: now, startOffsetInTrim: offset },
    };
    this.setState("playing");
    this.trySchedulePending();
  }

  private stopCurrentBufferPlayback() {
    if (this.trackState?.mode === "buffer" && this.trackState.playback) {
      const { source, gain } = this.trackState.playback;
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* noop */
      }
      try {
        gain.disconnect();
      } catch {
        /* noop */
      }
    }
  }

  /** Programme, sur l'horloge de l'AudioContext, le démarrage exact de la piste en
   *  attente à l'instant de fin calculé de la piste courante — aucune attente d'événement,
   *  aucune heuristique : purement déterministe. No-op si la piste courante n'est pas
   *  actuellement en train de jouer en mode buffer, ou si déjà planifié. */
  private trySchedulePending() {
    if (!this.pendingNext || this.pendingNext.scheduled) return;
    if (!this.trackState || this.trackState.mode !== "buffer" || this.trackState.isPaused || !this.trackState.playback) return;

    const { buffer: curBuffer, trim: curTrim, playback } = this.trackState;
    const { source: curSource, scheduledStartContextTime, startOffsetInTrim } = playback;
    const endTime = scheduledStartContextTime - startOffsetInTrim + logicalDuration(curBuffer, curTrim);

    const { buffer: nextBuffer, trim: nextTrim } = this.pendingNext;

    const nextGain = this.context.createGain();
    nextGain.gain.setValueAtTime(0, endTime);
    nextGain.gain.linearRampToValueAtTime(1, endTime + SWAP_FADE_SECONDS);
    nextGain.connect(this.masterGain);

    const nextSource = this.context.createBufferSource();
    nextSource.buffer = nextBuffer;
    nextSource.connect(nextGain);
    nextSource.start(endTime, nextTrim.start);
    try {
      nextSource.stop(endTime + logicalDuration(nextBuffer, nextTrim));
    } catch {
      /* noop */
    }
    nextSource.onended = () => this.handleBufferSourceEnded(nextSource);

    curSource.onended = () => this.commitPendingSwap(nextSource, nextGain, endTime);

    this.pendingNext.scheduled = true;
    this.pendingNext.scheduledSource = nextSource;
    this.pendingNext.scheduledGain = nextGain;
  }

  private commitPendingSwap(source: AudioBufferSourceNode, gain: GainNode, startTime: number) {
    if (!this.pendingNext) return;
    const { buffer, trim, onSwap } = this.pendingNext;
    this.pendingNext = null;
    this.trackState = {
      mode: "buffer",
      buffer,
      trim,
      isPaused: false,
      pauseOffset: 0,
      playback: { source, gain, scheduledStartContextTime: startTime, startOffsetInTrim: 0 },
    };
    this.setState("playing");
    onSwap();
    this.trySchedulePending(); // au cas où une piste suivante-suivante attendait déjà
  }

  private handleBufferSourceEnded(source: AudioBufferSourceNode) {
    if (this.trackState?.mode !== "buffer" || this.trackState.playback?.source !== source) return;
    this.setState("ended");
    console.warn("[audio] Aucune piste suivante prête à la fin de la piste — repli, coupure possible");
    this.onEndedCallback?.();
  }

  private handleNativeEnded() {
    if (this.trackState?.mode !== "native") return;
    this.setState("ended");
    console.warn("[audio] Fin du flux natif sans piste suivante prête — repli sur rechargement réseau");
    this.onEndedCallback?.();
  }

  /** Annule le swap déjà planifié tout en conservant la piste en attente (buffer/trim/
   *  callback), pour pouvoir la replanifier après un pause()/seek(). */
  private unschedulePending() {
    if (!this.pendingNext) return;
    if (this.pendingNext.scheduledSource) {
      const src = this.pendingNext.scheduledSource;
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* noop */
      }
      try {
        src.disconnect();
      } catch {
        /* noop */
      }
    }
    try {
      this.pendingNext.scheduledGain?.disconnect();
    } catch {
      /* noop */
    }
    this.pendingNext.scheduled = false;
    this.pendingNext.scheduledSource = undefined;
    this.pendingNext.scheduledGain = undefined;

    if (this.trackState?.mode === "buffer" && this.trackState.playback) {
      const src = this.trackState.playback.source;
      src.onended = () => this.handleBufferSourceEnded(src);
    }
  }

  private discardPending() {
    this.unschedulePending();
    this.pendingNext = null;
  }

  private teardownCurrent() {
    this.nativeAudio.pause();
    this.nativeGain.gain.cancelScheduledValues(this.context.currentTime);
    this.nativeGain.gain.setValueAtTime(1, this.context.currentTime);
    this.stopCurrentBufferPlayback();
  }
}

let engine: GaplessEngine | null = null;
export function getGaplessEngine(): GaplessEngine {
  if (!engine) engine = new GaplessEngine();
  return engine;
}
