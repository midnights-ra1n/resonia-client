export interface SilenceTrim {
  start: number;
  end: number;
}

const NO_TRIM: SilenceTrim = { start: 0, end: 0 };

class AudioEngine {
  readonly context: AudioContext;
  private gainNode: GainNode;
  private currentSource: AudioBufferSourceNode | null = null;
  private nextSource: AudioBufferSourceNode | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private trimStart = 0;
  private trimEnd = 0;
  private trackStartContextTime = 0;
  private pauseOffset = 0;
  private isPaused = true;
  private onEndedCallback: (() => void) | null = null;

  constructor() {
    this.context = new AudioContext();
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);
  }

  setVolume(v: number) {
    this.gainNode.gain.value = v;
  }

  async decode(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return this.context.decodeAudioData(arrayBuffer.slice(0));
  }

  get currentTime(): number {
    if (this.isPaused || !this.currentBuffer) return this.pauseOffset;
    return this.pauseOffset + (this.context.currentTime - this.trackStartContextTime);
  }

  /** Durée "logique" (padding de l'encodeur exclu). */
  get duration(): number {
    if (!this.currentBuffer) return 0;
    return Math.max(this.currentBuffer.duration - this.trimStart - this.trimEnd, 0);
  }

  onEnded(cb: () => void) {
    this.onEndedCallback = cb;
  }

  private createSource(buffer: AudioBuffer): AudioBufferSourceNode {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);
    return source;
  }

  play(buffer: AudioBuffer, trim: SilenceTrim = NO_TRIM, offset = 0) {
    if (this.context.state === "suspended") this.context.resume();

    this.stopCurrent();
    this.currentBuffer = buffer;
    this.trimStart = trim.start;
    this.trimEnd = trim.end;
    this.pauseOffset = offset;
    this.isPaused = false;

    const logicalDuration = Math.max(buffer.duration - trim.start - trim.end, 0);
    const rawOffset = trim.start + offset;

    const source = this.createSource(buffer);
    source.start(0, rawOffset);
    try {
      source.stop(this.context.currentTime + Math.max(logicalDuration - offset, 0));
    } catch { }

    source.onended = () => {
      if (source === this.currentSource) this.onEndedCallback?.();
    };

    this.currentSource = source;
    this.trackStartContextTime = this.context.currentTime;
  }

  pause() {
    if (this.isPaused) return;
    this.pauseOffset = this.currentTime;
    this.isPaused = true;
    this.stopCurrent(false);
  }

  resume() {
    if (!this.isPaused || !this.currentBuffer) return;
    this.play(this.currentBuffer, { start: this.trimStart, end: this.trimEnd }, this.pauseOffset);
  }

  seek(time: number) {
    if (!this.currentBuffer) return;
    const clamped = Math.max(0, Math.min(time, this.duration));
    if (this.isPaused) {
      this.pauseOffset = clamped;
    } else {
      this.play(this.currentBuffer, { start: this.trimStart, end: this.trimEnd }, clamped);
    }
  }

  scheduleGapless(nextBuffer: AudioBuffer, nextTrim: SilenceTrim, onSwap: () => void) {
    if (!this.currentSource || !this.currentBuffer) return;

    const remaining = Math.max(this.duration - this.currentTime, 0);
    const startAt = this.context.currentTime + remaining;
    const nextLogicalDuration = Math.max(nextBuffer.duration - nextTrim.start - nextTrim.end, 0);

    const source = this.createSource(nextBuffer);
    source.start(startAt, nextTrim.start);
    try {
      source.stop(startAt + nextLogicalDuration);
    } catch { }

    this.nextSource = source;

    setTimeout(() => {
      if (this.nextSource !== source) return;
      this.currentSource = source;
      this.currentBuffer = nextBuffer;
      this.trimStart = nextTrim.start;
      this.trimEnd = nextTrim.end;
      this.pauseOffset = 0;
      this.trackStartContextTime = startAt;
      this.nextSource = null;
      onSwap();

      source.onended = () => {
        if (source === this.currentSource) this.onEndedCallback?.();
      };
    }, remaining * 1000);
  }

  cancelScheduled() {
    if (this.nextSource) {
      this.nextSource.onended = null;
      try {
        this.nextSource.stop();
      } catch { }
      this.nextSource = null;
    }
  }

  private stopCurrent(clearRef = true) {
    this.cancelScheduled();
    if (this.currentSource) {
      this.currentSource.onended = null;
      try {
        this.currentSource.stop();
      } catch { }
      if (clearRef) this.currentSource = null;
    }
  }

  stop() {
    this.stopCurrent();
    this.currentBuffer = null;
    this.trimStart = 0;
    this.trimEnd = 0;
    this.pauseOffset = 0;
    this.isPaused = true;
  }
}

let engine: AudioEngine | null = null;
export function getAudioEngine(): AudioEngine {
  if (!engine) engine = new AudioEngine();
  return engine;
}
