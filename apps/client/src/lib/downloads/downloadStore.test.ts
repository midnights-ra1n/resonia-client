import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../../stores/playerStore";

const storageState = new Map<string, unknown>();
vi.mock("../storage", () => ({
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

const deletedFiles: string[] = [];
vi.mock("./downloadBlobStore", () => ({
  downloadBlobStore: {
    deleteFile: vi.fn(async (key: string) => {
      deletedFiles.push(key);
    }),
    readAll: vi.fn(async () => null),
    fileSize: vi.fn(async () => 0),
    createWriter: vi.fn(async () => ({ seek: vi.fn(), write: vi.fn(), close: vi.fn() })),
  },
}));

vi.mock("./resolveDownloadSource", () => ({ resolveDownloadSource: vi.fn() }));

class FakeTrackDownloader {
  static instances: FakeTrackDownloader[] = [];
  key: string;
  private progressCbs: Array<(p: { bytesCached: number; totalBytes: number; complete: boolean }) => void> = [];
  private resolveRun: (() => void) | null = null;
  isComplete = false;
  error: Error | null = null;

  constructor(key: string) {
    this.key = key;
    FakeTrackDownloader.instances.push(this);
  }

  onProgress(cb: (p: { bytesCached: number; totalBytes: number; complete: boolean }) => void) {
    this.progressCbs.push(cb);
    return () => {
      this.progressCbs = this.progressCbs.filter((c) => c !== cb);
    };
  }
  onChunk() {
    return () => {};
  }
  run(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveRun = resolve;
    });
  }
  cancel() {}

  /** Simule un palier de progression — `complete` marque la fin des DONNÉES (comme le vrai
   *  `TrackDownloader`, qui émet son dernier événement de progression AVANT de refermer son
   *  writer), sans résoudre `run()` : voir `finishRun`. */
  progress(bytesCached: number, totalBytes: number, complete = false) {
    this.progressCbs.forEach((cb) => cb({ bytesCached, totalBytes, complete }));
    if (complete) this.isComplete = true;
  }

  /** Simule la fin réelle de `run()` (writer refermé) — potentiellement bien après le dernier
   *  `progress(..., complete: true)`, comme une fermeture de fichier lente en conditions
   *  réelles. */
  finishRun() {
    this.resolveRun?.();
  }
}

vi.mock("../audio/cache/trackDownloader", () => ({ TrackDownloader: FakeTrackDownloader }));

function makeTrack(id: string): Track {
  return { id, title: id, artist: "a", album: "b", duration: 100 };
}

describe("downloadStore — file d'attente séquentielle", () => {
  beforeEach(() => {
    storageState.clear();
    deletedFiles.length = 0;
    FakeTrackDownloader.instances.length = 0;
    vi.resetModules();
  });

  it("télécharge une piste à la fois et passe par queued → downloading → downloaded", async () => {
    const { downloadStore } = await import("./downloadStore");

    const statuses: string[] = [];
    downloadStore.onStatusChange("trackA", "aac-256", (s) => statuses.push(s));

    void downloadStore.enqueueTrack(makeTrack("trackA"), "aac-256", "aac", "https://x/a");
    void downloadStore.enqueueTrack(makeTrack("trackB"), "aac-256", "aac", "https://x/b");
    await flush();

    // Une seule piste réellement en téléchargement à la fois.
    expect(FakeTrackDownloader.instances).toHaveLength(1);
    expect(await downloadStore.getStatus("trackA", "aac-256")).toBe("downloading");
    expect(await downloadStore.getStatus("trackB", "aac-256")).toBe("queued");

    const [downloaderA] = FakeTrackDownloader.instances;
    downloaderA.progress(50, 100);
    await flush();
    expect(await downloadStore.getStatus("trackA", "aac-256")).toBe("downloading");

    downloaderA.progress(100, 100, true);
    await flush();

    expect(await downloadStore.getStatus("trackA", "aac-256")).toBe("downloaded");
    expect(statuses).toContain("downloaded");

    // trackB doit maintenant démarrer automatiquement.
    expect(FakeTrackDownloader.instances).toHaveLength(2);
    expect(await downloadStore.getStatus("trackB", "aac-256")).toBe("downloading");

    downloaderA.finishRun();
    await flush();
  });

  it("émet onQueueChange à chaque changement d'état de la file", async () => {
    const { downloadStore } = await import("./downloadStore");
    const events: number[] = [];
    downloadStore.onQueueChange(() => events.push(downloadStore.getPendingItems().length));

    void downloadStore.enqueueTrack(makeTrack("trackA"), "aac-256", "aac", "https://x/a");
    await flush();
    expect(events).toContain(1); // en file d'attente

    const [downloaderA] = FakeTrackDownloader.instances;
    downloaderA.progress(100, 100, true);
    await flush();

    expect(events[events.length - 1]).toBe(0); // plus rien en cours après complétion
    expect(downloadStore.getPendingItems()).toHaveLength(0);

    downloaderA.finishRun();
    await flush();
  });

  it("sort la piste de la liste 'en cours' dès que les données sont complètes, sans attendre la fermeture du writer", async () => {
    // Reproduit le bug observé : une fermeture de writer lente (I/O disque, plugin Tauri fs...)
    // faisait que `task.run()` restait en attente alors que la piste était déjà entièrement
    // téléchargée — elle apparaissait donc À LA FOIS dans "en cours" et dans la liste des
    // téléchargements terminés, indéfiniment tant que `run()` ne se résolvait pas.
    const { downloadStore } = await import("./downloadStore");

    void downloadStore.enqueueTrack(makeTrack("trackA"), "aac-256", "aac", "https://x/a");
    await flush();

    const [downloaderA] = FakeTrackDownloader.instances;
    downloaderA.progress(100, 100, true); // données complètes, mais `run()` ne se résout pas encore
    await flush();

    // La piste doit déjà être considérée téléchargée et hors de la file "en cours"...
    expect(await downloadStore.getStatus("trackA", "aac-256")).toBe("downloaded");
    expect(downloadStore.getPendingItems()).toHaveLength(0);
    const downloaded = await downloadStore.listDownloaded();
    expect(downloaded.map((d) => d.trackId)).toContain("trackA");

    // ...longtemps avant que `run()` (fermeture du writer) ne se résolve enfin.
    downloaderA.finishRun();
    await flush();
    expect(downloadStore.getPendingItems()).toHaveLength(0);
  });

  it("expose des statistiques de campagne (pistes/octets/débit) qui disparaissent une fois la file vidée", async () => {
    const { downloadStore } = await import("./downloadStore");

    expect(downloadStore.getBatchStats()).toBeNull();

    void downloadStore.enqueueTrack(makeTrack("trackA"), "aac-256", "aac", "https://x/a");
    void downloadStore.enqueueTrack(makeTrack("trackB"), "aac-256", "aac", "https://x/b");
    await flush();

    let stats = downloadStore.getBatchStats();
    expect(stats?.totalTracks).toBe(2);
    expect(stats?.completedTracks).toBe(0);
    expect(stats?.totalBytes).toBeGreaterThan(0); // estimation (débit × durée) avant tout header réel

    const [downloaderA] = FakeTrackDownloader.instances;
    downloaderA.progress(50_000, 200_000);
    await flush();
    stats = downloadStore.getBatchStats();
    expect(stats?.downloadedBytes).toBe(50_000);

    downloaderA.progress(200_000, 200_000, true);
    await flush();
    stats = downloadStore.getBatchStats();
    expect(stats?.completedTracks).toBe(1);
    expect(stats?.downloadedBytes).toBe(200_000);

    const [, downloaderB] = FakeTrackDownloader.instances;
    downloaderB.progress(100_000, 100_000, true);
    await flush();

    // File vide : la campagne est terminée, les stats disparaissent.
    expect(downloadStore.getBatchStats()).toBeNull();

    downloaderA.finishRun();
    downloaderB.finishRun();
    await flush();
  });
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
