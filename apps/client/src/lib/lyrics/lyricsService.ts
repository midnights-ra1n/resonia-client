import { fetchLyricsFromLrcLib, type StructuredLyricsDTO } from "@resonia/api-client";
import { getClientForServer } from "../subsonic/getClientForServer";
import { electronFetch } from "../net/electronFetch";
import { isElectron } from "../platform";
import { storage } from "../storage";
import { useServersStore } from "../../stores/serversStore";
import { parseLrcText } from "./parseLrc";

export interface LyricsLine {
  /** Position en secondes depuis le début du titre. */
  time: number;
  text: string;
}

export interface ParsedLyrics {
  synced: boolean;
  lines: LyricsLine[];
}

/** Sous-ensemble de `Track` nécessaire pour chercher des paroles de repli sur LRCLIB (titre +
 *  artiste + album + durée — voir fetchFromLrcLib) quand le serveur Navidrome n'en a aucune. */
export interface LyricsTrackInfo {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
}

// v2 : le repli LRCLIB (et la distinction "incertain" vs "confirmé absent") a été introduit
// après coup — un "v" bumped invalide proprement toute entrée mise en cache avant, qui aurait
// pu figer une absence à tort (mauvaise tolérance de durée, LRCLIB pas encore interrogé...).
const STORAGE_PREFIX = "resonia:lyricsCache:v2:";

/** Forme persistée sur disque : distingue "confirmé absent" (`found: false`) de "jamais
 *  demandé" (rien en base) — sans ça, `storage.get` renvoyant `null` dans les deux cas nous
 *  ferait retenter une requête réseau à chaque lecture d'une piste sans paroles. */
interface PersistedLyrics {
  found: boolean;
  data?: ParsedLyrics;
}

function storageKeyFor(serverId: string, trackId: string): string {
  return `${STORAGE_PREFIX}${serverId}:${trackId}`;
}

/** Cache mémoire (rapide, vidé au rechargement) — la persistance disque (voir plus bas) est
 *  la source de vérité pour "jamais demandé" vs "confirmé absent" entre deux sessions ;
 *  `undefined` ici veut seulement dire "pas encore relu depuis le disque cette session". */
const cache = new Map<string, ParsedLyrics | null>();
const inflight = new Map<string, Promise<ParsedLyrics | null>>();

/** Même pont HTTP que le reste de l'app côté bureau (voir coverCache.ts,
 *  useAnimatedAlbumCover.ts) : c'est aussi le seul moyen de vraiment envoyer un en-tête
 *  `User-Agent` personnalisé (LRCLIB le recommande pour s'identifier) — un navigateur ignore
 *  silencieusement toute tentative de le surcharger sur un `fetch` normal. */
async function platformFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (isElectron()) return electronFetch(input, init);
  return fetch(input, init);
}

/** Préfère la version synchronisée si le serveur en propose plusieurs (langues multiples,
 *  ou .lrc synchronisé + tag texte brut) ; sinon la première non vide. */
function pickBestStructured(list: StructuredLyricsDTO[]): StructuredLyricsDTO | null {
  const withLines = list.filter((l) => l.line.length > 0);
  if (withLines.length === 0) return null;
  return withLines.find((l) => l.synced) ?? withLines[0];
}

function toParsedLyrics(dto: StructuredLyricsDTO): ParsedLyrics {
  return {
    synced: dto.synced,
    lines: dto.line.map((l) => ({ time: l.start / 1000, text: l.value })).sort((a, b) => a.time - b.time),
  };
}

/** Paroles locales au serveur Navidrome : fichier .lrc posé à côté du morceau ou tags
 *  embarqués — la source la plus fiable, puisqu'elle correspond exactement au fichier
 *  possédé (voir SubsonicClient.getLyricsBySongId). Ne renvoie `null` que si le serveur
 *  répond et confirme l'absence ; toute erreur est répercutée (jamais avalée) pour que
 *  l'appelant sache qu'il s'agit d'une incertitude réseau, pas d'une absence confirmée. */
async function fetchFromNavidrome(trackId: string): Promise<ParsedLyrics | null> {
  const { servers, activeServerId } = useServersStore.getState();
  const server = servers.find((s) => s.id === activeServerId);
  if (!server) return null;

  const client = getClientForServer(server);
  const list = await client.getLyricsBySongId(trackId);
  const best = pickBestStructured(list);
  return best ? toParsedLyrics(best) : null;
}

/** Repli quand Navidrome n'a rien : LRCLIB (https://lrclib.net), base de paroles ouverte et
 *  communautaire — gratuite, sans clé ni compte, aucune donnée personnelle transmise (titre/
 *  artiste/album/durée seulement). Voir fetchLyricsFromLrcLib pour la logique de
 *  correspondance (exacte puis floue bornée par la durée, "de la manière la plus exacte"). */
async function fetchFromLrcLib(track: LyricsTrackInfo): Promise<ParsedLyrics | null> {
  if (!track.title.trim() || !track.artist.trim()) return null;

  const result = await fetchLyricsFromLrcLib(track.title, track.artist, track.album, track.duration, platformFetch);
  if (!result || result.instrumental) return null;

  if (result.syncedLyrics) {
    const lines = parseLrcText(result.syncedLyrics);
    if (lines.length > 0) return { synced: true, lines };
  }
  if (result.plainLyrics) {
    const lines = result.plainLyrics
      .split(/\r?\n/)
      .map((text) => ({ time: 0, text: text.trim() }))
      .filter((l) => l.text.length > 0);
    if (lines.length > 0) return { synced: false, lines };
  }
  return null;
}

/** Résout une piste : mémoire déjà tentée par l'appelant, puis disque (persiste entre
 *  sessions et hors-ligne — voir `prefetchLyrics`, aussi appelé une fois un téléchargement
 *  terminé), puis Navidrome (fichier .lrc local), puis LRCLIB. LRCLIB est aussi interrogé
 *  quand Navidrome A répondu mais avec du texte brut non synchronisé — on ne s'arrête à un
 *  résultat non synchronisé que si LRCLIB n'a rien de mieux, jamais avant de lui avoir
 *  laissé sa chance de fournir la version synchronisée. Le résultat n'est écrit sur disque
 *  que si on a une réponse FERME (trouvé, ou confirmé absent des deux côtés) — une erreur
 *  réseau ne doit jamais se figer en "pas de paroles" permanent : on retentera au prochain
 *  redémarrage plutôt que de perdre définitivement une piste juste parce que le réseau a
 *  coupé une fois. */
async function resolveLyrics(track: LyricsTrackInfo): Promise<ParsedLyrics | null> {
  const { activeServerId } = useServersStore.getState();

  if (activeServerId) {
    const persisted = await storage.get<PersistedLyrics>(storageKeyFor(activeServerId, track.id));
    if (persisted) return persisted.found ? (persisted.data ?? null) : null;
  }

  let result: ParsedLyrics | null = null;
  let uncertain = false;

  try {
    result = await fetchFromNavidrome(track.id);
  } catch (err) {
    console.warn("[lyrics] Récupération Navidrome échouée", err);
    uncertain = true;
  }

  if (!result || !result.synced) {
    try {
      const fromLrcLib = await fetchFromLrcLib(track);
      // Ne remplace un résultat Navidrome déjà présent que si LRCLIB fait mieux (synchronisé) —
      // jamais pour dégrader un texte local par un texte brut équivalent d'une autre source.
      if (fromLrcLib && (!result || fromLrcLib.synced)) {
        result = fromLrcLib;
      }
    } catch (err) {
      console.warn("[lyrics] Récupération LRCLIB échouée", err);
      uncertain = true;
    }
  }

  if (activeServerId && !uncertain) {
    const toPersist: PersistedLyrics = result ? { found: true, data: result } : { found: false };
    storage.set(storageKeyFor(activeServerId, track.id), toPersist).catch(() => {});
  }
  return result;
}

/** Lance la récupération en tâche de fond sans bloquer, en dédupliquant les appels
 *  concurrents — appelé pour la piste active et les prochaines de la file (playerStore), en
 *  miroir du préchargement audio/pochette, et une fois un téléchargement hors-ligne terminé
 *  (downloadStore) pour que les paroles restent consultables sans réseau. */
export function prefetchLyrics(track: LyricsTrackInfo): void {
  if (cache.has(track.id) || inflight.has(track.id)) return;
  const promise = resolveLyrics(track).then((result) => {
    cache.set(track.id, result);
    inflight.delete(track.id);
    return result;
  });
  inflight.set(track.id, promise);
}

/** Lecture synchrone du cache mémoire : `undefined` si jamais relu cette session (à
 *  distinguer de `null`, confirmé absent), pour permettre à l'UI d'afficher immédiatement un
 *  résultat déjà connu. */
export function getCachedLyrics(trackId: string): ParsedLyrics | null | undefined {
  return cache.get(trackId);
}

/** Résout depuis le cache mémoire si possible, sinon attend la requête (déjà en cours ou
 *  nouvelle — disque puis Navidrome puis LRCLIB, voir `resolveLyrics`). */
export function loadLyrics(track: LyricsTrackInfo): Promise<ParsedLyrics | null> {
  if (cache.has(track.id)) return Promise.resolve(cache.get(track.id) ?? null);
  prefetchLyrics(track);
  return inflight.get(track.id)!;
}
