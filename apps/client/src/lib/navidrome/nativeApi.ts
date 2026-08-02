import type { StoredServer } from "../../stores/serversStore";
import { decryptPassword } from "../security/passwordVault";

/**
 * ⚠️ Chemin à vérifier : ouvre les DevTools (onglet Réseau) sur ton instance Navidrome,
 * uploade une pochette de playlist manuellement depuis l'UI native, et confirme le path
 * exact de la requête (méthode, URL, nom du champ du fichier). Ajuste ci-dessous si besoin.
 */
const ARTWORK_UPLOAD_PATH = (playlistId: string) => `/api/playlist/${playlistId}/artwork`;
const ARTWORK_FILE_FIELD = "imageFile";

async function nativeLogin(baseUrl: string, username: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(`Échec de connexion à l'API native Navidrome (${response.status})`);
  }

  const data = await response.json();
  if (!data.token) {
    throw new Error("Aucun token retourné par l'API native Navidrome");
  }
  return data.token as string;
}

export async function uploadPlaylistArtwork(server: StoredServer, playlistId: string, file: File): Promise<void> {
  if (!server.encryptedPassword) {
    throw new Error("Mot de passe chiffré indisponible pour ce serveur — reconnecte-toi pour l'enregistrer.");
  }

  const password = await decryptPassword(server.encryptedPassword);
  const jwt = await nativeLogin(server.url, server.username, password);

  const formData = new FormData();
  formData.append(ARTWORK_FILE_FIELD, file);

  const response = await fetch(`${server.url}${ARTWORK_UPLOAD_PATH(playlistId)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Échec de l'upload de la pochette (${response.status})`);
  }
}
