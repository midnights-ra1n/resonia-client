import { describe, expect, it } from "vitest";
import { estimateBufferedTime } from "./bufferedTime";

describe("estimateBufferedTime", () => {
  it("uses the player buffer when nothing is cached", () => {
    expect(estimateBufferedTime(42, null, 200, 256)).toBe(42);
  });

  it("converts the cached share of a file of known size to time", () => {
    expect(estimateBufferedTime(10, { bytesCached: 500, totalBytes: 1000, complete: false }, 200, 256)).toBe(100);
  });

  it("estimates a transcoded stream of unknown size from its bitrate", () => {
    // 256 kbps = 32 000 octets/s : 3,2 Mo ≈ 100 s, bien au-delà des ~2 s du tampon natif.
    const progress = { bytesCached: 3_200_000, totalBytes: -1, complete: false };
    expect(estimateBufferedTime(12, progress, 200, 256)).toBeCloseTo(100);
  });

  it("never reports an incomplete transcoded stream as fully loaded", () => {
    const progress = { bytesCached: 10_000_000, totalBytes: -1, complete: false };
    expect(estimateBufferedTime(0, progress, 200, 256)).toBe(196);
  });

  it("reports the whole track once the download is complete", () => {
    expect(estimateBufferedTime(5, { bytesCached: 1, totalBytes: -1, complete: true }, 200, 256)).toBe(200);
  });

  it("keeps the player buffer when it is ahead of the cache", () => {
    expect(estimateBufferedTime(150, { bytesCached: 100, totalBytes: 1000, complete: false }, 200, 256)).toBe(150);
  });

  it("returns 0 for an unknown duration", () => {
    expect(estimateBufferedTime(10, null, 0, 256)).toBe(0);
  });
});
