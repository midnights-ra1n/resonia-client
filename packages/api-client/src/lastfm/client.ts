export interface LastfmTopTrack {
  name: string;
  playcount: number;
  listeners: number;
}

interface LastfmTopTracksResponse {
  toptracks?: { track?: Array<{ name: string; playcount: string; listeners: string }> };
  error?: number;
  message?: string;
}

/** Nécessite une clé API Last.fm gratuite (last.fm/api/account/create), pas d'OAuth requis. */
export async function getLastfmTopTracks(artistName: string, apiKey: string, limit = 10): Promise<LastfmTopTrack[]> {
  const params = new URLSearchParams({
    method: "artist.gettoptracks",
    artist: artistName,
    api_key: apiKey,
    format: "json",
    autocorrect: "1",
    limit: String(limit),
  });

  const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Échec de la récupération Last.fm (${response.status})`);
  }

  const data = (await response.json()) as LastfmTopTracksResponse;
  if (data.error) {
    throw new Error(data.message ?? "Erreur Last.fm inconnue");
  }

  return (data.toptracks?.track ?? []).map((t) => ({
    name: t.name,
    playcount: Number(t.playcount),
    listeners: Number(t.listeners),
  }));
}
