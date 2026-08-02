export interface SubsonicAuthParams {
  u: string;
  t: string;
  s: string;
  v: string;
  c: string;
  f?: "json";
}

export interface SubsonicResponseEnvelope<T = unknown> {
  "subsonic-response": {
    status: "ok" | "failed";
    version: string;
    type?: string;
    serverVersion?: string;
    openSubsonic?: boolean;
    error?: { code: number; message: string };
  } & T;
}

export interface AlbumSummary {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  coverArt?: string;
  songCount: number;
  duration: number;
  playCount?: number;
  year?: number;
  genre?: string;
}

export interface ArtistWithAlbumsDTO {
  id: string;
  name: string;
  albumCount: number;
  album?: AlbumSummary[];
}

export interface SongDTO {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  coverArt?: string;
  duration: number;
  track?: number;
}

export interface AlbumWithSongsDTO extends AlbumSummary {
  song: SongDTO[];
}

export interface SongDTO {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  coverArt?: string;
  duration: number;
  track?: number;
  playCount?: number;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  comment?: string;
  owner?: string;
  public?: boolean;
  songCount: number;
  duration: number;
  coverArt?: string;
}

export interface PlaylistWithSongsDTO extends PlaylistSummary {
  entry: SongDTO[];
}
