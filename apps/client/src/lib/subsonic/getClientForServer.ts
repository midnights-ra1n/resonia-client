import { SubsonicClient } from "@resonia/api-client";
import type { StoredServer } from "../../stores/serversStore";

export function getClientForServer(server: StoredServer): SubsonicClient {
  return new SubsonicClient({
    url: server.url,
    username: server.username,
    salt: server.salt,
    token: server.token,
  });
}
