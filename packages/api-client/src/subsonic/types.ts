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
  /** OpenSubsonic : types de parution issus des tags MusicBrainz ("album", "single", "ep",
   *  "compilation", "live"...), casse variable selon le serveur. */
  releaseTypes?: string[];
  isCompilation?: boolean;
}

export interface ArtistWithAlbumsDTO {
  id: string;
  name: string;
  albumCount: number;
  coverArt?: string;
  album?: AlbumSummary[];
  /** Présent (date ISO) si l'artiste est marqué favori sur le serveur. */
  starred?: string;
  musicBrainzId?: string;
}

/** `getArtistInfo2` : biographie et liens (Navidrome les obtient de Last.fm côté serveur), et
 *  artistes similaires présents dans la bibliothèque. */
export interface ArtistInfo2DTO {
  biography?: string;
  musicBrainzId?: string;
  lastFmUrl?: string;
  smallImageUrl?: string;
  mediumImageUrl?: string;
  largeImageUrl?: string;
  similarArtist?: ArtistSummary[];
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

/** Artiste référencé par une fiche OpenSubsonic (crédits, artistes multiples). */
export interface ArtistRefDTO {
  id: string;
  name: string;
}

/** Crédit OpenSubsonic (`contributors`) : rôle normalisé par le serveur — Navidrome expose
 *  notamment "composer", "lyricist", "producer", "arranger", "conductor", "engineer", "mixer",
 *  "remixer", "djmixer", "director" et "performer" (avec l'instrument en `subRole`). */
export interface ContributorDTO {
  role: string;
  subRole?: string;
  artist: ArtistRefDTO;
}

export interface ReplayGainDTO {
  trackGain?: number;
  albumGain?: number;
  trackPeak?: number;
  albumPeak?: number;
}

export interface ItemDateDTO {
  year?: number;
  month?: number;
  day?: number;
}

/** Fiche complète d'un titre (`getSong`) : champs Subsonic de base + extensions OpenSubsonic,
 *  tous optionnels — un serveur Subsonic classique n'en renvoie qu'une partie. */
export interface SongDetailsDTO extends SongDTO {
  discNumber?: number;
  genre?: string;
  genres?: { name: string }[];
  size?: number;
  contentType?: string;
  path?: string;
  created?: string;
  played?: string;
  userRating?: number;
  bpm?: number;
  comment?: string;
  samplingRate?: number;
  bitDepth?: number;
  channelCount?: number;
  musicBrainzId?: string;
  isrc?: string[];
  replayGain?: ReplayGainDTO;
  displayArtist?: string;
  displayAlbumArtist?: string;
  displayComposer?: string;
  artists?: ArtistRefDTO[];
  albumArtists?: ArtistRefDTO[];
  contributors?: ContributorDTO[];
  explicitStatus?: string;
}

/** Fiche complète d'un album (`getAlbum`) avec extensions OpenSubsonic. */
export interface AlbumDetailsDTO extends AlbumSummary {
  song: SongDetailsDTO[];
  genres?: { name: string }[];
  created?: string;
  played?: string;
  userRating?: number;
  releaseTypes?: string[];
  originalReleaseDate?: ItemDateDTO;
  releaseDate?: ItemDateDTO;
  isCompilation?: boolean;
  musicBrainzId?: string;
  displayArtist?: string;
  version?: string;
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
  created?: string;
  changed?: string;
}

export interface PlaylistWithSongsDTO extends PlaylistSummary {
  entry: SongDTO[];
}

/** Une ligne de paroles synchronisées : `start` en millisecondes depuis le début du titre. */
export interface LyricsLineDTO {
  start: number;
  value: string;
}

/** Renvoyé par `getLyricsBySongId` (OpenSubsonic) : Navidrome y expose les paroles lues
 *  depuis un fichier .lrc local (à côté du fichier audio) ou embarquées dans les tags,
 *  avec synchronisation ligne par ligne quand le .lrc en fournit une. */
export interface StructuredLyricsDTO {
  lang?: string;
  synced: boolean;
  line: LyricsLineDTO[];
  displayArtist?: string;
  displayTitle?: string;
  offset?: number;
}