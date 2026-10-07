import { beforeEach, describe, expect, it, vi } from "vitest";

// Disque simulé : un fichier par clé, partagé entre les imports successifs du module.
const files = new Map<string, Uint8Array>();
vi.mock("../../storage/blobStore", () => ({
  createBlobStore: () => ({
    readAll: async (key: string) => files.get(key)?.slice().buffer ?? null,
    createWriter: async (key: string) => ({
      seek: async () => {},
      write: async (data: ArrayBuffer) => {
        files.set(key, new Uint8Array(data.slice(0)));
      },
      close: async () => {},
    }),
  }),
}));

function sineBuffer(frequency: number, seconds = 2, sampleRate = 44_100): AudioBuffer {
  const data = new Float32Array(seconds * sampleRate);
  for (let i = 0; i < data.length; i++) data[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  return {
    length: data.length,
    sampleRate,
    numberOfChannels: 1,
    duration: seconds,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

function mean(values: Uint8Array): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

describe("waveform — calcul 3 bandes et cache", () => {
  beforeEach(() => {
    files.clear();
    vi.resetModules();
  });

  it("un son grave remplit la bande des graves, un son aigu celle des aigus", async () => {
    const { ensureWaveform, getCachedWaveform } = await import("./waveform");
    await ensureWaveform("bass", sineBuffer(60));
    await ensureWaveform("treble", sineBuffer(8000));

    const bass = getCachedWaveform("bass")!;
    const treble = getCachedWaveform("treble")!;
    expect(mean(bass.low)).toBeGreaterThan(mean(bass.high) * 3);
    expect(mean(treble.high)).toBeGreaterThan(mean(treble.low) * 3);
  });

  it("calculée une seule fois : relue depuis le disque au lancement suivant, sans recalcul", async () => {
    const first = await import("./waveform");
    await first.ensureWaveform("t1", sineBuffer(440));
    expect(files.has("t1")).toBe(true);

    vi.resetModules();
    const second = await import("./waveform");
    const getChannelData = vi.fn();
    await second.ensureWaveform("t1", { ...sineBuffer(440), getChannelData } as unknown as AudioBuffer);
    expect(getChannelData).not.toHaveBeenCalled();
    expect(second.getCachedWaveform("t1")?.bins).toBe(first.getCachedWaveform("t1")?.bins);
  });
});
