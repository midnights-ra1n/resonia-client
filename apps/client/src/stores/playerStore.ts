import { create } from "zustand";
import { cacheStore } from "../lib/audio/cache/cacheStore";
import { downloadStore } from "../lib/downloads/downloadStore";
import { prefetchScheduler } from "../lib/audio/cache/prefetchScheduler";
import { DecodedBufferCache } from "../lib/audio/engine/decodedBufferCache";
import { getGaplessEngine } from "../lib/audio/engine/gaplessEngine";
import type { EngineState } from "../lib/audio/engine/types";
import { listOutputDevices, type OutputDevice } from "../lib/audio/outputDevices";
import { AirplayPcmEncoder } from "../lib/audio/airplay/airplayPcmEncoder";
import { isElectron } from "../lib/platform";
import {
  clearNowPlaying,
  initNowPlaying,
  setNowPlayingPlaybackState,
  setNowPlayingPositionState,
  updateNowPlayingMetadata,
} from "../lib/audio/nowPlaying";
import { getQualityById } from "../lib/audio/qualityOptions";
import { getCachedCoverUrl, loadAndCacheCover } from "../lib/image/coverCache";
import { prefetchDominantColor } from "../lib/image/dominantColorCache";
import { prefetchLyrics } from "../lib/lyrics/lyricsService";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { storage } from "../lib/storage";
import { useServersStore } from "./serversStore";
import { useSettingsStore } from "./settingsStore";
import { ensureWaveform, loadWaveform } from "../lib/audio/waveform/waveform";
import { linearOrder, reshuffleUpcoming, shuffleIndices } from "../lib/audio/shuffle";

const VOLUME_STORAGE_KEY = "resonia:settings:volume";
const TIME_DISPLAY_STORAGE_KEY = "resonia:settings:showTimeRemaining";
const SHUFFLE_STORAGE_KEY = "resonia:settings:shuffle";
const REPEAT_STORAGE_KEY = "resonia:settings:repeat";
const PITCH_STORAGE_KEY = "resonia:settings:pitch";
const PITCH_RANGE_STORAGE_KEY = "resonia:settings:pitchRange";
const MASTER_TEMPO_STORAGE_KEY = "resonia:settings:masterTempo";

/** Bornes absolues du pitch fader, en pourcentage — plage maximale d'une platine DJ en
 *  mode étendu (CDJ/Serato). Vitesse effective envoyée au moteur : 1 + pitch/100. La plage
 *  réellement disponible au curseur est `pitchRange` (voir plus bas), toujours ⊆ à ces
 *  bornes absolues. */
const PITCH_MIN_PERCENT = -16;
const PITCH_MAX_PERCENT = 16;

/** Plages de pitch proposées (±%), façon platine DJ — ±8% est la valeur type par défaut,
 *  ±16% le mode étendu. */
export const PITCH_RANGE_OPTIONS = [4, 8, 10, 16] as const;
const DEFAULT_PITCH_RANGE: (typeof PITCH_RANGE_OPTIONS)[number] = 8;

// Un <input type="range"> émet un événement "change" à chaque pixel parcouru pendant le
// glissé (jusqu'à plusieurs dizaines par seconde) : répercuter chacun tel quel jusqu'à
// GaplessEngine.setPlaybackRate y déclenche à chaque fois une replanification complète du
// crossfade vers la piste suivante (nouveaux noeuds Web Audio créés/détruits) — coûteux, et
// la cause des coupures observées lors d'un glissé rapide du pitch fader. On garde le
// curseur et l'affichage du pourcentage parfaitement réactifs (mise à jour immédiate du
// store), mais on ne répercute la valeur au moteur audio qu'une fois par frame, en ne
// gardant que la dernière valeur demandée entre deux frames.
let pitchRafId: number | null = null;
let pitchRafValue: number | null = null;
function applyPitchToEngineThrottled(engine: ReturnType<typeof getGaplessEngine>, rate: number) {
  pitchRafValue = rate;
  if (pitchRafId !== null) return;
  pitchRafId = requestAnimationFrame(() => {
    pitchRafId = null;
    if (pitchRafValue !== null) engine.setPlaybackRate(pitchRafValue);
    pitchRafValue = null;
  });
}
function cancelThrottledPitch() {
  if (pitchRafId !== null) cancelAnimationFrame(pitchRafId);
  pitchRafId = null;
  pitchRafValue = null;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  duration: number;
  coverUrl?: string;
  /** Identifiant Subsonic de la pochette (distinct de `coverUrl`, déjà résolue en URL) :
   *  nécessaire pour clé de cache indépendante de l'URL (jeton d'auth, host…). */
  coverArtId?: string;
  /** Format et débit (kbps) du fichier source sur le serveur — permettent de lire l'original
   *  plutôt qu'un transcodage inutile, voir `resolveStreamFormat`. */
  suffix?: string;
  bitRate?: number;
}

// `import.meta.env.BASE_URL`, jamais un chemin racine en dur — voir le même commentaire dans
// Sidebar.tsx : casse sous Electron empaqueté (chargé via `file://`, base relative).
const DEFAULT_COVER_URL = `${import.meta.env.BASE_URL}default-cover.svg`;
const SCROBBLE_MIN_DURATION = 30;
const PREFETCH_COUNT = 3;

function getActiveQualityId(): string {
  return useSettingsStore.getState().audioQualityId;
}

function getActiveClient() {
  const { servers, activeServerId } = useServersStore.getState();
  const server = servers.find((s) => s.id === activeServerId);
  return server ? getClientForServer(server) : null;
}

// Formats source lisibles tels quels, par famille de qualité demandée. `m4a` peut aussi contenir de
// l'ALAC sans perte : le plafond de débit ci-dessous l'écarte naturellement (~1000 kbps et plus).
const ORIGINAL_SUFFIXES: Record<"aac" | "opus" | "mp3", string[]> = {
  aac: ["m4a", "aac", "mp4", "mp3"],
  mp3: ["mp3"],
  opus: ["opus", "ogg", "m4a", "aac", "mp3"],
};
// Tolérance sur le débit de l'original par rapport à la qualité choisie : un AAC à 262 kbps pour
// une qualité « AAC 256 » est lu tel quel, un FLAC ou un MP3 320 pour « AAC 128 » reste transcodé.
const ORIGINAL_BITRATE_TOLERANCE = 1.15;

const ogg = typeof Audio !== "undefined" ? new Audio().canPlayType('audio/ogg; codecs="opus"') !== "" : false;

/** `true` si le fichier source peut être lu directement au lieu d'être transcodé par le serveur.
 *
 *  Transcoder un fichier déjà dans un format lisible, à un débit équivalent, ne réduit pas sa
 *  taille mais coûte cher : le serveur ne sert un flux transcodé qu'au fil de l'eau, sans requêtes
 *  par plage — impossible de se positionner au-delà de ce qui est déjà téléchargé (le serveur
 *  renvoyait le fichier depuis le début : la lecture repartait de zéro au moindre clic dans la
 *  barre), impossible de le télécharger en plusieurs morceaux parallèles, et chaque démarrage
 *  attend le lancement d'ffmpeg. L'original, lui, a une taille exacte et accepte les plages. */
function canPlayOriginal(track: Track, format: "aac" | "opus" | "mp3", maxBitRate: number): boolean {
  const suffix = track.suffix?.toLowerCase();
  if (!suffix || !track.bitRate || !ORIGINAL_SUFFIXES[format].includes(suffix)) return false;
  if ((suffix === "ogg" || suffix === "opus") && !ogg) return false;
  return maxBitRate <= 0 || track.bitRate <= maxBitRate * ORIGINAL_BITRATE_TOLERANCE;
}

/** URL de LECTURE immédiate : toujours le flux au format de la qualité choisie. L'original n'y
 *  est pas utilisé même quand il est compatible : la plupart des M4A placent leur index (`moov`)
 *  en fin de fichier — parfois plusieurs Mo avec une pochette intégrée — et le lecteur doit le
 *  télécharger en entier avant de jouer la première seconde (~48 s mesurées sur un serveur à
 *  ~50 Ko/s par connexion), là où un flux transcodé démarre en une à deux secondes. */
function resolveStreamUrl(track: Track): string | null {
  const client = getActiveClient();
  if (!client) return null;
  const quality = getQualityById(getActiveQualityId());
  return client.getStreamUrl(track.id, { format: quality?.format, maxBitRate: quality?.maxBitRate });
}

/** URL de MISE EN CACHE (piste active et préchargement) : l'original quand il est compatible
 *  (voir canPlayOriginal) — taille exacte et plages acceptées, donc téléchargeable en plusieurs
 *  morceaux parallèles par le process principal sur desktop, et décodable d'un bloc une fois
 *  complet (l'index en fin de fichier n'y gêne plus). Sinon, le même flux que la lecture. */
function resolveCacheUrl(track: Track): string | null {
  const client = getActiveClient();
  if (!client) return null;
  const quality = getQualityById(getActiveQualityId());
  if (quality && quality.format !== "raw" && canPlayOriginal(track, quality.format, quality.maxBitRate)) {
    return client.getStreamUrl(track.id, { format: "raw" });
  }
  return resolveStreamUrl(track);
}

interface PlayableTrack {
  streamUrl: string;
  qualityId: string;
  format: "aac" | "opus" | "mp3";
  /** URL utilisée pour la mise en cache (voir resolveCacheUrl). */
  cacheUrl: string;
}

/** Type MIME candidat pour un démarrage en streaming progressif (MediaSource) quand le
 *  streaming natif direct échoue faute de support des Range HTTP côté serveur (voir
 *  GaplessEngine.startNativeViaMediaSource). Le moteur vérifie lui-même la compatibilité
 *  réelle via MediaSource.isTypeSupported avant de l'utiliser. */
const MSE_MIME_TYPE: Record<PlayableTrack["format"], string> = {
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  mp3: "audio/mpeg",
  opus: 'audio/ogg; codecs="opus"',
};

/** "raw" (lossless) n'est pas encore supporté par la résolution de flux. */
function resolvePlayableTrack(track: Track): PlayableTrack | null {
  const streamUrl = resolveStreamUrl(track);
  const quality = getQualityById(getActiveQualityId());
  if (!streamUrl || !quality || quality.format === "raw") return null;
  return { streamUrl, qualityId: quality.id, format: quality.format, cacheUrl: resolveCacheUrl(track) ?? streamUrl };
}

function decodedCacheKey(trackId: string, qualityId: string): string {
  return `${trackId}:${qualityId}`;
}

export interface PlayerState {
  currentTrack: Track | null;
  setCurrentTrack: (track: Track | null) => void;

  queue: Track[];
  queueIndex: number;
  playOrder: number[];
  playOrderPosition: number;

  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  playFromStart: (queue: Track[]) => Promise<void>;
  /** Arrête la lecture et vide la file — changement de serveur, déconnexion : les pistes
   *  appartiennent à l'ancien serveur et ne doivent plus être lues ni préchargées. */
  resetPlayback: () => void;

  isPlaying: boolean;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;

  /** État précis du moteur de lecture (loading/buffering/ready/playing/paused/ended/error),
   *  exposé pour l'UI (ex: indicateur de chargement) — additif, `isPlaying` reste la
   *  source de vérité utilisée par les composants existants. */
  engineState: EngineState;

  currentTime: number;
  setCurrentTime: (time: number) => void;
  /** Position jusqu'où la piste est chargée (secondes) — barre de tampon façon YouTube. */
  bufferedTime: number;

  /** Durée RÉELLE côté moteur (`engine.duration`), pas la métadonnée serveur de
   *  `currentTrack.duration` : les deux peuvent diverger (rognage du silence de bord une
   *  fois basculé en mode buffer, léger écart de métadonnées) — voir le commentaire sur
   *  `setCurrentTime` ci-dessous. La barre de progression doit seeker par rapport à CETTE
   *  valeur pour qu'un clic proche de la fin visuelle ne dépasse jamais la fin réelle que
   *  `GaplessEngine.seek()` peut satisfaire (ce qui déclenchait un `onended` immédiat et un
   *  saut prématuré à la piste suivante). Recalée à chaque tick et à chaque transition qui
   *  change la durée exposée par le moteur (chargement, bascule native→buffer, swap
   *  gapless) ; retombe sur `currentTrack.duration` tant qu'elle vaut encore 0 (avant que le
   *  moteur ait une durée connue, ex. tout début de piste native).
   */
  duration: number;

  isShuffle: boolean;
  toggleShuffle: () => void;
  isRepeat: boolean;
  toggleRepeat: () => void;
  nextTrack: () => void;
  prevTrack: () => void;

  volume: number;
  isMuted: boolean;
  setVolume: (volume: number) => void;
  toggleMute: () => void;

  /** Pitch fader façon platine DJ, en pourcentage (voir PITCH_MIN_PERCENT/MAX_PERCENT) :
   *  couple vitesse et hauteur — le moteur n'offre pas de time-stretching indépendant
   *  (Web Audio n'a pas de pitch-shifting natif, voir GaplessEngine.setPlaybackRate). */
  pitch: number;
  setPitch: (percent: number) => void;
  resetPitch: () => void;
  showPitchMenu: boolean;
  togglePitchMenu: () => void;

  /** Plage disponible au curseur de pitch, ±%, une des valeurs de PITCH_RANGE_OPTIONS
   *  (±8% par défaut). Changer la plage reclampe `pitch` s'il la dépasse. */
  pitchRange: (typeof PITCH_RANGE_OPTIONS)[number];
  setPitchRange: (range: (typeof PITCH_RANGE_OPTIONS)[number]) => void;

  /** Interrupteur "Master Tempo" : demande au moteur de préserver la hauteur pendant que la
   *  vitesse change (voir GaplessEngine.setPreservePitch), via l'algorithme natif du
   *  navigateur — réel, mais seulement pour la phase de streaming natif en tout début de
   *  piste. Une fois le moteur basculé en mode buffer gapless (l'essentiel de la lecture),
   *  aucune préservation n'existe côté Web Audio : la hauteur y redérive avec la vitesse.
   *  Limitation connue et acceptée, pas un bug à corriger. */
  masterTempo: boolean;
  toggleMasterTempo: () => void;

  showQueue: boolean;
  toggleQueue: () => void;
  reorderQueue: (dragIndex: number, hoverIndex: number) => void;
  addToQueue: (tracks: Track | Track[], position?: "next" | "end") => void;
  showLyrics: boolean;
  toggleLyrics: () => void;
  showConnect: boolean;
  toggleConnect: () => void;
  /** Sorties audio déjà connues du système (voir lib/audio/outputDevices) — pas de scan de
   *  périphériques non appairés, voir le commentaire du module. */
  outputDevices: OutputDevice[];
  outputDevicesLoading: boolean;
  selectedOutputDeviceId: string;
  outputDeviceSelectionSupported: boolean;
  refreshOutputDevices: () => Promise<void>;
  selectOutputDevice: (deviceId: string) => Promise<void>;

  /** AirPlay — preuve de concept desktop uniquement (voir lib/audio/airplay et la section
   *  AirPlay de electron/main/index.ts) : découverte mDNS + envoi RAOP, indépendant de la
   *  liste `outputDevices` ci-dessus (celle-ci ne reflète que ce que l'OS expose déjà comme
   *  sortie audio classique, jamais AirPlay tant qu'aucune enceinte n'a été ajoutée côté
   *  système — voir la conversation produit à ce sujet). */
  airplayDevices: { id: string; name: string; host: string; port: number }[];
  airplayDevicesLoading: boolean;
  airplayConnectedId: string | null;
  airplayConnecting: boolean;
  airplaySupported: boolean;
  refreshAirplayDevices: () => Promise<void>;
  connectAirplayDevice: (deviceId: string, airplay2: boolean) => Promise<void>;
  disconnectAirplayDevice: () => Promise<void>;

  showTimeRemaining: boolean;
  toggleTimeDisplay: () => void;

  showDebugPanel: boolean;
  toggleDebugPanel: () => void;
  /** Calcule la forme d'onde de la piste en cours si elle est déjà décodée (option activée
   *  après coup, voir WaveformBar). */
  ensureCurrentWaveform: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get, api) => {
  const engine = getGaplessEngine();
  const decodedCache = new DecodedBufferCache();

  // Retombe côté UI sur "default" si la sortie sélectionnée disparaît (périphérique
  // débranché/déconnecté) — voir GaplessEngine.onOutputDeviceUnavailable.
  engine.onOutputDeviceUnavailable = () => set({ selectedOutputDeviceId: "default" });

  // AirPlay (preuve de concept) : un seul encodeur PCM réutilisé pour toute la durée du store,
  // reconstruit (reset()) à chaque (re)connexion pour repartir sans reliquat de
  // ré-échantillonnage d'une session précédente.
  const airplayEncoder = new AirplayPcmEncoder((chunk) => window.resonia?.airplay.sendPcm(chunk));
  engine.onAirplayTapLost = () => {
    // Le graphe audio a été reconstruit (changement de périphérique de sortie, voir
    // rebuildAudioGraph) : le tap précédent est mort, mais la connexion réseau AirPlay elle-même
    // tient toujours côté process principal — on retente juste de rebrancher un nouveau tap
    // dessus plutôt que de couper toute la session pour un événement qui n'a rien à voir avec
    // AirPlay.
    const deviceId = get().airplayConnectedId;
    if (!deviceId) return;
    airplayEncoder.reset();
    void engine.attachAirplayTap((data) => airplayEncoder.push(data.left, data.right, data.sampleRate));
  };
  // La session RAOP peut se terminer côté récepteur sans qu'on ait rien demandé (réseau coupé,
  // enceinte éteinte, pairing qui échoue en cours de route...) — sans cette écoute, la sortie
  // locale resterait mutée indéfiniment (voir setLocalOutputMuted dans connectAirplayDevice) et
  // l'app deviendrait silencieuse sans que rien dans l'UI n'explique pourquoi.
  window.resonia?.airplay.onEvent((event) => {
    if (event.event !== "session-ended") return;
    if (!get().airplayConnectedId) return;
    console.warn("[player] Session AirPlay terminée de façon inattendue", event);
    engine.detachAirplayTap();
    engine.setLocalOutputMuted(false);
    airplayEncoder.reset();
    set({ airplayConnectedId: null });
  });

  let scrobbledNowPlaying = false;
  let scrobbledSubmission = false;
  // Empêche de replanifier la même cible gapless plusieurs fois (déclenchement répété
  // du démarrage de lecture, changement de qualité, etc.).
  let scheduledNextKey: string | null = null;

  // Un appel à loadAndPlay() (ci-dessous) attend une résolution async (cache OPFS) avant de
  // committer quoi que ce soit. Deux appels rapprochés (double-clic next/prev, touche média du
  // clavier répétée, nextTrack() déclenché pendant qu'un changement précédent est encore en
  // vol) peuvent donc résoudre dans le désordre : sans garde, le plus lent écraserait
  // l'engine et le Now Playing système avec les infos d'une piste déjà abandonnée. Chaque
  // appel capture le numéro de génération courant et abandonne silencieusement s'il a été
  // dépassé entre-temps par un appel plus récent.
  let loadGeneration = 0;

  // Annule les attentes de cache liées à la piste en cours (décodage de la piste active, voir
  // ensureActiveDecoded) à chaque changement de piste : sans ça, chaque piste quittée laissait une
  // attente pendante qui pouvait se réveiller bien plus tard sur une piste qui n'est plus jouée.
  let playbackAbort = new AbortController();
  // Idem pour la préparation de la piste suivante (scheduleGaplessNext), annulée dès que la cible
  // change (file réordonnée, aléatoire/répétition basculés, changement de piste).
  let nextAbort: AbortController | null = null;

  function abortPlaybackWaits() {
    playbackAbort.abort();
    playbackAbort = new AbortController();
    nextAbort?.abort();
    nextAbort = null;
  }

  // Débounce des seeks (barre de progression) : un clic isolé applique le seek quasi
  // immédiatement, mais une rafale de clics très rapprochés (l'utilisateur "glisse" en
  // cliquant plusieurs fois) ne doit faire atterrir qu'UN seul seek — celui du dernier
  // clic — sur le moteur. Sans ça, plusieurs seeks natifs qui se chevauchent (chacun
  // interrompant la mise en mémoire tampon du précédent) pouvaient faire atterrir la
  // lecture avant/après le point réellement cliqué. `pendingSeekTime` sert aussi à
  // suspendre tickProgress() : sans ça, sa lecture de engine.currentTime à chaque frame
  // écraserait la position optimiste affichée avant même que le seek débouncé parte.
  const SEEK_DEBOUNCE_MS = 80;
  let seekDebounceTimer: number | null = null;
  let pendingSeekTime: number | null = null;

  // Après l'envoi effectif d'un seek au moteur, la position lue sur celui-ci peut encore
  // brièvement refléter l'ANCIENNE position (élément <audio> natif qui n'a pas encore pris en
  // compte le nouveau currentTime, source buffer pas encore redémarrée) : sans garde, la barre
  // revenait en arrière une fraction de seconde puis rebondissait — perçu comme un gel. Tant que
  // le moteur n'est pas arrivé à ±1 s de la cible (et au plus SEEK_SETTLE_MS), on garde la
  // position visée affichée.
  const SEEK_SETTLE_MS = 2500;
  let seekSettleTarget: number | null = null;
  let seekSettleUntil = 0;

  function clearPendingSeek() {
    seekSettleTarget = null;
    if (seekDebounceTimer !== null) {
      window.clearTimeout(seekDebounceTimer);
      seekDebounceTimer = null;
    }
    pendingSeekTime = null;
  }

  /** Forme d'onde calculée depuis le buffer déjà décodé pour le gapless — seulement si l'option
   *  est active : aucun coût sinon. Mise en cache par lib/audio/waveform (calculée une seule fois). */
  function prepareWaveform(trackId: string, buffer: AudioBuffer) {
    if (useSettingsStore.getState().showWaveform) void ensureWaveform(trackId, buffer);
  }

  // Formes d'onde des pistes suivantes, calculées dès que leur préchargement se termine (la
  // première est déjà décodée pour le gapless, voir scheduleGaplessNext) : passer à la suivante
  // l'affiche aussitôt. Une seule à la fois, annulé à chaque changement de file.
  let waveformPrefetchAbort: AbortController | null = null;

  function prefetchUpcomingWaveforms(tracks: Track[]) {
    waveformPrefetchAbort?.abort();
    waveformPrefetchAbort = null;
    if (!useSettingsStore.getState().showWaveform || tracks.length < 2) return;
    const abort = new AbortController();
    waveformPrefetchAbort = abort;
    const qualityId = getActiveQualityId();
    void (async () => {
      for (const track of tracks.slice(1)) {
        if (abort.signal.aborted || (await loadWaveform(track.id))) continue;
        const bytes = await waitForTrackBytes(track.id, qualityId, abort.signal);
        if (!bytes || bytes.byteLength === 0 || abort.signal.aborted) return;
        try {
          await ensureWaveform(track.id, await engine.decode(bytes));
        } catch (err) {
          console.warn("[player] Forme d'onde anticipée impossible", err);
        }
      }
    })();
  }

  /** Le plus avancé entre le tampon du lecteur et le téléchargement en cache de la piste (octets
   *  ≈ temps, à débit constant) — la barre progresse donc aussi pendant la mise en cache. */
  function currentBufferedTime(track: Track, duration: number): number {
    let buffered = engine.bufferedEnd;
    const task = cacheStore.getTask(track.id, getActiveQualityId());
    if (task && duration > 0) {
      const { bytesCached, totalBytes, complete } = task.progress;
      if (complete) buffered = duration;
      else if (totalBytes > 0) buffered = Math.max(buffered, (bytesCached / totalBytes) * duration);
    }
    return Math.min(duration, buffered);
  }

  function resetPlaybackFlags() {
    scheduledNextKey = null;
    nextAbort?.abort();
    nextAbort = null;
    scrobbledNowPlaying = false;
    scrobbledSubmission = false;
    clearPendingSeek();
  }

  function sendScrobble(track: Track, submission: boolean) {
    const client = getActiveClient();
    if (!client) return;
    client.scrobble(track.id, { submission }).catch((err) => console.warn("[player] Scrobble échoué", err));
  }

  function refreshUpcomingPrefetch() {
    const { queue, playOrder, playOrderPosition } = get();
    const qualityId = getActiveQualityId();
    prefetchScheduler.setQuality(qualityId);

    const upcoming = [];
    const upcomingTracks: Track[] = [];
    for (let i = 1; i <= PREFETCH_COUNT; i++) {
      const pos = playOrderPosition + i;
      const queueIndex = playOrder[pos];
      if (queueIndex === undefined) break;
      const track = queue[queueIndex];
      const streamUrl = resolveCacheUrl(track);
      if (streamUrl) upcoming.push({ trackId: track.id, streamUrl });
      upcomingTracks.push(track);
      prefetchTrackCover(track);
      prefetchLyrics(track);
    }
    prefetchScheduler.setUpcoming(upcoming);
    prefetchUpcomingWaveforms(upcomingTracks);
  }

  /** Met en cache disque la pochette d'une piste en tâche de fond, sans bloquer la
   *  navigation/lecture : appelé pour la piste active et les PREFETCH_COUNT suivantes,
   *  en miroir du préchargement audio, pour que la pochette soit déjà disponible
   *  localement au moment où la piste devient active (évite l'attente réseau et l'affichage
   *  de l'ancienne pochette pendant que la nouvelle charge). Prépare aussi sa couleur
   *  dominante (vue paroles) pendant qu'on a le blob sous la main, pour qu'elle soit
   *  quasi instantanée à l'ouverture plutôt que recalculée à ce moment-là.
   */
  function prefetchTrackCover(track: Track) {
    if (!track.coverArtId) return;
    const { servers, activeServerId } = useServersStore.getState();
    if (!activeServerId) return;
    const server = servers.find((s) => s.id === activeServerId);
    const client = server ? getClientForServer(server) : null;
    if (!client) return;

    const coverArtId = track.coverArtId;
    const fetchUrl = client.getCoverArtUrl(coverArtId, 300);
    getCachedCoverUrl(activeServerId, coverArtId, 300)
      .then((cached) => {
        if (cached) {
          return prefetchDominantColor(activeServerId, coverArtId, cached).finally(() => URL.revokeObjectURL(cached));
        }
        return loadAndCacheCover(activeServerId, coverArtId, 300, fetchUrl).then((url) => {
          if (!url.startsWith("blob:")) return;
          return prefetchDominantColor(activeServerId, coverArtId, url).finally(() => URL.revokeObjectURL(url));
        });
      })
      .catch((err) => console.warn("[player] Préchargement de pochette échoué", err));
  }

  /** Démarre la mise en cache en tâche de fond de la piste en cours. Volontairement
   *  déclenché une fois la lecture réellement démarrée — jamais au moment du clic : une
   *  deuxième connexion réseau vers la même piste concurrencerait le flux de lecture et
   *  retarderait le démarrage audible. Le téléchargement lui-même est confié au planificateur
   *  de préchargement (une connexion à la fois, piste active d'abord) — plus jamais lancé en
   *  parallèle de celui-ci, ce qui doublait les transcodages demandés au serveur. */
  async function activateCurrentTrackCaching() {
    const { currentTrack } = get();
    if (!currentTrack) return;
    const resolved = resolvePlayableTrack(currentTrack);
    if (!resolved) return;

    prefetchScheduler.setQuality(resolved.qualityId);
    prefetchTrackCover(currentTrack);
    prefetchLyrics(currentTrack);

    // Piste déjà téléchargée : inutile de retélécharger les mêmes octets dans le cache LRU.
    const downloaded = await downloadStore.isDownloaded(currentTrack.id, resolved.qualityId);
    if (get().currentTrack?.id !== currentTrack.id) return;
    prefetchScheduler.setActive(downloaded ? null : { trackId: currentTrack.id, streamUrl: resolved.cacheUrl });
  }

  /** Octets complets d'une piste : fichier téléchargé (permanent) s'il existe, sinon le cache
   *  LRU une fois que le planificateur l'y a intégralement téléchargée. `null` si `signal` est
   *  annulé avant (changement de piste/de cible). */
  async function waitForTrackBytes(trackId: string, qualityId: string, signal: AbortSignal): Promise<ArrayBuffer | null> {
    if (await downloadStore.isDownloaded(trackId, qualityId)) {
      const downloaded = await downloadStore.readDownloadedFull(trackId, qualityId);
      if (downloaded && downloaded.byteLength > 0) return downloaded;
    }
    if (!(await cacheStore.waitForComplete(trackId, qualityId, signal))) return null;
    return cacheStore.readCachedFull(trackId, qualityId);
  }

  /** Décode (une fois en cache complet) la piste active en tâche de fond, puis fait
   *  basculer le moteur du streaming natif vers un buffer sample-accurate — à partir de
   *  là, la piste suivante peut être planifiée au sample près (voir scheduleGaplessNext). */
  async function ensureActiveDecoded(track: Track, resolved: PlayableTrack) {
    const key = decodedCacheKey(track.id, resolved.qualityId);
    const cached = decodedCache.get(key);
    if (cached) {
      engine.attachDecodedActive(cached);
      return;
    }

    const bytes = await waitForTrackBytes(track.id, resolved.qualityId, playbackAbort.signal);
    if (!bytes || bytes.byteLength === 0) return;
    if (get().currentTrack?.id !== track.id) return; // la piste active a changé entre-temps

    try {
      const decoded = await engine.decodeAndTrim(bytes);
      if (get().currentTrack?.id !== track.id) return;
      decodedCache.set(key, decoded);
      prepareWaveform(track.id, decoded.buffer);
      engine.attachDecodedActive(decoded);
      // La bascule native→buffer change `engine.duration` (silence de bord rogné) : recaler
      // immédiatement plutôt que d'attendre le prochain tick, sans quoi un seek lancé juste
      // après la bascule pourrait encore cibler l'ancienne durée (métadonnée serveur).
      set({ duration: engine.duration });
    } catch (err) {
      console.warn("[player] Décodage de la piste active impossible, lecture native conservée", err);
    }
  }

  /** Résout, télécharge (cache OPFS si présent, sinon réseau) et décode la piste
   *  suivante, rogne son silence de bord, puis la fait PLANIFIER par le moteur sur
   *  l'horloge de l'AudioContext (voir GaplessEngine.scheduleNext) — c'est cette
   *  planification déterministe, pas une réaction à un événement, qui élimine toute
   *  coupure à la transition. */
  async function scheduleGaplessNext() {
    const { queue, playOrder, playOrderPosition, isRepeat } = get();
    if (queue.length < 2 || playOrder.length < 2) return;

    const nextPos = playOrderPosition + 1;
    const nextQueueIndex = isRepeat ? playOrder[playOrderPosition] : playOrder[nextPos];
    if (nextQueueIndex === undefined) return;

    const nextTrackData = queue[nextQueueIndex];
    if (!nextTrackData) return;

    const resolved = resolvePlayableTrack(nextTrackData);
    if (!resolved) return;

    const key = decodedCacheKey(nextTrackData.id, resolved.qualityId);
    if (scheduledNextKey === key) return;
    scheduledNextKey = key;
    nextAbort?.abort();
    const abort = new AbortController();
    nextAbort = abort;
    const generation = loadGeneration;

    const commitSwap = () => {
      // Swap planifié pour une file que l'utilisateur vient de remplacer (clic sur un autre album
      // pendant que le chargement de la nouvelle piste est encore en vol) : loadAndPlay reprend la
      // main, ne pas écraser la nouvelle file avec la piste suivante de l'ancienne.
      if (generation !== loadGeneration) return;
      // Passage gapless : la nouvelle piste joue depuis son AudioBuffer décodé, l'élément natif
      // ne lit plus l'URL locale de la précédente — on la libère.
      releaseActiveLocalUrl(null);
      scrobbledNowPlaying = false;
      scrobbledSubmission = false;
      scheduledNextKey = null;
      clearPendingSeek();
      set({
        currentTrack: nextTrackData,
        playOrderPosition: isRepeat ? get().playOrderPosition : nextPos,
        queueIndex: nextQueueIndex,
        currentTime: 0,
        duration: engine.duration,
        // Piste décodée d'avance (gapless) : entièrement en mémoire.
        bufferedTime: engine.duration,
      });
      updateNowPlayingMetadata(nextTrackData);
      setNowPlayingPlaybackState("playing");
      setNowPlayingPositionState(engine.duration, engine.currentTime, true, engine.playbackRate);
      refreshUpcomingPrefetch();
      activateCurrentTrackCaching();
      scheduleGaplessNext();
    };

    try {
      let decoded = decodedCache.get(key);
      if (!decoded) {
        // Les octets viennent du cache, alimenté par le planificateur de préchargement — jamais
        // d'un fetch complet dédié : celui-ci doublait le téléchargement (et le transcodage côté
        // serveur) de la piste que le planificateur récupérait déjà, en parallèle du flux en
        // cours de lecture, au point de faire caler ce dernier sur un serveur lent.
        const arrayBuffer = await waitForTrackBytes(nextTrackData.id, resolved.qualityId, abort.signal);
        if (!arrayBuffer || abort.signal.aborted || scheduledNextKey !== key) return;
        if (arrayBuffer.byteLength === 0) throw new Error("Fichier en cache vide");
        decoded = await engine.decodeAndTrim(arrayBuffer);
        if (scheduledNextKey !== key) return;
        decodedCache.set(key, decoded);
      }
      prepareWaveform(nextTrackData.id, decoded.buffer);

      engine.scheduleNext(decoded.buffer, decoded.trim, commitSwap);
    } catch (err) {
      console.error(`[player] Préparation de la piste suivante ("${nextTrackData.title}") échouée — la transition retombera sur un rechargement réseau`, err);
      if (scheduledNextKey === key) scheduledNextKey = null;
    }
  }

  /** Appelé une fois la lecture réellement démarrée (natif "playing" ou démarrage direct
   *  en mode buffer pour une piste déjà décodée) : lance les tâches de fond non
   *  critiques, jamais avant. */
  function onPlaybackStarted() {
    refreshUpcomingPrefetch();
    activateCurrentTrackCaching();
    const track = get().currentTrack;
    const resolved = track && resolvePlayableTrack(track);
    if (track && resolved) ensureActiveDecoded(track, resolved);
    scheduleGaplessNext();
  }

  // Hydratation asynchrone (localStorage web / store Tauri bureau) : le volume et le mode
  // d'affichage du temps restent tels que l'utilisateur les a laissés d'une session à l'autre.
  storage.get<number>(VOLUME_STORAGE_KEY).then((stored) => {
    if (stored === null || !isFinite(stored) || stored < 0 || stored > 1) return;
    engine.setVolume(stored);
    set({ volume: stored, isMuted: stored === 0 });
  });
  storage.get<boolean>(TIME_DISPLAY_STORAGE_KEY).then((stored) => {
    if (stored === null) return;
    set({ showTimeRemaining: stored });
  });
  storage.get<boolean>(SHUFFLE_STORAGE_KEY).then((stored) => {
    if (stored === null) return;
    set({ isShuffle: stored });
  });
  storage.get<boolean>(REPEAT_STORAGE_KEY).then((stored) => {
    if (stored === null) return;
    set({ isRepeat: stored });
  });
  storage.get<number>(PITCH_RANGE_STORAGE_KEY).then((stored) => {
    if (stored === null || !PITCH_RANGE_OPTIONS.includes(stored as (typeof PITCH_RANGE_OPTIONS)[number])) return;
    set({ pitchRange: stored as (typeof PITCH_RANGE_OPTIONS)[number] });
  });
  storage.get<number>(PITCH_STORAGE_KEY).then((stored) => {
    if (stored === null || !isFinite(stored) || stored < PITCH_MIN_PERCENT || stored > PITCH_MAX_PERCENT) return;
    const range = get().pitchRange;
    const clamped = Math.min(range, Math.max(-range, stored));
    engine.setPlaybackRate(1 + clamped / 100);
    set({ pitch: clamped });
  });
  storage.get<boolean>(MASTER_TEMPO_STORAGE_KEY).then((stored) => {
    if (stored === null) return;
    engine.setPreservePitch(stored);
    set({ masterTempo: stored });
  });

  engine.onNativePlaying = onPlaybackStarted;
  engine.onNetworkMode = (mode) => prefetchScheduler.setNetworkMode(mode);
  engine.resolveNativeSeekUrl = (offset) => {
    const track = get().currentTrack;
    const client = getActiveClient();
    const quality = getQualityById(getActiveQualityId());
    if (!track || !client || !quality || quality.format === "raw") return null;
    const applied = Math.floor(offset);
    return {
      url: client.getStreamUrl(track.id, { format: quality.format, maxBitRate: quality.maxBitRate, timeOffset: applied }),
      offset: applied,
    };
  };
  // Bureau : empêche la mise en veille de l'app (App Nap sur macOS) tant que la lecture est en
  // cours ou en train de démarrer — sans quoi l'OS bride timers et callbacks réseau du renderer
  // dès que la fenêtre passe en arrière-plan, et la lecture attend ou cale. Un navigateur gère ça
  // lui-même ; une app Electron non. Relâché en pause/à l'arrêt pour laisser l'OS économiser.
  let powerSaveHeld = false;
  engine.onStateChange((state) => {
    set({ engineState: state });
    const shouldHold = state === "playing" || state === "loading" || state === "buffering" || state === "ready";
    if (shouldHold === powerSaveHeld || !window.resonia) return;
    powerSaveHeld = shouldHold;
    void (shouldHold ? window.resonia.powerSave.start() : window.resonia.powerSave.stop()).catch(() => {});
  });

  /** Repli quand le streaming natif est structurellement injouable (voir
   *  GaplessEngine.onNativePlaybackUnsupported) : télécharge la piste en entier puis la
   *  décode, et démarre directement en mode buffer — chemin déjà utilisé pour le
   *  préchargement gapless, indépendant des requêtes Range HTTP. */
  engine.onNativePlaybackUnsupported = async (offset) => {
    const track = get().currentTrack;
    if (!track) return;
    const resolved = resolvePlayableTrack(track);
    if (!resolved) return;

    try {
      const key = decodedCacheKey(track.id, resolved.qualityId);
      let decoded = decodedCache.get(key);
      if (!decoded) {
        // Même canal que le préchargement (une seule connexion, reprise possible) plutôt qu'un
        // fetch dédié : le flux natif n'a jamais démarré, rien d'autre n'utilise le réseau.
        const signal = playbackAbort.signal;
        prefetchScheduler.setNetworkMode("free");
        await activateCurrentTrackCaching();
        const arrayBuffer = await waitForTrackBytes(track.id, resolved.qualityId, signal);
        if (!arrayBuffer || get().currentTrack?.id !== track.id) return;
        if (arrayBuffer.byteLength === 0) throw new Error("Fichier en cache vide");
        decoded = await engine.decodeAndTrim(arrayBuffer);
        if (get().currentTrack?.id !== track.id) return;
        decodedCache.set(key, decoded);
      }
      engine.loadAndPlay(resolved.streamUrl, offset, decoded);
      onPlaybackStarted();
    } catch (err) {
      engine.reportError("Lecture impossible : ce flux n'est pas compatible avec ce navigateur", err);
    }
  };

  // Filet de sécurité uniquement : fin de queue (rien n'était planifié), ou la
  // préparation gapless a échoué (réseau/décodage) et rien n'a été programmé sur
  // l'horloge audio. Le chemin de succès est géré entièrement par commitSwap ci-dessus.
  engine.onEnded(() => get().nextTrack());

  // Anciennement requestAnimationFrame (60 ticks/s, y compris piste en pause ou fenêtre
  // en arrière-plan) : chaque tick faisait un set({ currentTime }) qui re-render tout
  // composant abonné au store entier, et tournait même sans rien à afficher. La barre de
  // progression n'a besoin d'aucune précision à l'œil au-delà de ~250ms. Aucun ticker
  // tant que rien ne joue (gate sur isPlaying ci-dessous).
  //
  // Cadence IDENTIQUE fenêtre visible ou masquée (contrairement à une version précédente
  // qui descendait à 1s en arrière-plan) : ce tick est aussi ce qui informe le Now Playing
  // système (setNowPlayingPositionState) de la position de lecture. Un intervalle plus
  // long laisse davantage de marge à App Nap/macOS pour retarder/regrouper le timer d'une
  // fenêtre masquée — observé en pratique comme un compteur qui saute (0, 2, 4, 6s au lieu
  // de 0, 1, 2, 3s) dans le widget système. Demander une cadence courte et constante est
  // servi plus fidèlement par l'OS. Le coût gardé (React/Zustand) est de toute façon
  // négligeable : le tick ne touche qu'un petit composant isolé (ProgressBar), invisible
  // qui plus est quand la fenêtre est masquée.
  //
  // Le timer ne tourne QUE pendant la lecture : en pause/à l'arrêt, plus aucun réveil
  // périodique (laisse le CPU dormir, App Nap/économie d'énergie peuvent agir). Il est
  // relancé par l'abonnement ci-dessous dès que la lecture reprend.
  // Fenêtre masquée : le Now Playing système et le scrobble restent alimentés, mais on ne
  // pousse plus currentTime dans le store (aucun re-render React pour une UI invisible) —
  // resynchronisé d'un coup au retour au premier plan (visibilitychange).
  const TICK_INTERVAL_MS = 250;
  let tickTimer: number | null = null;

  // Garde ESSENTIELLE : le `set()` fait pendant un tick notifie l'abonnement ci-dessous, qui
  // planifierait un 2e timer en plus de celui que le tick replanifie lui-même — sans cette
  // garde, chaque tick ajoutait un timer, les mises à jour du store s'emballaient (CPU à 100 %,
  // des centaines de Mo alloués par seconde). Il ne doit exister qu'UN seul timer à la fois.
  function scheduleTick() {
    if (tickTimer !== null) return;
    tickTimer = window.setTimeout(tickProgress, TICK_INTERVAL_MS);
  }

  function tickProgress() {
    tickTimer = null;
    const { currentTrack: track, isPlaying } = get();
    if (!track || !isPlaying) return;
    // Un seek est débounced (voir setCurrentTime) : tant qu'il n'est pas encore parti sur
    // le moteur, ne pas resynchroniser currentTime depuis engine.currentTime (position
    // pré-seek) — ça écraserait la position optimiste affichée au clic.
    if (pendingSeekTime === null) {
      let time = engine.currentTime;
      const duration = engine.duration;
      if (seekSettleTarget !== null) {
        if (Math.abs(time - seekSettleTarget) < 1 || performance.now() > seekSettleUntil) {
          seekSettleTarget = null;
        } else {
          time = seekSettleTarget;
        }
      }
      if (!document.hidden) set({ currentTime: time, duration, bufferedTime: currentBufferedTime(track, duration) });
      setNowPlayingPositionState(duration, time, false, engine.playbackRate);

      if (!scrobbledNowPlaying && time > 1) {
        scrobbledNowPlaying = true;
        sendScrobble(track, false);
      }
      const threshold = Math.min(duration / 2, 240);
      if (!scrobbledSubmission && duration >= SCROBBLE_MIN_DURATION && time >= threshold) {
        scrobbledSubmission = true;
        sendScrobble(track, true);
      }
    }
    scheduleTick();
  }

  // Barre de tampon en pause : le chargement continue (voir GaplessEngine.pause), la barre doit le
  // montrer. Une fois par seconde, uniquement tant que la piste n'est pas entièrement chargée — puis
  // plus aucun réveil.
  const BUFFER_POLL_MS = 1000;
  let bufferPollTimer: number | null = null;

  function scheduleBufferPoll() {
    if (bufferPollTimer !== null) return;
    bufferPollTimer = window.setTimeout(pollBuffered, BUFFER_POLL_MS);
  }

  // Relevés consécutifs sans progression : au-delà, plus rien ne charge (réseau coupé, fond en
  // attente) — on arrête de se réveiller, relancé au prochain changement d'état du lecteur.
  const BUFFER_POLL_MAX_IDLE = 15;
  let bufferPollIdle = 0;

  function pollBuffered() {
    bufferPollTimer = null;
    const { currentTrack: track, isPlaying, duration, bufferedTime } = get();
    // Fenêtre masquée : rien à afficher ; reprise via le `set` de visibilitychange.
    if (!track || isPlaying || document.hidden || duration <= 0 || bufferedTime >= duration - 0.5) return;
    const next = currentBufferedTime(track, duration);
    bufferPollIdle = next > bufferedTime ? 0 : bufferPollIdle + 1;
    if (next !== bufferedTime) set({ bufferedTime: next });
    if (bufferPollIdle < BUFFER_POLL_MAX_IDLE) scheduleBufferPoll();
  }

  api.subscribe((state) => {
    if (tickTimer === null && state.isPlaying && state.currentTrack) scheduleTick();
    if (bufferPollTimer === null && !state.isPlaying && state.currentTrack && state.bufferedTime < state.duration - 0.5) {
      bufferPollIdle = 0;
      scheduleBufferPoll();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || pendingSeekTime !== null || !get().currentTrack) return;
    set({ currentTime: engine.currentTime, duration: engine.duration });
  });

  initNowPlaying({
    onPlay: () => get().setPlaying(true),
    onPause: () => get().setPlaying(false),
    onNext: () => get().nextTrack(),
    onPrevious: () => get().prevTrack(),
    onSeekTo: (time) => get().setCurrentTime(time),
    // Ne PAS enregistrer onSeekForward/onSeekBackward : leur seule présence fait que les
    // widgets Now Playing système (macOS/Windows/Linux) affichent des boutons "avance/retour
    // de 10s" à la place de précédent/suivant. On veut précédent/suivant partout.
  }).catch((err) => console.error("[player] Échec d'initialisation du Now Playing système", err));

  // URL `blob:` locale (cache / téléchargement) de la piste en cours de lecture native. Chaque
  // URL garde son Blob vivant tant qu'elle n'est pas révoquée : sans cette libération, CHAQUE
  // piste écoutée depuis le cache restait en mémoire jusqu'à la fermeture de l'onglet — des Go
  // au bout de quelques heures d'écoute. On n'en garde donc qu'une : celle de la piste courante.
  let activeLocalUrl: string | null = null;

  function releaseActiveLocalUrl(next: string | null) {
    if (activeLocalUrl && activeLocalUrl !== next) URL.revokeObjectURL(activeLocalUrl);
    activeLocalUrl = next;
  }

  async function loadAndPlay(track: Track, queue: Track[], offset = 0) {
    const myGeneration = ++loadGeneration;

    const resolved = resolvePlayableTrack(track);
    if (!resolved) {
      console.warn("[player] Impossible de résoudre le flux (serveur actif manquant ou qualité invalide)");
      return;
    }

    resetPlaybackFlags();
    abortPlaybackWaits();
    // Toute la bande passante pour le démarrage de la nouvelle piste : les téléchargements de
    // l'ancienne file (piste quittée, préchargements) s'arrêtent ici, quel que soit le chemin
    // d'appel (clic sur une piste/un album, suivant, précédent). Ils reprennent pour la nouvelle
    // file une fois la lecture réellement démarrée (onPlaybackStarted).
    prefetchScheduler.stop();

    const key = decodedCacheKey(track.id, resolved.qualityId);
    const decoded = decodedCache.get(key);
    // Le fichier téléchargé (permanent, choix explicite de l'utilisateur) est toujours
    // préféré au cache (LRU transitoire) quand les deux existent pour cette piste/qualité.
    const localUrl = decoded
      ? null
      : (await downloadStore.resolvePlaybackUrl(track.id, resolved.qualityId, resolved.format)) ??
        (await cacheStore.resolvePlaybackUrl(track.id, resolved.qualityId, resolved.format));

    // Un appel plus récent a déjà pris le dessus pendant cette attente : ne rien committer,
    // engine et Now Playing reflètent déjà la piste voulue — et libérer l'URL devenue inutile.
    if (myGeneration !== loadGeneration) {
      if (localUrl) URL.revokeObjectURL(localUrl);
      return;
    }

    const instantUrl = localUrl ?? resolved.streamUrl;
    // Un blob local (téléchargement ou cache) n'a ni Range HTTP ni CORS à satisfaire : le
    // repli MediaSource ne s'applique qu'au vrai flux réseau.
    const mimeType = localUrl ? undefined : MSE_MIME_TYPE[resolved.format];

    engine.trackDurationHint = track.duration;
    // Un fichier local accepte les positionnements libres ; un flux transcodé, non (voir seek).
    engine.loadAndPlay(instantUrl, offset, decoded ?? undefined, mimeType, Boolean(localUrl));
    // Le moteur a remplacé la source : l'URL locale de la piste précédente n'est plus lue.
    releaseActiveLocalUrl(localUrl);

    // En mode buffer (piste déjà décodée), `engine.duration` est connue immédiatement ; en
    // streaming natif, elle vaut encore 0 tant que les métadonnées n'ont pas chargé —
    // `tickProgress` la recale dès qu'elle devient disponible.
    set({ currentTrack: track, queue, currentTime: offset, duration: engine.duration, bufferedTime: offset, isPlaying: true });
    updateNowPlayingMetadata(track);
    setNowPlayingPlaybackState("playing");
    setNowPlayingPositionState(engine.duration, offset, true, engine.playbackRate);

    // Une piste déjà décodée démarre directement en mode buffer : aucun événement natif
    // "playing" ne se déclenchera pour signaler le démarrage effectif.
    if (decoded) onPlaybackStarted();
  }

  return {
    currentTrack: null,
    setCurrentTrack: (track) => set({ currentTrack: track }),

    queue: [],
    queueIndex: -1,
    playOrder: [],
    playOrderPosition: -1,

    playTrack: async (track, queueParam) => {
      const queue = queueParam ?? [track];
      const { isShuffle } = get();

      const clickedIndex = queue.findIndex((t) => t.id === track.id);
      const anchor = clickedIndex === -1 ? 0 : clickedIndex;

      const playOrder = isShuffle ? shuffleIndices(queue.length, anchor) : linearOrder(queue.length);
      const startPosition = isShuffle ? 0 : anchor;

      set({ queue, playOrder, playOrderPosition: startPosition, queueIndex: playOrder[startPosition] });
      await loadAndPlay(queue[playOrder[startPosition]], queue, 0);
    },

    playFromStart: async (queue) => {
      if (queue.length === 0) return;
      const { isShuffle } = get();

      const playOrder = isShuffle ? shuffleIndices(queue.length) : linearOrder(queue.length);

      set({ queue, playOrder, playOrderPosition: 0, queueIndex: playOrder[0] });
      await loadAndPlay(queue[playOrder[0]], queue, 0);
    },

    isPlaying: false,
    togglePlay: () => {
      const { currentTrack, isPlaying, queue, isShuffle, playOrder, playOrderPosition } = get();
      if (!currentTrack) {
        // Rien n'est chargé (pas juste en pause) : file jamais démarrée (ajout à la file) ou
        // arrivée à son terme. Passer par nextTrack() ne relançait rien dans ce second cas — la
        // position était déjà sur la dernière piste, le bouton Lecture restait sans effet — et
        // démarrait toujours sur la première piste ajoutée, aléatoire activé ou non. On repart
        // donc du début de la file, avec un nouvel ordre aléatoire si le mode est actif.
        if (queue.length === 0) return;
        const finished = playOrderPosition >= playOrder.length - 1;
        if (isShuffle && (finished || playOrderPosition < 0)) {
          void get().playFromStart(queue);
        } else {
          const startPosition = finished || playOrderPosition < 0 ? 0 : playOrderPosition + 1;
          const order = playOrder.length === queue.length ? playOrder : linearOrder(queue.length);
          set({ playOrder: order, playOrderPosition: startPosition, queueIndex: order[startPosition] });
          void loadAndPlay(queue[order[startPosition]], queue, 0);
        }
        return;
      }
      if (isPlaying) {
        engine.pause();
        if (get().airplayConnectedId) void window.resonia?.airplay.reset();
        set({ isPlaying: false });
        setNowPlayingPlaybackState("paused");
        setNowPlayingPositionState(engine.duration, engine.currentTime, true, engine.playbackRate);
      } else {
        engine.resume();
        set({ isPlaying: true });
        setNowPlayingPlaybackState("playing");
        setNowPlayingPositionState(engine.duration, engine.currentTime, true, engine.playbackRate);
      }
    },
    setPlaying: (playing) => {
      if (playing) engine.resume();
      else {
        engine.pause();
        if (get().airplayConnectedId) void window.resonia?.airplay.reset();
      }
      set({ isPlaying: playing });
      setNowPlayingPlaybackState(playing ? "playing" : "paused");
      setNowPlayingPositionState(engine.duration, engine.currentTime, true, engine.playbackRate);
    },

    engineState: "idle",

    currentTime: 0,
    duration: 0,
    bufferedTime: 0,
    setCurrentTime: (time) => {
      // Le swap gapless est désormais planifié à l'avance (horloge exacte), pas déclenché
      // en réaction à un événement : un seek à l'intérieur de la piste courante n'invalide
      // donc pas la préparation de la piste suivante déjà programmée — engine.seek()
      // l'annule et la replanifie lui-même proprement.
      //
      // Le seek réel sur le moteur est débounced (voir SEEK_DEBOUNCE_MS) : la position
      // affichée, elle, suit le clic instantanément pour rester réactive.
      //
      // Clampé sur `engine.duration` (via `get().duration`), pas sur la durée demandée par
      // l'appelant (qui, côté UI, dérive de `currentTrack.duration` — la métadonnée serveur) :
      // les deux peuvent diverger une fois en mode buffer (silence de bord rogné), et un
      // clic proche de la fin visuelle qui dépasserait la fin réelle atterrissait pile sur
      // (ou au-delà de) la fin du buffer décodé — arrêt immédiat de la source, `onended`
      // aussitôt déclenché, saut prématuré à la piste suivante avant que l'utilisateur
      // n'entende la fin.
      const engineDuration = get().duration;
      const clamped = engineDuration > 0 ? Math.max(0, Math.min(time, engineDuration)) : Math.max(0, time);
      pendingSeekTime = clamped;
      set({ currentTime: clamped });
      if (seekDebounceTimer !== null) window.clearTimeout(seekDebounceTimer);
      seekDebounceTimer = window.setTimeout(() => {
        seekDebounceTimer = null;
        const target = pendingSeekTime;
        pendingSeekTime = null;
        if (target !== null) {
          engine.seek(target);
          seekSettleTarget = target;
          seekSettleUntil = performance.now() + SEEK_SETTLE_MS;
        }
      }, SEEK_DEBOUNCE_MS);
    },

    isShuffle: false,
    toggleShuffle: () => {
      const { isShuffle, queue, playOrder, playOrderPosition } = get();
      const nextShuffleState = !isShuffle;

      if (queue.length === 0) {
        set({ isShuffle: nextShuffleState });
        storage.set(SHUFFLE_STORAGE_KEY, nextShuffleState);
        return;
      }

      if (nextShuffleState) {
        const newPlayOrder = reshuffleUpcoming(playOrder, playOrderPosition);
        set({ isShuffle: true, playOrder: newPlayOrder, queueIndex: newPlayOrder[playOrderPosition] });
      } else {
        const currentQueueIndex = playOrder[playOrderPosition];
        const newPlayOrder = linearOrder(queue.length);
        set({
          isShuffle: false,
          playOrder: newPlayOrder,
          playOrderPosition: currentQueueIndex,
          queueIndex: currentQueueIndex,
        });
      }
      storage.set(SHUFFLE_STORAGE_KEY, nextShuffleState);
      refreshUpcomingPrefetch();
      scheduledNextKey = null;
      scheduleGaplessNext();
    },

    isRepeat: false,
    toggleRepeat: () => {
      const isRepeat = !get().isRepeat;
      set({ isRepeat });
      storage.set(REPEAT_STORAGE_KEY, isRepeat);
      // La cible visée par la planification gapless change selon isRepeat (rejoue la
      // même piste vs avance normalement) — il faut refaire la planification.
      scheduledNextKey = null;
      scheduleGaplessNext();
    },

    prevTrack: () => {
      const { queue, playOrder, playOrderPosition, currentTime } = get();
      if (queue.length === 0) return;

      if (currentTime > 3) {
        get().setCurrentTime(0);
        return;
      }

      const prevPos = playOrderPosition - 1;
      if (prevPos < 0) {
        get().setCurrentTime(0);
        return;
      }

      const prevQueueIndex = playOrder[prevPos];
      set({ playOrderPosition: prevPos, queueIndex: prevQueueIndex });
      loadAndPlay(queue[prevQueueIndex], queue, 0);
    },

    nextTrack: () => {
      const { queue, playOrder, playOrderPosition, isRepeat, currentTrack } = get();

      if (queue.length === 0 || playOrder.length === 0) {
        engine.stop();
        releaseActiveLocalUrl(null);
        prefetchScheduler.stop();
        abortPlaybackWaits();
        set({ currentTrack: null, isPlaying: false, currentTime: 0 });
        clearNowPlaying();
        resetPlaybackFlags();
        return;
      }

      if (isRepeat && currentTrack) {
        loadAndPlay(currentTrack, queue, 0);
        return;
      }

      const nextPos = playOrderPosition + 1;
      if (nextPos >= playOrder.length) {
        engine.stop();
        releaseActiveLocalUrl(null);
        prefetchScheduler.stop();
        abortPlaybackWaits();
        set({ currentTrack: null, isPlaying: false, currentTime: 0 });
        clearNowPlaying();
        resetPlaybackFlags();
        return;
      }

      const nextQueueIndex = playOrder[nextPos];
      set({ playOrderPosition: nextPos, queueIndex: nextQueueIndex });
      loadAndPlay(queue[nextQueueIndex], queue, 0);
    },

    resetPlayback: () => {
      // Invalide tout chargement en vol : il ne doit pas relancer une piste de l'ancien serveur.
      loadGeneration++;
      engine.stop();
      releaseActiveLocalUrl(null);
      prefetchScheduler.stop();
      abortPlaybackWaits();
      decodedCache.clear();
      set({
        currentTrack: null,
        isPlaying: false,
        currentTime: 0,
        queue: [],
        queueIndex: -1,
        playOrder: [],
        playOrderPosition: -1,
        showLyrics: false,
      });
      clearNowPlaying();
      resetPlaybackFlags();
    },

    volume: 0.75,
    isMuted: false,
    setVolume: (volume) => {
      engine.setVolume(volume);
      set({ volume, isMuted: volume === 0 });
      storage.set(VOLUME_STORAGE_KEY, volume);
      // Garde le volume du récepteur AirPlay aligné sur celui de l'app tant qu'une session est
      // active — sans ça, un changement de volume dans l'UI n'aurait aucun effet perceptible
      // côté enceinte AirPlay (voir aussi le volume initial envoyé par connectAirplayDevice).
      if (get().airplayConnectedId) void window.resonia?.airplay.setVolume(Math.round(volume * 100));
    },
    toggleMute: () =>
      set((state) => {
        const nextMuted = !state.isMuted;
        engine.setVolume(nextMuted ? 0 : state.volume);
        return { isMuted: nextMuted };
      }),

    pitch: 0,
    setPitch: (percent) => {
      const range = get().pitchRange;
      const clamped = Math.min(range, Math.max(-range, percent));
      applyPitchToEngineThrottled(engine, 1 + clamped / 100);
      set({ pitch: clamped });
      storage.set(PITCH_STORAGE_KEY, clamped);
    },
    resetPitch: () => {
      // Action ponctuelle (bouton, pas un glissé) : pas besoin de throttle, et on veut que
      // le reset soit immédiat — on annule au passage une application throttlée en attente
      // pour qu'elle n'écrase pas ce reset une frame plus tard.
      cancelThrottledPitch();
      engine.setPlaybackRate(1);
      set({ pitch: 0 });
      storage.set(PITCH_STORAGE_KEY, 0);
    },
    showPitchMenu: false,
    togglePitchMenu: () => set((state) => ({ showPitchMenu: !state.showPitchMenu })),

    pitchRange: DEFAULT_PITCH_RANGE,
    setPitchRange: (range) => {
      cancelThrottledPitch();
      const clampedPitch = Math.min(range, Math.max(-range, get().pitch));
      engine.setPlaybackRate(1 + clampedPitch / 100);
      set({ pitchRange: range, pitch: clampedPitch });
      storage.set(PITCH_RANGE_STORAGE_KEY, range);
      storage.set(PITCH_STORAGE_KEY, clampedPitch);
    },

    masterTempo: false,
    toggleMasterTempo: () =>
      set((state) => {
        const masterTempo = !state.masterTempo;
        engine.setPreservePitch(masterTempo);
        storage.set(MASTER_TEMPO_STORAGE_KEY, masterTempo);
        return { masterTempo };
      }),

    showQueue: false,
    toggleQueue: () => set((state) => ({ showQueue: !state.showQueue })),
    reorderQueue: (dragIndex, hoverIndex) => {
      set((state) => {
        const newPlayOrder = [...state.playOrder];
        const [removed] = newPlayOrder.splice(dragIndex, 1);
        newPlayOrder.splice(hoverIndex, 0, removed);

        let newPlayOrderPosition = state.playOrderPosition;
        if (dragIndex === state.playOrderPosition) {
          newPlayOrderPosition = hoverIndex;
        } else if (dragIndex < state.playOrderPosition && hoverIndex >= state.playOrderPosition) {
          newPlayOrderPosition--;
        } else if (dragIndex > state.playOrderPosition && hoverIndex <= state.playOrderPosition) {
          newPlayOrderPosition++;
        }

        return {
          playOrder: newPlayOrder,
          playOrderPosition: newPlayOrderPosition,
          queueIndex: newPlayOrder[newPlayOrderPosition],
        };
      });
      // La piste suivante (position+1) a pu changer suite au réordonnancement : la
      // planification gapless précédente, basée sur l'ancien ordre, doit être refaite.
      refreshUpcomingPrefetch();
      scheduledNextKey = null;
      scheduleGaplessNext();
    },
    addToQueue: (tracks, position = "end") => {
      const list = Array.isArray(tracks) ? tracks : [tracks];
      if (list.length === 0) return;

      set((state) => {
        const newQueue = [...state.queue, ...list];
        const newIndices = list.map((_, i) => state.queue.length + i);

        let newPlayOrder: number[];
        if (position === "next" && state.playOrder.length > 0) {
          const insertAt = state.playOrderPosition + 1;
          newPlayOrder = [...state.playOrder.slice(0, insertAt), ...newIndices, ...state.playOrder.slice(insertAt)];
        } else {
          newPlayOrder = [...state.playOrder, ...newIndices];
        }

        return { queue: newQueue, playOrder: newPlayOrder };
      });

      // Insertion en fin de file ou "next" : dans les deux cas la fenêtre de préchargement
      // (les PREFETCH_COUNT prochaines pistes) a pu changer — même traitement que reorderQueue.
      refreshUpcomingPrefetch();
      scheduledNextKey = null;
      scheduleGaplessNext();
    },
    showLyrics: false,
    toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
    showConnect: false,
    toggleConnect: () => {
      const opening = !get().showConnect;
      set((state) => ({ showConnect: !state.showConnect }));
      if (opening) {
        void get().refreshOutputDevices();
        if (get().airplaySupported) void get().refreshAirplayDevices();
      }
    },
    outputDevices: [],
    outputDevicesLoading: false,
    selectedOutputDeviceId: "default",
    outputDeviceSelectionSupported: engine.outputDeviceSelectionSupported,
    refreshOutputDevices: async () => {
      set({ outputDevicesLoading: true });
      try {
        const devices = await listOutputDevices();
        set({ outputDevices: devices, outputDevicesLoading: false });
      } catch (err) {
        console.warn("[player] Impossible de lister les sorties audio", err);
        set({ outputDevicesLoading: false });
      }
    },
    selectOutputDevice: async (deviceId: string) => {
      set({ selectedOutputDeviceId: deviceId });
      // En cas d'échec (périphérique disparu entre la liste et le clic),
      // GaplessEngine.onOutputDeviceUnavailable (câblé plus haut) ramène
      // `selectedOutputDeviceId` à "default" pour refléter le repli réel du moteur.
      await engine.setOutputDevice(deviceId);
    },

    airplayDevices: [],
    airplayDevicesLoading: false,
    airplayConnectedId: null,
    airplayConnecting: false,
    // Web uniquement pas dispo : aucun accès socket UDP/multicast brut hors d'un process Node
    // (voir le commentaire sur `airplay` dans lib/platform/index.ts).
    airplaySupported: isElectron(),
    refreshAirplayDevices: async () => {
      if (!window.resonia) return;
      set({ airplayDevicesLoading: true });
      try {
        const devices = await window.resonia.airplay.discover();
        set({ airplayDevices: devices, airplayDevicesLoading: false });
      } catch (err) {
        console.warn("[player] Découverte AirPlay impossible", err);
        set({ airplayDevicesLoading: false });
      }
    },
    connectAirplayDevice: async (deviceId: string, airplay2: boolean) => {
      const resonia = window.resonia;
      if (!resonia) return;
      const device = get().airplayDevices.find((d) => d.id === deviceId);
      if (!device) return;
      set({ airplayConnecting: true });
      try {
        resonia.airplay.connect(device.host, device.port, airplay2, Math.round(get().volume * 100));
        airplayEncoder.reset();
        await engine.attachAirplayTap((data) => airplayEncoder.push(data.left, data.right, data.sampleRate));
        // Façon Spotify Connect : une fois connecté, le son ne sort QUE de l'enceinte AirPlay —
        // sans ça, le Mac et l'enceinte jouaient la même piste avec un décalage réseau audible
        // comme un écho (retour utilisateur). Le tap AirPlay lui-même n'est pas affecté, voir
        // GaplessEngine.setLocalOutputMuted.
        engine.setLocalOutputMuted(true);
        set({ airplayConnectedId: deviceId, airplayConnecting: false });
      } catch (err) {
        console.warn("[player] Connexion AirPlay impossible", err);
        set({ airplayConnecting: false });
      }
    },
    disconnectAirplayDevice: async () => {
      engine.detachAirplayTap();
      engine.setLocalOutputMuted(false);
      airplayEncoder.reset();
      set({ airplayConnectedId: null });
      await window.resonia?.airplay.disconnect();
    },

    showTimeRemaining: false,
    toggleTimeDisplay: () =>
      set((state) => {
        const showTimeRemaining = !state.showTimeRemaining;
        storage.set(TIME_DISPLAY_STORAGE_KEY, showTimeRemaining);
        return { showTimeRemaining };
      }),

    showDebugPanel: false,
    toggleDebugPanel: () => set((state) => ({ showDebugPanel: !state.showDebugPanel })),
    ensureCurrentWaveform: () => {
      const track = get().currentTrack;
      if (!track) return;
      const decoded = decodedCache.get(decodedCacheKey(track.id, getActiveQualityId()));
      if (decoded) void ensureWaveform(track.id, decoded.buffer);
    },
  };
});

export { DEFAULT_COVER_URL };
