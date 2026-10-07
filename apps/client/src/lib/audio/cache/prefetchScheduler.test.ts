import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeTask {
  isBudgetExhausted: boolean;
  isRunning: boolean;
  complete: () => void;
  /** Simule un téléchargement qui s'arrête sans finir (pause externe, erreur réseau). */
  stop: () => void;
  whenIdle: () => Promise<void>;
  onProgress: (cb: (p: { complete: boolean }) => void) => () => void;
}

const requestedOrder: Array<{ trackId: string; priority: string; budgetBytes?: number }> = [];
const requestedSegments: Array<number | undefined> = [];
const rangeResumable = new Set<string>();
// Pistes intégralement téléchargées : comme le vrai cache, `isFullyCached` les signale.
const completed = new Set<string>();
const tasks = new Map<string, FakeTask>();
let protectedKeysHistory: string[][] = [];

function makeFakeTask(trackId: string): FakeTask {
  const listeners = new Set<(p: { complete: boolean }) => void>();
  let resolveIdle: () => void = () => {};
  const idle = new Promise<void>((resolve) => {
    resolveIdle = resolve;
  });
  const task: FakeTask = {
    isBudgetExhausted: false,
    isRunning: true,
    onProgress(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    whenIdle: () => idle,
    complete() {
      completed.add(trackId);
      listeners.forEach((cb) => cb({ complete: true }));
      task.isRunning = false;
      resolveIdle();
    },
    stop() {
      task.isRunning = false;
      resolveIdle();
    },
  };
  return task;
}

vi.mock("./cacheStore", () => ({
  cacheStore: {
    setProtectedKeys: vi.fn((keys: string[]) => {
      protectedKeysHistory.push(keys);
    }),
    pause: vi.fn((trackId: string) => tasks.get(trackId)?.stop()),
    setSuspended: vi.fn(),
    isRangeResumable: vi.fn((trackId: string) => rangeResumable.has(trackId)),
    isFullyCached: vi.fn(async (trackId: string) => completed.has(trackId)),
    // Comme le vrai cacheStore : une tâche encore en cours est renvoyée telle quelle (run() no-op),
    // seul un (re)démarrage effectif compte comme une nouvelle requête réseau.
    request: vi.fn((trackId: string, _qualityId: string, _url: string, priority: string, budgetBytes?: number, maxSegments?: number) => {
      const existing = tasks.get(trackId);
      if (existing?.isRunning) return existing;
      requestedOrder.push({ trackId, priority, budgetBytes });
      requestedSegments.push(maxSegments);
      const task = makeFakeTask(trackId);
      tasks.set(trackId, task);
      return task;
    }),
  },
}));

describe("prefetchScheduler — ordre de priorité et budget dégressif", () => {
  beforeEach(() => {
    requestedOrder.length = 0;
    requestedSegments.length = 0;
    rangeResumable.clear();
    completed.clear();
    tasks.clear();
    protectedKeysHistory = [];
    vi.resetModules();
  });

  it("télécharge la piste active en premier, puis les 3 suivantes, toutes intégralement (pas de budget partiel)", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    prefetchScheduler.setQuality("aac-256");

    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    await flush();
    prefetchScheduler.setUpcoming([
      { trackId: "next1", streamUrl: "https://x/1" },
      { trackId: "next2", streamUrl: "https://x/2" },
      { trackId: "next3", streamUrl: "https://x/3" },
    ]);
    await flush();

    expect(requestedOrder[0]).toEqual({ trackId: "active", priority: "active", budgetBytes: undefined });
    tasks.get("active")?.complete();
    await flush();

    expect(requestedOrder[1]).toEqual({ trackId: "next1", priority: "prefetch", budgetBytes: undefined });
    tasks.get("next1")?.complete();
    await flush();

    expect(requestedOrder[2]).toEqual({ trackId: "next2", priority: "prefetch", budgetBytes: undefined });
    tasks.get("next2")?.complete();
    await flush();

    expect(requestedOrder[3]).toEqual({ trackId: "next3", priority: "prefetch", budgetBytes: undefined });
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

  it("pause() suspend en douceur le téléchargement en cours (connexion gardée), resume() le relance sans nouvelle requête", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    const { cacheStore } = await import("./cacheStore");
    prefetchScheduler.setQuality("aac-256");
    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    await flush();

    prefetchScheduler.pause();
    expect(cacheStore.setSuspended).toHaveBeenCalledWith("active", "aac-256", true);
    // Jamais d'abandon : c'est ce qui forçait à tout retélécharger (flux transcodé).
    expect(cacheStore.pause).not.toHaveBeenCalled();
    expect(tasks.get("active")?.isRunning).toBe(true);

    prefetchScheduler.resume();
    await flush();
    expect(cacheStore.setSuspended).toHaveBeenLastCalledWith("active", "aac-256", false);
    expect(requestedOrder.filter((r) => r.trackId === "active")).toHaveLength(1);
  });

  it("pendant une pause, la fin d'un téléchargement ne démarre pas le suivant avant resume()", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    prefetchScheduler.setQuality("aac-256");
    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    prefetchScheduler.setUpcoming([
      { trackId: "next1", streamUrl: "https://x/1" },
      { trackId: "next2", streamUrl: "https://x/2" },
    ]);
    await flush();
    expect(requestedOrder.map((r) => r.trackId)).toEqual(["active", "next1"]);

    prefetchScheduler.pause();
    tasks.get("active")?.complete();
    await flush();
    expect(requestedOrder.map((r) => r.trackId)).toEqual(["active", "next1"]);

    prefetchScheduler.resume();
    await flush();
    expect(requestedOrder.map((r) => r.trackId)).toEqual(["active", "next1", "next2"]);
  });
});

describe("prefetchScheduler — connexions limitées, jamais bloqué", () => {
  beforeEach(() => {
    requestedOrder.length = 0;
    completed.clear();
    tasks.clear();
    protectedKeysHistory = [];
    vi.resetModules();
  });

  it("piste active et suivante téléchargées en parallèle, jamais plus de 2 connexions", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    prefetchScheduler.setQuality("aac-256");
    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    prefetchScheduler.setUpcoming([
      { trackId: "next1", streamUrl: "https://x/1" },
      { trackId: "next2", streamUrl: "https://x/2" },
    ]);
    await flush();

    expect(requestedOrder.map((r) => r.trackId)).toEqual(["active", "next1"]);
    tasks.get("next1")?.complete();
    await flush();
    expect(requestedOrder.map((r) => r.trackId)).toEqual(["active", "next1", "next2"]);
  });

  it("piste active arrivée après le début du préchargement : la 3e connexion cède la place", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    const { cacheStore } = await import("./cacheStore");
    prefetchScheduler.setQuality("aac-256");

    // Ordre réel dans playerStore : setUpcoming (synchrone) puis setActive (après un await).
    prefetchScheduler.setUpcoming([
      { trackId: "next1", streamUrl: "https://x/1" },
      { trackId: "next2", streamUrl: "https://x/2" },
    ]);
    await flush();
    expect(requestedOrder.map((r) => r.trackId)).toEqual(["next1", "next2"]);

    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    await flush();

    expect(cacheStore.pause).toHaveBeenCalledWith("next2", "aac-256");
    expect(tasks.get("next1")?.isRunning).toBe(true);
    expect(requestedOrder.at(-1)?.trackId).toBe("active");
  });

  it("pause() (pression réseau) : plus aucune connexion jusqu'à resume(), même si la file change", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    prefetchScheduler.setQuality("aac-256");
    prefetchScheduler.pause();
    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    await flush();
    expect(requestedOrder).toHaveLength(0);

    prefetchScheduler.resume();
    await flush();
    expect(requestedOrder.map((r) => r.trackId)).toEqual(["active"]);
  });

  it("tâche arrêtée sans finir (erreur, pause externe) : passe à la suivante au lieu d'attendre indéfiniment", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    prefetchScheduler.setQuality("aac-256");
    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    prefetchScheduler.setUpcoming([{ trackId: "next1", streamUrl: "https://x/1" }]);
    await flush();

    tasks.get("active")?.stop();
    await flush();

    expect(requestedOrder.at(-1)?.trackId).toBe("next1");
  });

  it("changement de piste pendant un téléchargement : l'ancienne boucle ne relance rien après coup", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    prefetchScheduler.setQuality("aac-256");
    prefetchScheduler.setActive({ trackId: "old", streamUrl: "https://x/old" });
    await flush();

    prefetchScheduler.stop();
    prefetchScheduler.setActive({ trackId: "new", streamUrl: "https://x/new" });
    await flush();
    const countAfterSwitch = requestedOrder.length;

    tasks.get("new")?.complete();
    await flush();
    // Aucune requête fantôme pour "old" relancée par l'ancienne boucle à son réveil.
    expect(requestedOrder.slice(countAfterSwitch).some((r) => r.trackId === "old")).toBe(false);
  });
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("prefetchScheduler — modes réseau du flux en cours de lecture", () => {
  beforeEach(() => {
    requestedOrder.length = 0;
    requestedSegments.length = 0;
    rangeResumable.clear();
    completed.clear();
    tasks.clear();
    protectedKeysHistory = [];
    vi.resetModules();
  });

  const window3 = [
    { trackId: "next1", streamUrl: "https://x/1" },
    { trackId: "next2", streamUrl: "https://x/2" },
  ];

  it("« shared » (flux lu encore en téléchargement) : une seule connexion, sans plages parallèles", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    prefetchScheduler.setQuality("aac-256");
    prefetchScheduler.setNetworkMode("exclusive");
    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    prefetchScheduler.setUpcoming(window3);
    await flush();
    expect(requestedOrder).toHaveLength(0);

    prefetchScheduler.setNetworkMode("shared");
    await flush();
    expect(requestedOrder.map((r) => r.trackId)).toEqual(["active"]);
    expect(requestedSegments).toEqual([1]);
  });

  it("« free » : deux connexions en parallèle, plages parallèles autorisées", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    prefetchScheduler.setQuality("aac-256");
    prefetchScheduler.setNetworkMode("shared");
    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    prefetchScheduler.setUpcoming(window3);
    await flush();

    prefetchScheduler.setNetworkMode("free");
    await flush();
    expect(requestedOrder.map((r) => r.trackId)).toEqual(["active", "next1"]);
    expect(requestedSegments.at(-1)).toBe(3);
  });

  it("« exclusive » : coupe net un fichier à plages (reprise bon marché), suspend un flux transcodé", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    const { cacheStore } = await import("./cacheStore");
    prefetchScheduler.setQuality("aac-256");
    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    prefetchScheduler.setUpcoming(window3);
    await flush();
    rangeResumable.add("next1");

    prefetchScheduler.setNetworkMode("exclusive");
    expect(cacheStore.pause).toHaveBeenCalledWith("next1", "aac-256");
    expect(cacheStore.setSuspended).toHaveBeenCalledWith("active", "aac-256", true);
    expect(cacheStore.pause).not.toHaveBeenCalledWith("active", "aac-256");

    // Retour au calme : la piste coupée est redemandée, la suspendue reprend sans nouvelle requête.
    prefetchScheduler.setNetworkMode("free");
    await flush();
    expect(requestedOrder.filter((r) => r.trackId === "next1")).toHaveLength(2);
    expect(requestedOrder.filter((r) => r.trackId === "active")).toHaveLength(1);
  });
});

describe("prefetchScheduler — priorité aux pages (web, une seule connexion HTTP/2)", () => {
  beforeEach(() => {
    requestedOrder.length = 0;
    requestedSegments.length = 0;
    rangeResumable.clear();
    completed.clear();
    tasks.clear();
    protectedKeysHistory = [];
    vi.resetModules();
  });

  it("une requête de page cède le réseau, le préchargement reprend une fois la page chargée", async () => {
    const { prefetchScheduler } = await import("./prefetchScheduler");
    const { cacheStore } = await import("./cacheStore");
    const { trackForegroundRequest } = await import("../../network/foregroundActivity");
    prefetchScheduler.setQuality("aac-256");
    prefetchScheduler.setActive({ trackId: "active", streamUrl: "https://x/active" });
    prefetchScheduler.setUpcoming([{ trackId: "next1", streamUrl: "https://x/1" }]);
    await flush();
    rangeResumable.add("active");

    let finishPage: () => void = () => {};
    trackForegroundRequest(new Promise<void>((resolve) => (finishPage = resolve)));
    expect(cacheStore.pause).toHaveBeenCalledWith("active", "aac-256");

    finishPage();
    await flush();
    // Toujours en pause pendant le délai de grâce (la page enchaîne souvent d'autres requêtes).
    expect(requestedOrder.filter((r) => r.trackId === "active")).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 600));
    await flush();
    expect(requestedOrder.filter((r) => r.trackId === "active")).toHaveLength(2);
  });
});
