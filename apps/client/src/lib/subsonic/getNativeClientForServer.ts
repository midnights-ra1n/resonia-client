import { NavidromeNativeClient } from "@resonia/api-client";
import { decryptPassword } from "../security/passwordVault";
import type { StoredServer } from "../../stores/serversStore";

interface CachedToken {
  token: string;
  expiresAt: number;
}

// Cache en mémoire uniquement (jamais persisté) : le JWT natif ne doit pas survivre au rechargement de l'app
const tokenCache = new Map<string, CachedToken>();

function decodeJwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export async function getNativeClientForServer(server: StoredServer): Promise<NavidromeNativeClient | null> {
  if (!server.encryptedPassword) return null;

  const cached = tokenCache.get(server.id);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return new NavidromeNativeClient(server.url, cached.token);
  }

  try {
    const password = await decryptPassword(server.encryptedPassword);
    const auth = await NavidromeNativeClient.login(server.url, server.username, password);
    const expiresAt = decodeJwtExpiry(auth.token);
    tokenCache.set(server.id, { token: auth.token, expiresAt });
    return new NavidromeNativeClient(server.url, auth.token);
  } catch (err) {
    console.error("[navidrome-native] Login natif échoué", err);
    return null;
  }
}