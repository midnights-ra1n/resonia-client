/** Fakes minimalistes du Web Audio API (absent de jsdom) pour tester la logique de
 *  planification du moteur gapless sans navigateur réel. On ne simule aucun rendu audio :
 *  on se contente d'enregistrer fidèlement les appels (start/stop/gain) pour vérifier
 *  que la planification est sample-accurate, et de permettre de déclencher "onended"
 *  manuellement pour simuler l'écoulement du temps. */

export class FakeAudioParam {
  value = 0;
  events: Array<{ type: "set" | "ramp" | "cancel"; value: number; time: number }> = [];

  setValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ type: "set", value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.events.push({ type: "ramp", value, time });
    return this;
  }

  cancelScheduledValues(time: number): this {
    this.events.push({ type: "cancel", value: 0, time });
    return this;
  }
}

class FakeAudioNode {
  connect(): FakeAudioNode {
    return this;
  }
  disconnect(): void {}
}

export class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

export class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  startCall: { when: number; offset: number } | null = null;
  stopCall: { when: number } | null = null;

  start(when = 0, offset = 0): void {
    this.startCall = { when, offset };
  }

  stop(when = 0): void {
    this.stopCall = { when };
  }
}

export function makeFakeAudioBuffer(duration: number, sampleRate = 44100, channels = 2, fill: (i: number) => number = () => 0.5): AudioBuffer {
  const length = Math.max(1, Math.round(duration * sampleRate));
  const channelData: Float32Array[] = Array.from({ length: channels }, () => {
    const arr = new Float32Array(length);
    for (let i = 0; i < length; i++) arr[i] = fill(i);
    return arr;
  });
  return {
    duration,
    sampleRate,
    length,
    numberOfChannels: channels,
    getChannelData: (ch: number) => channelData[ch],
  } as unknown as AudioBuffer;
}

export class FakeAudioContext {
  currentTime = 0;
  state: "running" | "suspended" | "closed" = "running";
  sampleRate = 44100;
  destination = new FakeAudioNode();

  // Historique des noeuds créés, dans l'ordre — permet aux tests d'inspecter exactement
  // ce que le moteur a planifié sans exposer son état interne privé.
  createdSources: FakeAudioBufferSourceNode[] = [];
  createdGains: FakeGainNode[] = [];

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.createdGains.push(node);
    return node;
  }

  createBufferSource(): FakeAudioBufferSourceNode {
    const node = new FakeAudioBufferSourceNode();
    this.createdSources.push(node);
    return node;
  }

  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    return makeFakeAudioBuffer(length / sampleRate, sampleRate, channels);
  }

  createMediaElementSource(): FakeAudioNode {
    return new FakeAudioNode();
  }

  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }

  decodeAudioData(): Promise<AudioBuffer> {
    return Promise.resolve(makeFakeAudioBuffer(1, 44100, 2));
  }
}

/** HTMLAudioElement minimal : jsdom fournit `Audio`/`HTMLMediaElement` mais leur play()
 *  n'est pas implémenté (rejette systématiquement) — on fournit notre propre stub
 *  contrôlable, en étendant `EventTarget` pour que les vrais `addEventListener` du
 *  moteur fonctionnent tels quels. */
export class FakeAudioElement extends EventTarget {
  preload = "";
  crossOrigin: string | null = null;
  src = "";
  currentTime = 0;
  duration = NaN;
  paused = true;

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }
}

export function installWebAudioMocks() {
  // @ts-expect-error -- stub global pour les tests, pas une implémentation complète du DOM.
  globalThis.AudioContext = FakeAudioContext;
  // @ts-expect-error -- idem.
  globalThis.Audio = FakeAudioElement;
}
