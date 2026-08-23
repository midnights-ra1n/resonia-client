import { generateSalt, generateToken } from "./auth";
import { buildStreamUrl, type StreamUrlOptions } from "./stream";
import type { AlbumSummary, AlbumWithSongsDTO, ArtistSummary, ArtistWithAlbumsDTO, PlaylistSummary, PlaylistWithSongsDTO, SearchResult3DTO, SongDTO, SubsonicAuthParams, SubsonicResponseEnvelope } from "./types";

export interface SubsonicClientConfig {
  url: string;
  username: string;
  password?: string;
  salt?: string;
  token?: string;
  clientName?: string;
  apiVersion?: string;
}

export class SubsonicApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = "SubsonicApiError";
  }
}

export class SubsonicClient {
  private url: string;
  private username: string;
  private salt: string;
  private token: string;
  private clientName: string;
  private apiVersion: string;

  constructor(config: SubsonicClientConfig) {
    this.url = config.url.replace(/\/+$/, "");
    this.username = config.username;
    this.clientName = config.clientName ?? "Resonia";
    this.apiVersion = config.apiVersion ?? "1.16.1";

    if (config.token && config.salt) {
      this.salt = config.salt;
      this.token = config.token;
    } else if (config.password) {
      this.salt = generateSalt();
      this.token = generateToken(config.password, this.salt);
    } else {
      throw new Error("SubsonicClient nécessite un mot de passe ou un couple token+salt");
    }
  }

  get credentials() {
    return { salt: this.salt, token: this.token };
  }

  private buildParams(extra: Record<string, string | string[]> = {}): URLSearchParams {
    const params: SubsonicAuthParams = {
      u: this.username,
      t: this.token,
      s: this.salt,
      v: this.apiVersion,
      c: this.clientName,
      f: "json",
    };
    const searchParams = new URLSearchParams(params as unknown as Record<string, string>);
    for (const [key, value] of Object.entries(extra)) {
      if (Array.isArray(value)) value.forEach((v) => searchParams.append(key, v));
      else searchParams.append(key, value);
    }
    return searchParams;
  }

  private async request<T = unknown>(
    endpoint: string,
    extraParams: Record<string, string | string[]> = {},
  ): Promise<T> {
    const params = this.buildParams(extraParams);
    const response = await fetch(`${this.url}/rest/${endpoint}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status} sur ${endpoint}`);
    }

    const data = (await response.json()) as SubsonicResponseEnvelope<T>;
    const body = data["subsonic-response"];

    if (body.status === "failed") {
      throw new SubsonicApiError(body.error?.code ?? 0, body.error?.message ?? "Erreur Subsonic inconnue");
    }

    return body as T;
  }

  async ping(): Promise<boolean> {
    await this.request("ping");
    return true;
  }

  async scrobble(trackId: string, options: { submission?: boolean; time?: number } = {}): Promise<void> {
    const params: Record<string, string> = { id: trackId };
    if (options.submission !== undefined) params.submission = String(options.submission);
    if (options.time !== undefined) params.time = String(options.time);
    await this.request("scrobble", params);
  }

  async search3(
    query: string,
    options: { songCount?: number; albumCount?: number; artistCount?: number } = {},
  ): Promise<SearchResult3DTO> {
    const result = await this.request<{
      searchResult3: { song?: SongDTO[]; album?: AlbumSummary[]; artist?: ArtistSummary[] };
    }>("search3", {
      query,
      songCount: String(options.songCount ?? 500),
      albumCount: String(options.albumCount ?? 0),
      artistCount: String(options.artistCount ?? 0),
    });
    return {
      song: result.searchResult3.song ?? [],
      album: result.searchResult3.album ?? [],
      artist: result.searchResult3.artist ?? [],
    };
  }

  getStreamUrl(trackId: string, options: StreamUrlOptions = {}): string {
    return buildStreamUrl(
      {
        baseUrl: this.url,
        username: this.username,
        token: this.token,
        salt: this.salt,
        clientName: this.clientName,
        apiVersion: this.apiVersion,
      },
      trackId,
      options,
    );
  }

  async getPlaylists(): Promise<PlaylistSummary[]> {
    const result = await this.request<{ playlists: { playlist?: PlaylistSummary[] } }>("getPlaylists");
    return result.playlists.playlist ?? [];
  }

  async getPlaylist(playlistId: string): Promise<PlaylistWithSongsDTO> {
    const result = await this.request<{ playlist: PlaylistWithSongsDTO }>("getPlaylist", { id: playlistId });
    // Subsonic omet le champ "entry" quand la playlist est vide plutôt que de renvoyer [].
    return { ...result.playlist, entry: result.playlist.entry ?? [] };
  }

  async createPlaylist(name: string): Promise<PlaylistSummary> {
    const result = await this.request<{ playlist: PlaylistSummary }>("createPlaylist", { name });
    return result.playlist;
  }

  async updatePlaylist(playlistId: string, options: { name?: string; comment?: string; public?: boolean }): Promise<void> {
    const params: Record<string, string> = { playlistId };
    if (options.name !== undefined) params.name = options.name;
    if (options.comment !== undefined) params.comment = options.comment;
    if (options.public !== undefined) params.public = String(options.public);
    await this.request("updatePlaylist", params);
  }

  async addSongsToPlaylist(playlistId: string, songIds: string[]): Promise<void> {
    if (songIds.length === 0) return;
    await this.request("updatePlaylist", { playlistId, songIdToAdd: songIds });
  }

  /** L'API Subsonic n'a pas d'opération "déplacer" : on retire toutes les entrées existantes
   *  (par index) puis on les rajoute dans le nouvel ordre voulu, en une seule requête. */
  async reorderPlaylist(playlistId: string, orderedSongIds: string[], currentSongCount: number): Promise<void> {
    const params: Record<string, string | string[]> = { playlistId };
    if (currentSongCount > 0) {
      params.songIndexToRemove = Array.from({ length: currentSongCount }, (_, i) => String(i));
    }
    if (orderedSongIds.length > 0) params.songIdToAdd = orderedSongIds;
    await this.request("updatePlaylist", params);
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    await this.request("deletePlaylist", { id: playlistId });
  }

async getArtist(artistId: string): Promise<ArtistWithAlbumsDTO> {
    const result = await this.request<{ artist: ArtistWithAlbumsDTO }>("getArtist", { id: artistId });
    return result.artist;
  }

  /** Nécessite le nom de l'artiste (pas son id) : c'est ainsi que l'endpoint Subsonic est défini. */
  async getTopSongs(artistName: string, count = 10): Promise<SongDTO[]> {
    const result = await this.request<{ topSongs: { song?: SongDTO[] } }>("getTopSongs", {
      artist: artistName,
      count: String(count),
    });
    return result.topSongs.song ?? [];
  }

  async getAlbumsByGenre(genre: string, size = 20): Promise<AlbumSummary[]> {
    const result = await this.request<{ albumList2: { album?: AlbumSummary[] } }>("getAlbumList2", {
      type: "byGenre",
      genre,
      size: String(size),
    });
    return result.albumList2.album ?? [];
  }

  async getAlbumList2(
    type: "frequent" | "recent" | "newest" | "random" | "highest",
    size = 20,
    offset = 0,
  ): Promise<AlbumSummary[]> {
    const result = await this.request<{ albumList2: { album?: AlbumSummary[] } }>("getAlbumList2", {
      type,
      size: String(size),
      offset: String(offset),
    });
    return result.albumList2.album ?? [];
  }

  async getRandomSongs(size = 20): Promise<SongDTO[]> {
    const result = await this.request<{ randomSongs: { song?: SongDTO[] } }>("getRandomSongs", {
      size: String(size),
    });
    return result.randomSongs.song ?? [];
  }

  async getAlbum(albumId: string): Promise<AlbumWithSongsDTO> {
    const result = await this.request<{ album: AlbumWithSongsDTO }>("getAlbum", { id: albumId });
    return result.album;
  }

  getCoverArtUrl(coverArtId: string, size = 300): string {
    const params = new URLSearchParams({
      u: this.username,
      t: this.token,
      s: this.salt,
      v: this.apiVersion,
      c: this.clientName,
      id: coverArtId,
      size: String(size),
    });
    return `${this.url}/rest/getCoverArt?${params.toString()}`;
  }
}

