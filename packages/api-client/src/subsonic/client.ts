import { generateSalt, generateToken } from "./auth";
import { buildStreamUrl, type StreamUrlOptions } from "./stream";
import type { AlbumSummary, AlbumWithSongsDTO, PlaylistSummary, PlaylistWithSongsDTO, SongDTO, SubsonicAuthParams, SubsonicResponseEnvelope } from "./types";

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

  private buildParams(extra: Record<string, string> = {}): URLSearchParams {
    const params: SubsonicAuthParams = {
      u: this.username,
      t: this.token,
      s: this.salt,
      v: this.apiVersion,
      c: this.clientName,
      f: "json",
    };
    return new URLSearchParams({ ...params, ...extra });
  }

  private async request<T = unknown>(
    endpoint: string,
    extraParams: Record<string, string> = {},
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
  ): Promise<SongDTO[]> {
    const result = await this.request<{ searchResult3: { song?: SongDTO[] } }>("search3", {
      query,
      songCount: String(options.songCount ?? 500),
      albumCount: String(options.albumCount ?? 0),
      artistCount: String(options.artistCount ?? 0),
    });
    return result.searchResult3.song ?? [];
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
    return result.playlist;
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
