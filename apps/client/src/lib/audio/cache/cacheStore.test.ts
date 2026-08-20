import { beforeEach, describe, expect, it, vi } from "vitest";

const storageState = new Map<string, unknown>();
vi.mock("../../storage", () => ({
  storage: {
    get: vi.fn(async (key: string) => storageState.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      storageState.set(key, value);
    }),
    remove: vi.fn(async (key: string) => {
      storageState.delete(key);
    }),
  },
}));

const opfsDeleted: string[] = [];
vi.mock("./opfsStore", () => ({
  opfsDelete: vi.fn(async (key: string) => {
    opfsDeleted.push(key);
  }),
  opfsReadAll: vi.fn(async () => null),
}));

class FakeTrackDownloader {
  static instances: FakeTrackDownloader[] = [];
  key: string;
  private progressCbs: Array<(p: { bytesCached: number; totalBytes: number; complete: boolean }) => void> = [];
  ran = false;
  cancelled = false;

  constructor(key: string) {
    this.key = key;
    FakeTrackDownloader.instances.push(this);
  }

  setPriority() {}
  onProgress(cb: (p: { bytesCached: number; totalBytes: number; complete: boolean }) => void) {
    this.progressCbs.push(cb);
    return () => {
      this.progressCbs = this.progressCbs.filter((c) => c !== cb);
    };
  }
  onChunk() {
    return () => {};
  }
  run() {
    this.ran = true;
  }
  pause() {}
  cancel() {
    this.cancelled = true;
  }

  /** Simule la complétion du téléchargement, avec la taille finale donnée. */
  complete(bytesCached: number) {
    this.progressCbs.forEach((cb) => cb({ bytesCached, totalBytes: bytesCached, complete: true }));
  }
}

vi.mock("./trackDownloader", () => ({ TrackDownloader: FakeTrackDownloader }));

describe("cacheStore — éviction LRU", () => {
  beforeEach(async () => {
    storageState.clear();
    opfsDeleted.length = 0;
    FakeTrackDownloader.instances.length = 0;
    vi.resetModules();
  });

  it("évince la piste la moins récemment utilisée quand la limite est dépassée, en épargnant les clés protégées", async () => {
    const { cacheStore } = await import("./cacheStore");
    cacheStore.setMaxBytes(150);

    cacheStore.request("trackA", "aac-256", "https://x/a", "prefetch", 100);
    cacheStore.request("trackB", "aac-256", "https://x/b", "prefetch", 100);
    cacheStore.request("trackC", "aac-256", "https://x/c", "active");

    cacheStore.setProtectedKeys([]); // rien de protégé pour ce test

    const [downloaderA, downloaderB, downloaderC] = FakeTrackDownloader.instances;

    // A se termine en premier (donc la plus ancienne), puis B, puis C — total 100+80+60=240 > 150.
    downloaderA.complete(100);
    await flush();
    downloaderB.complete(80);
    await flush();
    downloaderC.complete(60);
    await flush();

    // A doit avoir été évincée en premier (LRU la plus ancienne), pas B ni C.
    expect(opfsDeleted).toContain(downloaderA.key);
    expect(opfsDeleted).not.toContain(downloaderB.key);
    expect(opfsDeleted).not.toContain(downloaderC.key);
  });

  it("ne touche jamais une clé protégée même si elle est la moins récemment utilisée", async () => {
    const { cacheStore } = await import("./cacheStore");
    cacheStore.setMaxBytes(100);

    cacheStore.request("trackA", "aac-256", "https://x/a", "active");
    const [downloaderA] = FakeTrackDownloader.instances;
    cacheStore.setProtectedKeys([downloaderA.key]);

    downloaderA.complete(100);
    await flush();

    cacheStore.request("trackB", "aac-256", "https://x/b", "prefetch", 80);
    const downloaderB = FakeTrackDownloader.instances[1];
    downloaderB.complete(80);
    await flush();

    // Total 180 > 100, mais trackA est protégée : seule trackB (non protégée) peut être évincée.
    expect(opfsDeleted).not.toContain(downloaderA.key);
    expect(opfsDeleted).toContain(downloaderB.key);
  });
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
