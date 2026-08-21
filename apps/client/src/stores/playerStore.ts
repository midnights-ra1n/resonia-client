import { create } from "zustand";
import { cacheStore } from "../lib/audio/cache/cacheStore";
import { prefetchScheduler } from "../lib/audio/cache/prefetchScheduler";
import { DecodedBufferCache } from "../lib/audio/engine/decodedBufferCache";
import { getGaplessEngine } from "../lib/audio/engine/gaplessEngine";
import type { EngineState } from "../lib/audio/engine/types";
import {
  registerMediaSessionHandlers,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
  updateMediaSessionMetadata,
} from "../lib/audio/mediaSession";
import { getQualityById } from "../lib/audio/qualityOptions";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { storage } from "../lib/storage";
import { useServersStore } from "./serversStore";
import { useSettingsStore } from "./settingsStore";
import { linearOrder, reshuffleUpcoming, shuffleIndices } from "../lib/audio/shuffle";

const VOLUME_STORAGE_KEY = "resonia:settings:volume";
const TIME_DISPLAY_STORAGE_KEY = "resonia:settings:showTimeRemaining";

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  duration: number;
  coverUrl?: string;
}

const DEFAULT_COVER_URL = "/default-cover.svg";
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

function resolveStreamUrl(track: Track): string | null {
  const client = getActiveClient();
  if (!client) return null;
  const quality = getQualityById(getActiveQualityId());
  return client.getStreamUrl(track.id, { format: quality?.format, maxBitRate: quality?.maxBitRate });
}

interface PlayableTrack {
  streamUrl: string;
  qualityId: string;
  format: "aac" | "opus" | "mp3";
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
  return { streamUrl, qualityId: quality.id, format: quality.format };
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

  isPlaying: boolean;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;

  /** État précis du moteur de lecture (loading/buffering/ready/playing/paused/ended/error),
   *  exposé pour l'UI (ex: indicateur de chargement) — additif, `isPlaying` reste la
   *  source de vérité utilisée par les composants existants. */
  engineState: EngineState;

  currentTime: number;
  setCurrentTime: (time: number) => void;

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

  showQueue: boolean;
  toggleQueue: () => void;
  reorderQueue: (dragIndex: number, hoverIndex: number) => void;
  showLyrics: boolean;
  toggleLyrics: () => void;
  showConnect: boolean;
  toggleConnect: () => void;

  showTimeRemaining: boolean;
  toggleTimeDisplay: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const engine = getGaplessEngine();
  const decodedCache = new DecodedBufferCache();

  let scrobbledNowPlaying = false;
  let scrobbledSubmission = false;
  // Empêche de replanifier la même cible gapless plusieurs fois (déclenchement répété
  // du démarrage de lecture, changement de qualité, etc.).
  let scheduledNextKey: string | null = null;

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

  function clearPendingSeek() {
    if (seekDebounceTimer !== null) {
      window.clearTimeout(seekDebounceTimer);
      seekDebounceTimer = null;
    }
    pendingSeekTime = null;
  }

  function resetPlaybackFlags() {
    scheduledNextKey = null;
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
    for (let i = 1; i <= PREFETCH_COUNT; i++) {
      const pos = playOrderPosition + i;
      const queueIndex = playOrder[pos];
      if (queueIndex === undefined) break;
      const track = queue[queueIndex];
      const streamUrl = resolveStreamUrl(track);
      if (streamUrl) upcoming.push({ trackId: track.id, streamUrl });
    }
    prefetchScheduler.setUpcoming(upcoming);
  }

  /** Démarre la mise en cache en tâche de fond de la piste en cours. Volontairement
   *  déclenché une fois la lecture réellement démarrée — jamais au moment du clic : une
   *  deuxième connexion réseau vers la même piste concurrencerait le flux de lecture et
   *  retarderait le démarrage audible. */
  function activateCurrentTrackCaching() {
    const { currentTrack } = get();
    if (!currentTrack) return;
    const resolved = resolvePlayableTrack(currentTrack);
    if (!resolved) return;

    prefetchScheduler.setQuality(resolved.qualityId);
    prefetchScheduler.setActive({ trackId: currentTrack.id, streamUrl: resolved.streamUrl });
    cacheStore.request(currentTrack.id, resolved.qualityId, resolved.streamUrl, "active");
  }

  /** Attend que la piste (déjà demandée en cache "active") soit intégralement
   *  téléchargée, puis en lit les octets. */
  async function waitForActiveCached(trackId: string, qualityId: string): Promise<ArrayBuffer | null> {
    const already = await cacheStore.isFullyCached(trackId, qualityId);
    if (already) return cacheStore.readCachedFull(trackId, qualityId);
    return new Promise((resolve) => {
      const unsubscribe = cacheStore.onProgress(trackId, qualityId, (progress) => {
        if (!progress.complete) return;
        unsubscribe?.();
        cacheStore.readCachedFull(trackId, qualityId).then(resolve);
      });
      if (!unsubscribe) resolve(null);
    });
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

    const bytes = await waitForActiveCached(track.id, resolved.qualityId);
    if (!bytes || bytes.byteLength === 0) return;
    if (get().currentTrack?.id !== track.id) return; // la piste active a changé entre-temps

    try {
      const decoded = await engine.decodeAndTrim(bytes);
      if (get().currentTrack?.id !== track.id) return;
      decodedCache.set(key, decoded);
      engine.attachDecodedActive(decoded);
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

    const commitSwap = () => {
      scrobbledNowPlaying = false;
      scrobbledSubmission = false;
      scheduledNextKey = null;
      clearPendingSeek();
      set({
        currentTrack: nextTrackData,
        playOrderPosition: isRepeat ? get().playOrderPosition : nextPos,
        queueIndex: nextQueueIndex,
        currentTime: 0,
      });
      updateMediaSessionMetadata(nextTrackData);
      setMediaSessionPlaybackState("playing");
      refreshUpcomingPrefetch();
      activateCurrentTrackCaching();
      scheduleGaplessNext();
    };

    try {
      let decoded = decodedCache.get(key);
      if (!decoded) {
        const cachedBytes = await cacheStore.readCachedFull(nextTrackData.id, resolved.qualityId);
        const arrayBuffer =
          cachedBytes && cachedBytes.byteLength > 0
            ? cachedBytes
            : await fetch(resolved.streamUrl).then((res) => {
                if (!res.ok) throw new Error(`Échec du téléchargement (${res.status})`);
                return res.arrayBuffer();
              });

        if (scheduledNextKey !== key) return; // une nouvelle cible a pris le dessus entre-temps
        decoded = await engine.decodeAndTrim(arrayBuffer);
        if (scheduledNextKey !== key) return;
        decodedCache.set(key, decoded);
      }

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

  engine.onNativePlaying = onPlaybackStarted;
  engine.onNetworkPressure = (active) => (active ? prefetchScheduler.pause() : prefetchScheduler.resume());
  engine.onStateChange((state) => set({ engineState: state }));

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
        const arrayBuffer = await fetch(resolved.streamUrl).then((res) => {
          if (!res.ok) throw new Error(`Échec du téléchargement (${res.status})`);
          return res.arrayBuffer();
        });
        if (get().currentTrack?.id !== track.id) return;
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

  function tickProgress() {
    const track = get().currentTrack;
    // Un seek est débounced (voir setCurrentTime) : tant qu'il n'est pas encore parti sur
    // le moteur, ne pas resynchroniser currentTime depuis engine.currentTime (position
    // pré-seek) — ça écraserait la position optimiste affichée au clic.
    if (track && pendingSeekTime === null) {
      const time = engine.currentTime;
      const duration = engine.duration;
      set({ currentTime: time });
      setMediaSessionPositionState(duration, time);

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
    requestAnimationFrame(tickProgress);
  }
  requestAnimationFrame(tickProgress);

  registerMediaSessionHandlers({
    onPlay: () => get().togglePlay(),
    onPause: () => get().togglePlay(),
    onNext: () => get().nextTrack(),
    onPrevious: () => get().prevTrack(),
    onSeekTo: (time) => get().setCurrentTime(time),
  });

  async function loadAndPlay(track: Track, queue: Track[], offset = 0) {
    const resolved = resolvePlayableTrack(track);
    if (!resolved) {
      console.warn("[player] Impossible de résoudre le flux (serveur actif manquant ou qualité invalide)");
      return;
    }

    resetPlaybackFlags();

    const key = decodedCacheKey(track.id, resolved.qualityId);
    const decoded = decodedCache.get(key);
    const cachedUrl = decoded ? null : await cacheStore.resolvePlaybackUrl(track.id, resolved.qualityId, resolved.format);
    const instantUrl = cachedUrl ?? resolved.streamUrl;
    // Un blob OPFS local n'a ni Range HTTP ni CORS à satisfaire : le repli MediaSource ne
    // s'applique qu'au vrai flux réseau.
    const mimeType = cachedUrl ? undefined : MSE_MIME_TYPE[resolved.format];

    engine.loadAndPlay(instantUrl, offset, decoded ?? undefined, mimeType);

    set({ currentTrack: track, queue, currentTime: offset, isPlaying: true });
    updateMediaSessionMetadata(track);
    setMediaSessionPlaybackState("playing");

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
      const { currentTrack, isPlaying } = get();
      if (!currentTrack) return;
      if (isPlaying) {
        engine.pause();
        set({ isPlaying: false });
        setMediaSessionPlaybackState("paused");
      } else {
        engine.resume();
        set({ isPlaying: true });
        setMediaSessionPlaybackState("playing");
      }
    },
    setPlaying: (playing) => {
      if (playing) engine.resume();
      else engine.pause();
      set({ isPlaying: playing });
      setMediaSessionPlaybackState(playing ? "playing" : "paused");
    },

    engineState: "idle",

    currentTime: 0,
    setCurrentTime: (time) => {
      // Le swap gapless est désormais planifié à l'avance (horloge exacte), pas déclenché
      // en réaction à un événement : un seek à l'intérieur de la piste courante n'invalide
      // donc pas la préparation de la piste suivante déjà programmée — engine.seek()
      // l'annule et la replanifie lui-même proprement.
      //
      // Le seek réel sur le moteur est débounced (voir SEEK_DEBOUNCE_MS) : la position
      // affichée, elle, suit le clic instantanément pour rester réactive.
      pendingSeekTime = time;
      set({ currentTime: time });
      if (seekDebounceTimer !== null) window.clearTimeout(seekDebounceTimer);
      seekDebounceTimer = window.setTimeout(() => {
        seekDebounceTimer = null;
        const target = pendingSeekTime;
        pendingSeekTime = null;
        if (target !== null) engine.seek(target);
      }, SEEK_DEBOUNCE_MS);
    },

    isShuffle: false,
    toggleShuffle: () => {
      const { isShuffle, queue, playOrder, playOrderPosition } = get();
      const nextShuffleState = !isShuffle;

      if (queue.length === 0) {
        set({ isShuffle: nextShuffleState });
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
      refreshUpcomingPrefetch();
      scheduledNextKey = null;
      scheduleGaplessNext();
    },

    isRepeat: false,
    toggleRepeat: () => {
      set((state) => ({ isRepeat: !state.isRepeat }));
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
      prefetchScheduler.stop();
      loadAndPlay(queue[prevQueueIndex], queue, 0);
    },

    nextTrack: () => {
      const { queue, playOrder, playOrderPosition, isRepeat, currentTrack } = get();

      if (queue.length === 0 || playOrder.length === 0) {
        engine.stop();
        prefetchScheduler.stop();
        set({ currentTrack: null, isPlaying: false, currentTime: 0 });
        updateMediaSessionMetadata({ title: "—", artist: "—", album: "—" });
        setMediaSessionPlaybackState("paused");
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
        prefetchScheduler.stop();
        set({ currentTrack: null, isPlaying: false, currentTime: 0 });
        updateMediaSessionMetadata({ title: "—", artist: "—", album: "—" });
        setMediaSessionPlaybackState("paused");
        resetPlaybackFlags();
        return;
      }

      const nextQueueIndex = playOrder[nextPos];
      set({ playOrderPosition: nextPos, queueIndex: nextQueueIndex });
      prefetchScheduler.stop();
      loadAndPlay(queue[nextQueueIndex], queue, 0);
    },

    volume: 0.75,
    isMuted: false,
    setVolume: (volume) => {
      engine.setVolume(volume);
      set({ volume, isMuted: volume === 0 });
      storage.set(VOLUME_STORAGE_KEY, volume);
    },
    toggleMute: () =>
      set((state) => {
        const nextMuted = !state.isMuted;
        engine.setVolume(nextMuted ? 0 : state.volume);
        return { isMuted: nextMuted };
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
    showLyrics: false,
    toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
    showConnect: false,
    toggleConnect: () => set((state) => ({ showConnect: !state.showConnect })),

    showTimeRemaining: false,
    toggleTimeDisplay: () =>
      set((state) => {
        const showTimeRemaining = !state.showTimeRemaining;
        storage.set(TIME_DISPLAY_STORAGE_KEY, showTimeRemaining);
        return { showTimeRemaining };
      }),
  };
});

export { DEFAULT_COVER_URL };
