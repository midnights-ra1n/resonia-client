import { describe, expect, it } from "vitest";
import { estimateBufferedRanges, mergeRanges, sameRanges } from "./bufferedTime";

describe("mergeRanges", () => {
  it("sorts, merges overlapping or adjacent ranges and drops empty ones", () => {
    expect(mergeRanges([[50, 60], [0, 10], [9, 20], [30, 30], [20.1, 25]])).toEqual([[0, 25], [50, 60]]);
  });

  it("does not mutate its input", () => {
    const input: [number, number][] = [[0, 10], [5, 20]];
    mergeRanges(input);
    expect(input).toEqual([[0, 10], [5, 20]]);
  });
});

describe("estimateBufferedRanges", () => {
  it("uses the player buffer when nothing is cached", () => {
    expect(estimateBufferedRanges([[0, 42]], null, 200, 256)).toEqual([[0, 42]]);
  });

  it("keeps disjoint player ranges after a seek", () => {
    expect(estimateBufferedRanges([[0, 30], [120, 140]], null, 200, 256)).toEqual([[0, 30], [120, 140]]);
  });

  it("converts the cached share of a file of known size to time", () => {
    const progress = { bytesCached: 500, totalBytes: 1000, complete: false };
    expect(estimateBufferedRanges([[0, 10]], progress, 200, 256)).toEqual([[0, 100]]);
  });

  it("unions the cache prefix with a player range further ahead", () => {
    const progress = { bytesCached: 250, totalBytes: 1000, complete: false };
    expect(estimateBufferedRanges([[120, 140]], progress, 200, 256)).toEqual([[0, 50], [120, 140]]);
  });

  it("estimates a transcoded stream of unknown size from its bitrate", () => {
    // 256 kbps = 32 000 octets/s : 3,2 Mo ≈ 100 s.
    const [[start, end]] = estimateBufferedRanges([], { bytesCached: 3_200_000, totalBytes: -1, complete: false }, 200, 256);
    expect(start).toBe(0);
    expect(end).toBeCloseTo(100);
  });

  it("never reports an incomplete transcoded stream as fully loaded", () => {
    const progress = { bytesCached: 10_000_000, totalBytes: -1, complete: false };
    expect(estimateBufferedRanges([], progress, 200, 256)).toEqual([[0, 196]]);
  });

  it("reports the whole track once the download is complete", () => {
    expect(estimateBufferedRanges([], { bytesCached: 1, totalBytes: -1, complete: true }, 200, 256)).toEqual([[0, 200]]);
  });

  it("clamps player ranges to the duration", () => {
    expect(estimateBufferedRanges([[190, 260]], null, 200, 256)).toEqual([[190, 200]]);
  });

  it("returns nothing for an unknown duration", () => {
    expect(estimateBufferedRanges([[0, 10]], null, 0, 256)).toEqual([]);
  });
});

describe("sameRanges", () => {
  it("ignores sub-epsilon jitter but not a new range", () => {
    expect(sameRanges([[0, 10]], [[0, 10.01]])).toBe(true);
    expect(sameRanges([[0, 10]], [[0, 10], [50, 60]])).toBe(false);
  });
});
