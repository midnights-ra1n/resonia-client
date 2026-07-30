import { create } from "zustand";
import { cacheTrackInBackground, getCachedTrackUrl } from "../lib/audio/audioCache";
import { getAudioElement } from "../lib/audio/audioElement";
import { getQualityById } from "../lib/audio/qualityOptions";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { useServersStore } from "./serversStore";
import { useSettingsStore } from "./settingsStore";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl?: string;
}

const DEFAULT_COVER_URL = "/default-cover.svg";

export type NetworkStatus = "online" | "reconnecting" | "interrupted";

function getActiveQualityId(): string {
  return useSettingsStore.getState().audioQualityId;
}

function resolveStreamUrl(track: Track): string | null {
  const { servers, activeServerId } = useServersStore.getState();
  const activeServer = servers.find((s) => s.id === activeServerId);
  if (!activeServer) return null;

  const client = getClientForServer(activeServer);
  const quality = getQualityById(getActiveQualityId());

  return client.getStreamUrl(track.id, {
    format: quality?.format,
    maxBitRate: quality?.maxBitRate,
  });
}

export interface PlayerState {
  currentTrack: Track | null;
  setCurrentTrack: (track: Track | null) => void;

  queue: Track[];
  queueIndex: number;
  playTrack: (track: Track, queue?: Track[]) => Promise<void>;

  isPlaying: boolean;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;

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
  showLyrics: boolean;
  toggleLyrics: () => void;
  showConnect: boolean;
  toggleConnect: () => void;

  showTimeRemaining: boolean;
  toggleTimeDisplay: () => void;

  // networkStatus indicates the current state of the audio playback in relation to network connectivity
  networkStatus: NetworkStatus;
  retryConnection: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const audio = getAudioElement();

  let activeObjectUrl: string | null = null;

  function prefetchNextInQueue() {
    const { queue, queueIndex, isShuffle } = get();
    if (queue.length < 2) return;

    // Prédiction simple : le titre suivant naturel. En mode shuffle, la prochaine
    // piste réelle est aléatoire donc imprévisible ; on ne pré-charge pas dans ce cas.
    if (isShuffle) return;

    const nextIndex = queueIndex + 1;
    const nextTrack = queue[nextIndex];
    if (!nextTrack) return;

    const qualityId = getActiveQualityId();
    const url = resolveStreamUrl(nextTrack);
    if (url) cacheTrackInBackground(nextTrack.id, qualityId, url);
  }

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastKnownTime = 0;
  let wasPlayingBeforeHide = false;
  let lastHiddenAt = Date.now();

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function attemptReconnect() {
    const { currentTrack } = get();
    if (!currentTrack) return;

    const url = resolveStreamUrl(currentTrack);
    if (!url) {
      // no active server available, retry later
      reconnectTimer = setTimeout(attemptReconnect, 3000);
      return;
    }

    set({ networkStatus: "reconnecting" });
    audio.src = url;
    audio.currentTime = lastKnownTime;

    audio
      .play()
      .then(() => {
        clearReconnectTimer();
        set({ networkStatus: "online", isPlaying: true });
      })
      .catch(() => {
        reconnectTimer = setTimeout(attemptReconnect, 3000);
      });
  }

  function handleInterruption() {
    if (!get().currentTrack) return;
    lastKnownTime = audio.currentTime;
    clearReconnectTimer();
    set({ networkStatus: "interrupted", isPlaying: false });
    reconnectTimer = setTimeout(attemptReconnect, 2000);
  }

  // --- Événements natifs de l'élément <audio> ---
  audio.addEventListener("timeupdate", () => set({ currentTime: audio.currentTime }));
  audio.addEventListener("play", () => set({ isPlaying: true }));
  audio.addEventListener("pause", () => {
    // Une pause déclenchée par handleInterruption a déjà mis isPlaying à false ;
    // on évite ici d'écraser networkStatus si c'est une vraie pause utilisateur.
    if (get().networkStatus === "online") set({ isPlaying: false });
  });
  audio.addEventListener("ended", () => get().nextTrack());
  audio.addEventListener("error", handleInterruption);
  audio.addEventListener("stalled", () => {
    if (get().isPlaying) set({ networkStatus: "reconnecting" });
  });
  audio.addEventListener("playing", () => set({ networkStatus: "online" }));

  // --- Coupure réseau explicite (navigateur) ---
  window.addEventListener("offline", () => {
    if (get().currentTrack && get().isPlaying) handleInterruption();
  });
  window.addEventListener("online", () => {
    if (get().networkStatus === "interrupted") attemptReconnect();
  });

  // --- Détection de sortie de veille (gros écart de temps) ---
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      wasPlayingBeforeHide = get().isPlaying;
      lastHiddenAt = Date.now();
    } else {
      const gap = Date.now() - lastHiddenAt;
      // > 15s d'inactivité de l'onglet = probable mise en veille système.
      if (gap > 15000 && wasPlayingBeforeHide && get().currentTrack) {
        lastKnownTime = audio.currentTime;
        set({ networkStatus: "reconnecting" });
        attemptReconnect();
      }
    }
  });

  return {
    currentTrack: null,
    setCurrentTrack: (track) => set({ currentTrack: track }),

    queue: [],
    queueIndex: -1,

    playTrack: async (track, queue) => {
      const qualityId = getActiveQualityId();
      const nextQueue = queue ?? [track];
      const index = nextQueue.findIndex((t) => t.id === track.id);

      clearReconnectTimer();

      // On révoque l'ancienne Object URL (cache) si elle existe, pour éviter les fuites mémoire.
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = null;
      }

      // 1. Titre déjà en cache local -> lecture instantanée, zéro réseau.
      const cachedUrl = await getCachedTrackUrl(track.id, qualityId);
      if (cachedUrl) {
        activeObjectUrl = cachedUrl;
        audio.src = cachedUrl;
        audio.currentTime = 0;
        audio.volume = get().isMuted ? 0 : get().volume;
        audio.play().catch((err) => console.error("[player] Lecture impossible", err));

        set({
          currentTrack: track,
          queue: nextQueue,
          queueIndex: index === -1 ? 0 : index,
          currentTime: 0,
          isPlaying: true,
          networkStatus: "online",
        });

        prefetchNextInQueue();
        return;
      }

      // 2. Pas en cache -> streaming direct (déjà rapide grâce au Range HTTP progressif),
      //    et mise en cache en tâche de fond pour la prochaine fois.
      const streamUrl = resolveStreamUrl(track);
      if (!streamUrl) {
        console.warn("[player] Aucun serveur actif, lecture impossible");
        return;
      }

      audio.src = streamUrl;
      audio.currentTime = 0;
      audio.volume = get().isMuted ? 0 : get().volume;
      audio.play().catch((err) => console.error("[player] Lecture impossible", err));

      set({
        currentTrack: track,
        queue: nextQueue,
        queueIndex: index === -1 ? 0 : index,
        currentTime: 0,
        isPlaying: true,
        networkStatus: "online",
      });

      cacheTrackInBackground(track.id, qualityId, streamUrl);
      prefetchNextInQueue();
    },

    isPlaying: false,
    togglePlay: () => {
      const { currentTrack, networkStatus } = get();
      if (!currentTrack) return;

      if (networkStatus === "interrupted") {
        attemptReconnect();
        return;
      }

      if (audio.paused) {
        audio.play().catch((err) => console.error("[player] Lecture impossible", err));
      } else {
        audio.pause();
      }
    },
    setPlaying: (playing) => {
      if (playing) audio.play().catch(() => { });
      else audio.pause();
    },

    currentTime: 0,
    setCurrentTime: (time) => {
      audio.currentTime = time;
      set({ currentTime: time });
    },

    isShuffle: false,
    toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),
    isRepeat: false,
    toggleRepeat: () => set((state) => ({ isRepeat: !state.isRepeat })),

    nextTrack: () => {
      const { queue, queueIndex, isShuffle, isRepeat, currentTrack } = get();
      if (queue.length === 0) return;

      if (isRepeat && currentTrack) {
        get().playTrack(currentTrack, queue);
        return;
      }

      let nextIndex: number;
      if (isShuffle) {
        if (queue.length === 1) {
          nextIndex = 0;
        } else {
          do {
            nextIndex = Math.floor(Math.random() * queue.length);
          } while (nextIndex === queueIndex);
        }
      } else {
        nextIndex = queueIndex + 1;
        if (nextIndex >= queue.length) {
          audio.pause();
          set({ isPlaying: false });
          return;
        }
      }

      get().playTrack(queue[nextIndex], queue);
    },

    prevTrack: () => {
      const { queue, queueIndex, currentTime } = get();
      if (queue.length === 0) return;

      if (currentTime > 3) {
        get().setCurrentTime(0);
        return;
      }

      const prevIndex = queueIndex - 1;
      if (prevIndex < 0) {
        get().setCurrentTime(0);
        return;
      }

      get().playTrack(queue[prevIndex], queue);
    },

    volume: 0.75,
    isMuted: false,
    setVolume: (volume) => {
      audio.volume = volume;
      set({ volume, isMuted: volume === 0 });
    },
    toggleMute: () =>
      set((state) => {
        const nextMuted = !state.isMuted;
        audio.volume = nextMuted ? 0 : state.volume;
        return { isMuted: nextMuted };
      }),

    showQueue: false,
    toggleQueue: () => set((state) => ({ showQueue: !state.showQueue })),
    showLyrics: false,
    toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
    showConnect: false,
    toggleConnect: () => set((state) => ({ showConnect: !state.showConnect })),

    showTimeRemaining: false,
    toggleTimeDisplay: () => set((state) => ({ showTimeRemaining: !state.showTimeRemaining })),

    networkStatus: "online",
    retryConnection: () => attemptReconnect(),
  };
});

export { DEFAULT_COVER_URL };
