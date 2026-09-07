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

export interface RecordLabel {
  name: string;
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
  copyright?: string;
  recordLabels?: RecordLabel[];
}

export interface ArtistWithAlbumsDTO {
  id: string;
  name: string;
  albumCount: number;
  coverArt?: string;
  album?: AlbumSummary[];
}

export interface ArtistSummary {
  id: string;
  name: string;
  coverArt?: string;
  albumCount?: number;
}

export interface SearchResult3DTO {
  song: SongDTO[];
  album: AlbumSummary[];
  artist: ArtistSummary[];
}

export interface SongDTO {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  coverArt?: string;
  duration: number;
  track?: number;
  playCount?: number;
  year?: number;
  copyright?: string;
  suffix?: string;
  bitRate?: number;
  /** Présent (date ISO) si le titre est marqué favori sur le serveur ; absent sinon. */
  starred?: string;
}

export interface AlbumWithSongsDTO extends AlbumSummary {
  song: SongDTO[];
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