import { describe, expect, it } from "vitest";
import { DecodedBufferCache, type DecodedTrack } from "./decodedBufferCache";

const MB = 1024 * 1024;

/** Piste factice : seules `length` et `numberOfChannels` servent au calcul de taille. */
function track(megabytes: number): DecodedTrack {
  const length = (megabytes * MB) / 2 / Float32Array.BYTES_PER_ELEMENT;
  return {
    buffer: { length, numberOfChannels: 2 } as AudioBuffer,
    trim: { start: 0, end: 0 } as DecodedTrack["trim"],
  };
}

describe("DecodedBufferCache", () => {
  it("garde au plus 3 pistes", () => {
    const cache = new DecodedBufferCache();
    for (const key of ["a", "b", "c", "d"]) cache.set(key, track(10));
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).not.toBeNull();
    expect(cache.get("d")).not.toBeNull();
  });

  it("évince au-delà du budget mémoire, en gardant toujours courante + suivante", () => {
    const cache = new DecodedBufferCache();
    cache.set("a", track(200));
    cache.set("b", track(200));
    cache.set("c", track(200));
    // 600 Mo > 320 Mo : la plus ancienne part, les 2 plus récentes restent (gapless).
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).not.toBeNull();
    expect(cache.get("c")).not.toBeNull();
  });

  it("ne descend jamais sous 2 pistes, même si elles dépassent seules le budget", () => {
    const cache = new DecodedBufferCache();
    cache.set("long-mix", track(900));
    cache.set("next", track(900));
    expect(cache.get("long-mix")).not.toBeNull();
    expect(cache.get("next")).not.toBeNull();
  });
});
