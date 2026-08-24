import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRange } from "./rangeFetcher";

function jsonHeaders(init: Record<string, string> = {}): Headers {
  return new Headers(init);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRange — reprise face à un serveur qui ignore les Range", () => {
  it("premier appel (start=0) : la réponse 200 complète est utilisée telle quelle", async () => {
    const body = new Uint8Array(10).map((_, i) => i).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        headers: jsonHeaders(),
        arrayBuffer: async () => body,
      }),
    );

    const chunk = await fetchRange("https://x/stream", 0, new AbortController().signal, 4);
    expect(new Uint8Array(chunk.data)).toEqual(new Uint8Array(body));
    expect(chunk.totalBytes).toBe(10);
  });

  it("reprise (start>0) avec un 200 (fichier complet depuis 0) : découpe le bon segment au lieu de dupliquer tout le fichier", async () => {
    // Le fichier complet fait 10 octets [0..9]. On reprend à start=6 (ex: après une pause
    // de prefetch), taille de chunk 4 — on doit récupérer exactement [6,7,8,9], jamais le
    // fichier entier réinjecté à la position d'écriture courante (ce qui corromprait le
    // cache OPFS et causerait un saut audible au décodage).
    const body = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        headers: jsonHeaders(),
        arrayBuffer: async () => body,
      }),
    );

    const chunk = await fetchRange("https://x/stream", 6, new AbortController().signal, 4);
    expect(new Uint8Array(chunk.data)).toEqual(new Uint8Array([6, 7, 8, 9]));
    expect(chunk.totalBytes).toBe(10);
  });

  it("reprise au-delà de la fin réelle du fichier (start >= taille totale) : traité comme fin de flux", async () => {
    const body = new Uint8Array([0, 1, 2, 3]).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        headers: jsonHeaders(),
        arrayBuffer: async () => body,
      }),
    );

    await expect(fetchRange("https://x/stream", 4, new AbortController().signal, 4)).rejects.toThrow(
      /fin de flux/i,
    );
  });

  it("206 classique (serveur supportant Range) : comportement inchangé", async () => {
    const chunkBody = new Uint8Array([6, 7, 8, 9]).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 206,
        headers: jsonHeaders({ "Content-Range": "bytes 6-9/10" }),
        arrayBuffer: async () => chunkBody,
      }),
    );

    const chunk = await fetchRange("https://x/stream", 6, new AbortController().signal, 4);
    expect(new Uint8Array(chunk.data)).toEqual(new Uint8Array([6, 7, 8, 9]));
    expect(chunk.totalBytes).toBe(10);
  });
});
