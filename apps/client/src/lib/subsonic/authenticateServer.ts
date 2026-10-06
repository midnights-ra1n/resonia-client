import { SubsonicClient } from "@resonia/api-client";
import { encryptPassword } from "../security/passwordVault";
import type { StoredServer } from "../../stores/serversStore";

/** Vérifie les identifiants auprès du serveur (ping Subsonic) et renvoie les champs de session à
 *  enregistrer — partagé par la page de connexion et l'ajout/la modification d'un serveur. */
export async function authenticateServer(
  url: string,
  username: string,
  password: string,
): Promise<Pick<StoredServer, "url" | "username" | "salt" | "token" | "encryptedPassword">> {
  const client = new SubsonicClient({ url, username, password });
  await client.ping();
  const encryptedPassword = await encryptPassword(password);
  return { url, username, ...client.credentials, encryptedPassword };
}
