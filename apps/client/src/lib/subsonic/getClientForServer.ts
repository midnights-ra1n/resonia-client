import { SubsonicClient } from "@resonia/api-client";
import type { StoredServer } from "../../stores/serversStore";
import { trackForegroundRequest } from "../network/foregroundActivity";

export function getClientForServer(server: StoredServer): SubsonicClient {
  return new SubsonicClient({
    url: server.url,
    username: server.username,
    salt: server.salt,
    token: server.token,
    // Chaque appel API compte comme activité de premier plan : le préchargement audio lui cède
    // le réseau (voir foregroundActivity).
    onRequest: trackForegroundRequest,
  });
}
