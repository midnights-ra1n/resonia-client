import { afterEach, describe, expect, it, vi } from "vitest";
import { EndOfStreamError, HttpStatusError, StreamStallError, isTransientStreamError, streamRange } from "./rangeFetcher";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

/** Corps HTTP livré en plusieurs morceaux, comme un flux transcodé à la volée. */
function streamingResponse(status: number, chunks: Uint8Array[], headers: Record<string, string> = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(c));
      controller.close();
    },
  });
  return new Response(body, { status, headers });
}

async function collect(url: string, start: number) {
  const received: number[] = [];
  let total: number | null = null;
  const finished = await streamRange(url, start, new AbortController().signal, {
    onTotal: (t) => {
      total = t;
    },
    onData: async (data) => {
      received.push(...new Uint8Array(data));
      return true;
    },
  });
  return { received, total, finished };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("streamRange — une seule requête lue au fil de l'eau", () => {
  it("206 : transmet le corps et la taille totale annoncée par Content-Range", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamingResponse(206, [bytes(6, 7), bytes(8, 9)], { "Content-Range": "bytes 6-9/10" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await collect("https://x/stream", 6);
    expect(result).toEqual({ received: [6, 7, 8, 9], total: 10, finished: true });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Range: "bytes=6-" }, priority: "low" });
  });

  it("200 sur une reprise (serveur qui ignore Range pendant le transcodage) : saute les octets déjà en cache", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamingResponse(200, [bytes(0, 1, 2, 3), bytes(4, 5, 6, 7, 8, 9)])));

    const result = await collect("https://x/stream", 6);
    expect(result.received).toEqual([6, 7, 8, 9]);
    expect(result.finished).toBe(true);
  });

  it("200 : le Content-Length (estimé pour un flux transcodé) n'est jamais pris pour la taille exacte", async () => {
    // Taille annoncée 100 (estimation `estimateContentLength`), fichier réel de 4 octets.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamingResponse(200, [bytes(0, 1, 2, 3)], { "Content-Length": "100" })),
    );
    const result = await collect("https://x/stream", 0);
    expect(result).toEqual({ received: [0, 1, 2, 3], total: -1, finished: true });
  });

  it("200 sur une reprise au-delà de la fin réelle du fichier : fin de flux", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamingResponse(200, [bytes(0, 1, 2, 3)])));
    await expect(collect("https://x/stream", 6)).rejects.toBeInstanceOf(EndOfStreamError);
  });

  it("416 : fin de flux, jamais retentée", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 416 })));
    const promise = collect("https://x/stream", 10);
    await expect(promise).rejects.toBeInstanceOf(EndOfStreamError);
    expect(isTransientStreamError(new EndOfStreamError())).toBe(false);
  });

  it("4xx : erreur définitive ; 5xx : transitoire", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const err = await collect("https://x/stream", 0).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpStatusError);
    expect(isTransientStreamError(err)).toBe(false);
    expect(isTransientStreamError(new HttpStatusError(503))).toBe(true);
  });

  it("onData qui renvoie false (budget atteint) : arrête la lecture sans erreur", async () => {
    const big = new Uint8Array(300 * 1024);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamingResponse(206, [big, big], { "Content-Range": "bytes 0-614399/614400" })));

    let calls = 0;
    const finished = await streamRange("https://x/stream", 0, new AbortController().signal, {
      onTotal: () => {},
      onData: async () => {
        calls++;
        return false;
      },
    });
    expect(finished).toBe(false);
    expect(calls).toBe(1);
  });

  it("flux qui cesse d'envoyer des octets : abandonné après le délai d'inactivité", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes(1, 2, 3));
            // Plus rien ensuite, sans jamais fermer — seule l'annulation débloque la lecture.
            init.signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
          },
        });
        return Promise.resolve(new Response(body, { status: 206, headers: { "Content-Range": "bytes 0-99/100" } }));
      }),
    );

    const promise = collect("https://x/stream", 0);
    const assertion = expect(promise).rejects.toBeInstanceOf(StreamStallError);
    await vi.advanceTimersByTimeAsync(21_000);
    await assertion;
  });

  it("abandon demandé par l'appelant : remonte un AbortError, jamais retenté", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }),
      ),
    );
    const promise = streamRange("https://x/stream", 0, controller.signal, { onTotal: () => {}, onData: async () => true });
    controller.abort();
    const err = await promise.catch((e: unknown) => e);
    expect((err as Error).name).toBe("AbortError");
    expect(isTransientStreamError(err)).toBe(false);
  });
});
