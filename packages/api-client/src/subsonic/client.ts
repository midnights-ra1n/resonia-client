import { generateSalt, generateToken } from "./auth";
import type { SubsonicAuthParams, SubsonicResponseEnvelope } from "./types";

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
}
