import type { PlayRecord } from "../stats/listeningHistory";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 60;
// Une écoute pèse moitié moins après une semaine : les goûts du moment l'emportent.
const HALF_LIFE_DAYS = 7;

/** Artiste « du moment » d'après l'historique local : somme, par artiste, de la part réellement
 *  écoutée de chaque titre, pondérée par la fraîcheur. Un seul passage, aucune dépendance. */
export function pickSeedArtist(plays: PlayRecord[], now = Date.now()): { id: string; name: string } | null {
  const scores = new Map<string, { name: string; score: number }>();
  for (const p of plays) {
    const ageDays = (now - p.startedAt) / DAY_MS;
    if (!p.artistId || ageDays > WINDOW_DAYS) continue;
    const share = p.duration > 0 ? Math.min(p.listenedSec / p.duration, 1) : 0.5;
    const entry = scores.get(p.artistId) ?? { name: p.artist, score: 0 };
    entry.score += share * 0.5 ** (ageDays / HALF_LIFE_DAYS);
    scores.set(p.artistId, entry);
  }
  let best: { id: string; name: string; score: number } | null = null;
  for (const [id, { name, score }] of scores) if (!best || score > best.score) best = { id, name, score };
  return best && { id: best.id, name: best.name };
}
