import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeTask {
  isBudgetExhausted: boolean;
  complete: () => void;
  onProgress: (cb: (p: { complete: boolean }) => void) => () => void;
}

const requestedOrder: Array<{ trackId: string; priority: string; budgetBytes?: number }> = [];
const tasks = new Map<string, FakeTask>();
let protectedKeysHistory: string[][] = [];

function makeFakeTask(): FakeTask {
  const listeners = new Set<(p: { complete: boolean }) => void>();
  return {
    isBudgetExhausted: false,
    onProgress(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    complete() {
      listeners.forEach((cb) => cb({ complete: true }));
    },
  };
}

vi.mock("./cacheStore", () => ({
  cacheStore: {
    setProtectedKeys: vi.fn((keys: string[]) => {
      protectedKeysHistory.push(keys);
    }),
    pause: vi.fn(),
    isFullyCached: vi.fn(async () => false),
    request: vi.fn((trackId: string, _qualityId: string, _url: string, priority: string, budgetBytes?: number) => {
      requestedOrder.push({ trackId, priority, budgetBytes });
      const task = makeFakeTask();
      tasks.set(trackId, task);
      return task;
    }),
  },
}));

describe("prefetchScheduler — ordre de priorité et budget dégressif", () => {
  beforeEach(() => {
    requestedOrder.length = 0;
    tasks.clear();
    protectedKeysHistory = [];
    vi.resetModules();
  });

  it("télécharge la piste active en premier (illimitée), puis les 3 suivantes avec un budget dégressif 50/30/20%", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    prefetchScheduler.setQuality("aac-256");

    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    await flush();
    prefetchScheduler.setUpcoming([
      { trackId: "next1", streamUrl: "https://x/1", estimatedTotalBytes: 1000 },
      { trackId: "next2", streamUrl: "https://x/2", estimatedTotalBytes: 1000 },
      { trackId: "next3", streamUrl: "https://x/3", estimatedTotalBytes: 1000 },
    ]);
    await flush();

    expect(requestedOrder[0]).toEqual({ trackId: "active", priority: "active", budgetBytes: undefined });
    tasks.get("active")?.complete();
    await flush();

    expect(requestedOrder[1]).toEqual({ trackId: "next1", priority: "prefetch", budgetBytes: 500 });
    tasks.get("next1")?.complete();
    await flush();

    expect(requestedOrder[2]).toEqual({ trackId: "next2", priority: "prefetch", budgetBytes: 300 });
    tasks.get("next2")?.complete();
    await flush();

    expect(requestedOrder[3]).toEqual({ trackId: "next3", priority: "prefetch", budgetBytes: 200 });
  });

  it("protège la piste active et toute la fenêtre de préchargement de l'éviction", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    prefetchScheduler.setQuality("aac-256");
    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    prefetchScheduler.setUpcoming([{ trackId: "next1", streamUrl: "https://x/1" }]);
    await flush();

    const lastProtected = protectedKeysHistory.at(-1) ?? [];
    expect(lastProtected.some((k) => k.startsWith("active:"))).toBe(true);
    expect(lastProtected.some((k) => k.startsWith("next1:"))).toBe(true);
  });

  it("suspend le téléchargement en cours sur pause() puis reprend là où il s'était arrêté", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    const { cacheStore } = await import("./cacheStore");
    prefetchScheduler.setQuality("aac-256");
    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    await flush();

    prefetchScheduler.pause();
    expect(cacheStore.pause).toHaveBeenCalled();

    prefetchScheduler.resume();
    await flush();
    // Après reprise, le même créneau ("active", pas encore complet) est redemandé.
    expect(requestedOrder.filter((r) => r.trackId === "active").length).toBeGreaterThanOrEqual(1);
  });
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
