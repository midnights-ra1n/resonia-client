export interface NavidromeAuthResult {
  token: string;
  id: string;
  name: string;
  username: string;
  isAdmin: boolean;
}

export interface NavidromeSongTags {
  copyright?: string[];
  [key: string]: string[] | undefined;
}

export interface NavidromeSong {
  id: string;
  albumId: string;
  title: string;
  tags?: NavidromeSongTags;
}

export class NavidromeNativeClient {
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url.replace(/\/+$/, "");
    this.token = token;
  }

  static async login(url: string, username: string, password: string): Promise<NavidromeAuthResult> {
    const cleanUrl = url.replace(/\/+$/, "");
    const response = await fetch(`${cleanUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error(`Échec du login natif Navidrome (${response.status})`);
    }

    return response.json();
  }

  async getAlbumSongs(albumId: string): Promise<NavidromeSong[]> {
    const params = new URLSearchParams({
      _end: "50",
      _order: "ASC",
      _sort: "album",
      _start: "0",
      album_id: albumId,
      missing: "false",
    });

    const response = await fetch(`${this.url}/api/song?${params.toString()}`, {
      headers: { "x-nd-authorization": `Bearer ${this.token}` },
    });

    if (!response.ok) {
      throw new Error(`Échec de récupération des morceaux (${response.status})`);
    }

    return response.json();
  }

  async getAlbumCopyright(albumId: string): Promise<string | undefined> {
    const songs = await this.getAlbumSongs(albumId);
    for (const song of songs) {
      const copyright = song.tags?.copyright?.[0];
      if (copyright) return copyright;
    }
    return undefined;
  }
}