import type { NavidromeSong } from "@resonia/api-client";
import type { PlayRecord } from "./listeningHistory";

export interface Ranked {
  id: string;
  name: string;
  sub?: string;
  /** Lien vers la fiche (album, artiste). */
  to?: string;
  plays: number;
  seconds: number;
}

export type Period = "week" | "month" | "all";

const DAY_MS = 86_400_000;
const TOP_COUNT = 10;
// Passé : écouté moins de 30 s (ou moins de la moitié d'un titre plus court).
const SKIP_MAX_SEC = 30;

/** Jour calendaire local en nombre entier : deux jours consécutifs diffèrent de 1, changement
 *  d'heure compris. */
export function dayIndex(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
}

function rank<T>(items: T[], key: (item: T) => Omit<Ranked, "plays" | "seconds"> | null, weight: (item: T) => { plays: number; seconds: number }): Ranked[] {
  const byId = new Map<string, Ranked>();
  for (const item of items) {
    const base = key(item);
    if (!base) continue;
    const { plays, seconds } = weight(item);
    const entry = byId.get(base.id);
    if (entry) {
      entry.plays += plays;
      entry.seconds += seconds;
    } else byId.set(base.id, { ...base, plays, seconds });
  }
  return [...byId.values()];
}

const byPlays = (a: Ranked, b: Ranked) => b.plays - a.plays || b.seconds - a.seconds;
const bySeconds = (a: Ranked, b: Ranked) => b.seconds - a.seconds || b.plays - a.plays;

/** Statistiques serveur : compteurs Navidrome (toutes applications et tous appareils confondus).
 *  `songs` = titres écoutés au moins une fois. */
export function computeServerStats(songs: NavidromeSong[], librarySongCount: number | null) {
  const weight = (s: NavidromeSong) => ({ plays: s.playCount ?? 0, seconds: (s.playCount ?? 0) * (s.duration ?? 0) });
  const totalPlays = songs.reduce((sum, s) => sum + (s.playCount ?? 0), 0);
  const totalSec = songs.reduce((sum, s) => sum + weight(s).seconds, 0);

  const topSongs = rank(songs, (s) => ({ id: s.id, name: s.title, sub: s.artist, to: `/albums/${s.albumId}` }), weight).sort(byPlays);
  const artists = rank(
    songs,
    (s) => (s.artist ? { id: s.artistId ?? s.artist, name: s.artist, to: s.artistId ? `/artists/${s.artistId}` : undefined } : null),
    weight,
  ).sort(byPlays);
  const albums = rank(
    songs,
    (s) => (s.album ? { id: s.albumId, name: s.album, sub: s.artist, to: `/albums/${s.albumId}` } : null),
    weight,
  ).sort(byPlays);
  const genres = rank(songs, (s) => (s.genre ? { id: s.genre, name: s.genre } : null), weight).sort(byPlays);
  const decades = rank(
    songs,
    (s) => (s.year ? { id: String(Math.floor(s.year / 10) * 10), name: `${Math.floor(s.year / 10) * 10}s` } : null),
    weight,
  ).sort((a, b) => Number(a.id) - Number(b.id));
  const formats = rank(songs, (s) => (s.suffix ? { id: s.suffix, name: s.suffix.toUpperCase() } : null), weight).sort(byPlays);
  const lastPlayedAt = songs.reduce((max, s) => Math.max(max, s.playDate ? Date.parse(s.playDate) || 0 : 0), 0);

  return {
    totalPlays,
    totalSec,
    distinctSongs: songs.length,
    coverage: librarySongCount ? songs.length / librarySongCount : null,
    distinctArtists: artists.length,
    distinctAlbums: albums.length,
    topSongs: topSongs.slice(0, TOP_COUNT),
    topArtists: artists.slice(0, TOP_COUNT),
    topAlbums: albums.slice(0, TOP_COUNT),
    genres: genres.slice(0, TOP_COUNT),
    decades,
    formats,
    lastPlayedAt: lastPlayedAt || null,
  };
}

export type ServerStats = ReturnType<typeof computeServerStats>;

/** Séries consécutives de jours d'écoute : en cours (jusqu'à aujourd'hui ou hier) et record. */
function streaks(plays: PlayRecord[], now: number): { current: number; longest: number } {
  const days = [...new Set(plays.map((p) => dayIndex(p.startedAt)))].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const today = dayIndex(now);
  const last = days.at(-1);
  const current = last !== undefined && today - last <= 1 ? run : 0;
  return { current, longest };
}

/** Statistiques locales sur une période. La chronologie compte en jours (7 ou 30 derniers) ou,
 *  pour « tout », en mois (12 derniers). */
export function computeLocalStats(allPlays: PlayRecord[], period: Period, now: number) {
  const today = dayIndex(now);
  const dayCount = period === "week" ? 7 : period === "month" ? 30 : 0;
  const plays = dayCount ? allPlays.filter((p) => dayIndex(p.startedAt) > today - dayCount) : allPlays;
  const weight = (p: PlayRecord) => ({ plays: 1, seconds: p.listenedSec });

  const totalSec = plays.reduce((sum, p) => sum + p.listenedSec, 0);
  const skipped = plays.filter((p) => p.listenedSec < Math.min(SKIP_MAX_SEC, p.duration / 2)).length;
  const activeDays = new Set(plays.map((p) => dayIndex(p.startedAt))).size;

  const hours = new Array<number>(24).fill(0);
  // Lundi en premier.
  const weekdays = new Array<number>(7).fill(0);
  for (const p of plays) {
    const d = new Date(p.startedAt);
    // shortcut: une écoute est comptée entièrement à son heure de début.
    hours[d.getHours()] += p.listenedSec;
    weekdays[(d.getDay() + 6) % 7] += p.listenedSec;
  }

  let timeline: { start: number; seconds: number }[];
  if (dayCount) {
    timeline = Array.from({ length: dayCount }, (_, i) => ({ start: (today - dayCount + 1 + i) * DAY_MS, seconds: 0 }));
    for (const p of plays) {
      const bucket = timeline[dayIndex(p.startedAt) - (today - dayCount + 1)];
      if (bucket) bucket.seconds += p.listenedSec; // horloge reculée : écoute « future » ignorée
    }
  } else {
    const ref = new Date(now);
    timeline = Array.from({ length: 12 }, (_, i) => ({
      start: new Date(ref.getFullYear(), ref.getMonth() - 11 + i, 1).getTime(),
      seconds: 0,
    }));
    for (const p of plays) {
      const d = new Date(p.startedAt);
      const i = 11 - ((ref.getFullYear() - d.getFullYear()) * 12 + ref.getMonth() - d.getMonth());
      if (i >= 0) timeline[i].seconds += p.listenedSec;
    }
  }

  return {
    totalSec,
    plays: plays.length,
    distinctTracks: new Set(plays.map((p) => p.trackId)).size,
    distinctArtists: new Set(plays.map((p) => p.artistId ?? p.artist)).size,
    skipRate: plays.length ? skipped / plays.length : 0,
    activeDays,
    avgPerActiveDaySec: activeDays ? totalSec / activeDays : 0,
    timeline,
    hours,
    weekdays,
    topTracks: rank(plays, (p) => ({ id: p.trackId, name: p.title, sub: p.artist, to: p.albumId ? `/albums/${p.albumId}` : undefined }), weight)
      .sort(bySeconds)
      .slice(0, TOP_COUNT),
    topArtists: rank(
      plays,
      (p) => (p.artist ? { id: p.artistId ?? p.artist, name: p.artist, to: p.artistId ? `/artists/${p.artistId}` : undefined } : null),
      weight,
    )
      .sort(bySeconds)
      .slice(0, TOP_COUNT),
    topAlbums: rank(
      plays,
      (p) => (p.album ? { id: p.albumId ?? p.album, name: p.album, sub: p.artist, to: p.albumId ? `/albums/${p.albumId}` : undefined } : null),
      weight,
    )
      .sort(bySeconds)
      .slice(0, TOP_COUNT),
    streak: streaks(allPlays, now),
    firstPlayAt: allPlays.reduce((min, p) => Math.min(min, p.startedAt), Infinity),
  };
}

export type LocalStats = ReturnType<typeof computeLocalStats>;
