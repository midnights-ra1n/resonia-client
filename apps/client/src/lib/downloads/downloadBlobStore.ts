import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { createBlobStore } from "../storage/blobStore";

const ROOT_DIR = "resonia-downloads";

// AppData (et non AppCache comme le cache audio transitoire) : un téléchargement est un choix
// explicite de l'utilisateur, il ne doit jamais être purgé par un nettoyage de cache du système.
export const downloadBlobStore = createBlobStore(ROOT_DIR, BaseDirectory.AppData);
