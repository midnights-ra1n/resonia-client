import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlobStore } from "../../storage/blobStore";
import { TrackDownloader } from "./trackDownloader";

/** BlobStore en mémoire : un seul fichier, écritures positionnées comme le vrai backend. */
function memoryStore(initial: number[] = []) {
  let file = Uint8Array.from(initial);
  const store: BlobStore = {
    fileSize: async () => file.byteLength,
    createWriter: async () => {
      let position = 0;
      return {
        seek: async (pos) => {
          position = pos;
        },
        write: async (data) => {
          const chunk = new Uint8Array(data);
          const next = new Uint8Array(Math.max(file.byteLength, position + chunk.byteLength));
          next.set(file);
          next.set(chunk, position);
          file = next;
          position += chunk.byteLength;
        },
        close: async () => {},
      };
    },
    readAll: async () => file.buffer,
    readAsBlob: async () => null,
    deleteFile: async () => {
      file = new Uint8Array();
    },
  };
  return { store, contents: () => Array.from(file) };
}

/** Morceaux livrés un par un à la lecture ; `failAfter` coupe le flux une fois tous livrés. */
function body(chunks: number[][], failAfter = false): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(Uint8Array.from(chunks[index++]));
      else if (failAfter) controller.error(new TypeError("network error"));
      else controller.close();
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("TrackDownloader — flux transcodé à la volée", () => {
  it("serveur qui répond 200 (transcodage en cours) : piste complète en UNE requête", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(body([[0, 1, 2], [3, 4], [5, 6, 7, 8, 9]]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { store, contents } = memoryStore();
    const downloader = new TrackDownloader("k", "https://x/stream", store);

    await downloader.run();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(downloader.progress).toEqual({ bytesCached: 10, totalBytes: 10, complete: true });
    expect(contents()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("coupure en cours de route : reprend à l'octet déjà écrit, sans dupliquer de données", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      // 1re requête : 4 octets puis coupure réseau.
      .mockResolvedValueOnce(new Response(body([[0, 1, 2, 3]], true), { status: 200 }))
      // Reprise : le serveur ignore toujours Range et renvoie le fichier depuis 0.
      .mockResolvedValueOnce(new Response(body([[0, 1, 2, 3, 4, 5], [6, 7, 8, 9]]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { store, contents } = memoryStore();
    const downloader = new TrackDownloader("k", "https://x/stream", store);

    const run = downloader.run();
    await vi.advanceTimersByTimeAsync(1_000); // backoff avant la reprise
    await run;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Range: "bytes=4-" });
    expect(contents()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(downloader.isComplete).toBe(true);
  });

  it("pause() : whenIdle() se résout et la tâche n'est plus en cours", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }),
      ),
    );
    const { store } = memoryStore();
    const downloader = new TrackDownloader("k", "https://x/stream", store);

    const run = downloader.run();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(downloader.isRunning).toBe(true);
    downloader.pause();
    await downloader.whenIdle();
    await run;

    expect(downloader.isRunning).toBe(false);
    expect(downloader.isComplete).toBe(false);
    expect(downloader.error).toBeNull();
  });
});
