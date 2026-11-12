import { describe, expect, it } from "vitest";
import { pickSeedArtist } from "./seedArtist";
import type { PlayRecord } from "../stats/listeningHistory";

const NOW = Date.now();
const play = (artistId: string, daysAgo: number, listenedSec = 200): PlayRecord => ({
  serverId: "s", trackId: "t", title: "t", artist: `A${artistId}`, artistId, album: "a",
  duration: 200, startedAt: NOW - daysAgo * 86_400_000, listenedSec,
});

describe("pickSeedArtist", () => {
  it("préfère l'artiste récent à un ancien plus écouté", () => {
    const plays = [play("old", 30), play("old", 30), play("old", 30), play("new", 1)];
    expect(pickSeedArtist(plays, NOW)?.id).toBe("new");
  });
  it("ignore les écoutes sans artiste ou trop anciennes", () => {
    expect(pickSeedArtist([play("x", 100), { ...play("y", 1), artistId: undefined }], NOW)).toBeNull();
  });
});
