import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";

/** Une lecture, telle qu'écoutée sur cet appareil. Navidrome ne garde que des compteurs
 *  (écoutes, dernière date) : l'historique détaillé (quand, combien de temps) reste local. */
export interface PlayRecord {
  serverId: string;
  trackId: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  /** Durée du titre (s). */
  duration: number;
  /** Début de la lecture (ms epoch). */
  startedAt: number;
  /** Temps réellement écouté (s), pauses exclues. */
  listenedSec: number;
}

const DB_NAME = "resonia-stats";
const STORE = "plays";
// En dessous, ce n'est pas une écoute (clic de passage rapide dans la file).
const MIN_LISTENED_SEC = 5;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true }).createIndex("serverId", "serverId");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

async function addPlay(record: PlayRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPlays(serverId: string): Promise<PlayRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).index("serverId").getAll(IDBKeyRange.only(serverId));
    req.onsuccess = () => resolve(req.result as PlayRecord[]);
    req.onerror = () => reject(req.error);
  });
}

/** Enregistre chaque lecture à la fin du titre (changement de piste, arrêt, fermeture). Abonnement
 *  direct au store, hors React : quelques comparaisons par mise à jour, une écriture par titre. */
export function initListeningHistory(): void {
  let current: { track: Track; serverId: string; startedAt: number; listenedMs: number; playingSince: number | null } | null = null;

  const flush = () => {
    if (!current) return;
    if (current.playingSince !== null) current.listenedMs += performance.now() - current.playingSince;
    const { track, serverId, startedAt } = current;
    const listenedSec = Math.round(current.listenedMs / 1000);
    current = null;
    if (listenedSec < MIN_LISTENED_SEC) return;
    addPlay({
      serverId,
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      artistId: track.artistId,
      album: track.album,
      albumId: track.albumId,
      duration: track.duration,
      startedAt,
      listenedSec,
    }).catch((err) => console.warn("[stats] Écoute non enregistrée", err));
  };

  usePlayerStore.subscribe((s, prev) => {
    // shortcut: un retour manuel au tout début compte aussi comme une nouvelle écoute (comme la répétition d'un titre).
    const restarted = s.currentTrack === prev.currentTrack && s.currentTime === 0 && prev.currentTime > 5;
    if (s.currentTrack !== prev.currentTrack || restarted) {
      flush();
      const serverId = useServersStore.getState().activeServerId;
      if (s.currentTrack && serverId) {
        current = { track: s.currentTrack, serverId, startedAt: Date.now(), listenedMs: 0, playingSince: null };
      }
    }
    if (!current) return;
    if (s.isPlaying && current.playingSince === null) current.playingSince = performance.now();
    else if (!s.isPlaying && current.playingSince !== null) {
      current.listenedMs += performance.now() - current.playingSince;
      current.playingSince = null;
    }
  });
  // shortcut: l'écriture IndexedDB à la fermeture peut ne pas aboutir ; la lecture en cours est alors perdue.
  window.addEventListener("pagehide", flush);
}
