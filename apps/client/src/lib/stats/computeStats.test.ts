import { describe, expect, it } from "vitest";
import type { NavidromeSong } from "@resonia/api-client";
import { computeLocalStats, computeServerStats } from "./computeStats";
import type { PlayRecord } from "./listeningHistory";

const NOW = new Date(2026, 9, 22, 18, 0).getTime();
const at = (daysAgo: number, hour = 12) => new Date(2026, 9, 22 - daysAgo, hour).getTime();

function play(overrides: Partial<PlayRecord>): PlayRecord {
  return {
    serverId: "s",
    trackId: "t1",
    title: "T1",
    artist: "A",
    artistId: "a",
    album: "Al",
    albumId: "al",
    duration: 200,
    startedAt: at(0),
    listenedSec: 200,
    ...overrides,
  };
}

describe("computeServerStats", () => {
  const songs: NavidromeSong[] = [
    { id: "1", albumId: "x", title: "One", artist: "A", artistId: "a", album: "X", duration: 100, playCount: 3, year: 1994, genre: "Rock", suffix: "flac" },
    { id: "2", albumId: "y", title: "Two", artist: "B", artistId: "b", album: "Y", duration: 200, playCount: 5, year: 2003, genre: "Pop", suffix: "mp3" },
    { id: "3", albumId: "x", title: "Three", artist: "A", artistId: "a", album: "X", duration: 60, playCount: 4, year: 1995, genre: "Rock", suffix: "flac" },
  ];

  it("sums plays and listening time from the server counters", () => {
    const stats = computeServerStats(songs, 30);
    expect(stats.totalPlays).toBe(12);
    expect(stats.totalSec).toBe(3 * 100 + 5 * 200 + 4 * 60);
    expect(stats.coverage).toBeCloseTo(0.1);
  });

  it("ranks artists, albums and genres by plays across their songs", () => {
    const stats = computeServerStats(songs, null);
    expect(stats.topSongs[0].name).toBe("Two");
    expect(stats.topArtists.map((a) => [a.name, a.plays])).toEqual([["A", 7], ["B", 5]]);
    expect(stats.topAlbums[0]).toMatchObject({ name: "X", plays: 7 });
    expect(stats.genres[0]).toMatchObject({ name: "Rock", plays: 7 });
    expect(stats.decades.map((d) => d.name)).toEqual(["1990s", "2000s"]);
    expect(stats.coverage).toBeNull();
  });
});

describe("computeLocalStats", () => {
  it("keeps only the period and buckets listening time per day", () => {
    const plays = [play({ startedAt: at(0), listenedSec: 100 }), play({ startedAt: at(2), listenedSec: 50 }), play({ startedAt: at(10) })];
    const stats = computeLocalStats(plays, "week", NOW);
    expect(stats.plays).toBe(2);
    expect(stats.totalSec).toBe(150);
    expect(stats.timeline).toHaveLength(7);
    expect(stats.timeline[6].seconds).toBe(100);
    expect(stats.timeline[4].seconds).toBe(50);
    expect(stats.hours[12]).toBe(150);
  });

  it("counts short listens as skips", () => {
    const stats = computeLocalStats([play({ listenedSec: 10 }), play({ listenedSec: 180 })], "all", NOW);
    expect(stats.skipRate).toBe(0.5);
  });

  it("tracks the current and longest streak of listening days", () => {
    const plays = [at(1), at(2), at(5), at(6), at(7), at(8)].map((startedAt) => play({ startedAt }));
    expect(computeLocalStats(plays, "all", NOW).streak).toEqual({ current: 2, longest: 4 });
    expect(computeLocalStats([play({ startedAt: at(3) })], "all", NOW).streak.current).toBe(0);
  });

  it("groups everything per month over the last year", () => {
    const stats = computeLocalStats([play({ startedAt: new Date(2026, 7, 3).getTime(), listenedSec: 60 })], "all", NOW);
    expect(stats.timeline).toHaveLength(12);
    expect(stats.timeline[9].seconds).toBe(60);
  });
});
