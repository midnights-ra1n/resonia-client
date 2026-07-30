import { create } from "zustand";
import { loadTrackArrayBuffer } from "../lib/audio/audioCache";
import { getQualityById } from "../lib/audio/qualityOptions";
import { detectEdgeSilence } from "../lib/audio/trimSilence";
import { getAudioEngine } from "../lib/audio/webAudioEngine";
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

  networkStatus: NetworkStatus;
  retryConnection: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const engine = getAudioEngine();

  let lastKnownTime = 0;
  let wasPlayingBeforeHide = false;
  let lastHiddenAt = Date.now();
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let scheduledNextKey: string | null = null;

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function tickProgress() {
    if (get().currentTrack) {
      set({ currentTime: engine.currentTime });
    }
    requestAnimationFrame(tickProgress);
  }
  requestAnimationFrame(tickProgress);

  engine.onEnded(() => get().nextTrack());

  async function scheduleGaplessNext() {
    const { queue, queueIndex, isShuffle, isRepeat } = get();
    if (isShuffle || queue.length < 2) return;

    const nextIndex = queueIndex + 1;
    const nextTrackData = isRepeat ? get().currentTrack : queue[nextIndex];
    if (!nextTrackData) return;

    const qualityId = getActiveQualityId();
    const key = `${nextTrackData.id}:${qualityId}`;
    if (scheduledNextKey === key) return;
    scheduledNextKey = key;

    const streamUrl = resolveStreamUrl(nextTrackData);
    if (!streamUrl) return;

    try {
      const arrayBuffer = await loadTrackArrayBuffer(nextTrackData.id, qualityId, streamUrl);
      const audioBuffer = await engine.decode(arrayBuffer);
      const trim = detectEdgeSilence(audioBuffer);

      if (scheduledNextKey !== key) return;

      engine.scheduleGapless(audioBuffer, trim, () => {
        set({
          currentTrack: nextTrackData,
          queueIndex: isRepeat ? get().queueIndex : nextIndex,
          currentTime: 0,
        });
        scheduledNextKey = null;
        scheduleGaplessNext();
      });
    } catch (err) {
      console.warn("[player] Pré-chargement gapless échoué", err);
      scheduledNextKey = null;
    }
  }

  async function loadAndPlay(track: Track, queue: Track[], offset = 0) {
    const qualityId = getActiveQualityId();
    const streamUrl = resolveStreamUrl(track);
    if (!streamUrl) {
      console.warn("[player] Aucun serveur actif, lecture impossible");
      return;
    }

    try {
      set({ networkStatus: "reconnecting" });
      const arrayBuffer = await loadTrackArrayBuffer(track.id, qualityId, streamUrl);
      const audioBuffer = await engine.decode(arrayBuffer);
      const trim = detectEdgeSilence(audioBuffer);

      const index = queue.findIndex((t) => t.id === track.id);
      engine.play(audioBuffer, trim, offset);
      scheduledNextKey = null;

      set({
        currentTrack: track,
        queue,
        queueIndex: index === -1 ? 0 : index,
        currentTime: offset,
        isPlaying: true,
        networkStatus: "online",
      });

      scheduleGaplessNext();
    } catch (err) {
      console.error("[player] Impossible de charger le titre", err);
      lastKnownTime = offset;
      set({ networkStatus: "interrupted", isPlaying: false });
      reconnectTimer = setTimeout(() => loadAndPlay(track, queue, lastKnownTime), 2000);
    }
  }

  function handleInterruption() {
    const { currentTrack, queue } = get();
    if (!currentTrack) return;
    lastKnownTime = engine.currentTime;
    engine.pause();
    clearReconnectTimer();
    set({ networkStatus: "interrupted", isPlaying: false });
    reconnectTimer = setTimeout(() => loadAndPlay(currentTrack, queue, lastKnownTime), 2000);
  }

  window.addEventListener("offline", () => {
    if (get().currentTrack && get().isPlaying) handleInterruption();
  });
  window.addEventListener("online", () => {
    const { currentTrack, queue, networkStatus } = get();
    if (networkStatus === "interrupted" && currentTrack) {
      loadAndPlay(currentTrack, queue, lastKnownTime);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      wasPlayingBeforeHide = get().isPlaying;
      lastHiddenAt = Date.now();
    } else {
      const gap = Date.now() - lastHiddenAt;
      const { currentTrack, queue } = get();

      if (gap > 15000 && wasPlayingBeforeHide && currentTrack) {
        lastKnownTime = engine.currentTime;
        loadAndPlay(currentTrack, queue, lastKnownTime);
      } else if (engine.context.state === "suspended") {
        engine.context.resume();
      }
    }
  });

  return {
    currentTrack: null,
    setCurrentTrack: (track) => set({ currentTrack: track }),

    queue: [],
    queueIndex: -1,

    playTrack: async (track, queueParam) => {
      clearReconnectTimer();
      scheduledNextKey = null;
      await loadAndPlay(track, queueParam ?? [track], 0);
    },

    isPlaying: false,
    togglePlay: () => {
      const { currentTrack, networkStatus, isPlaying, queue } = get();
      if (!currentTrack) return;

      if (networkStatus === "interrupted") {
        loadAndPlay(currentTrack, queue, lastKnownTime);
        return;
      }

      if (isPlaying) {
        engine.pause();
        set({ isPlaying: false });
      } else {
        engine.resume();
        set({ isPlaying: true });
      }
    },
    setPlaying: (playing) => {
      if (playing) engine.resume();
      else engine.pause();
      set({ isPlaying: playing });
    },

    currentTime: 0,
    setCurrentTime: (time) => {
      engine.seek(time);
      scheduledNextKey = null;
      set({ currentTime: time });
      scheduleGaplessNext();
    },

    isShuffle: false,
    toggleShuffle: () =>
      set((state) => {
        scheduledNextKey = null;
        return { isShuffle: !state.isShuffle };
      }),
    isRepeat: false,
    toggleRepeat: () =>
      set((state) => {
        scheduledNextKey = null;
        return { isRepeat: !state.isRepeat };
      }),

    nextTrack: () => {
      const { queue, queueIndex, isShuffle, isRepeat, currentTrack } = get();
      if (queue.length === 0) return;

      clearReconnectTimer();

      if (isRepeat && currentTrack) {
        loadAndPlay(currentTrack, queue, 0);
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
          engine.stop();
          set({ isPlaying: false });
          return;
        }
      }

      loadAndPlay(queue[nextIndex], queue, 0);
    },

    prevTrack: () => {
      const { queue, queueIndex, currentTime } = get();
      if (queue.length === 0) return;

      clearReconnectTimer();

      if (currentTime > 3) {
        get().setCurrentTime(0);
        return;
      }

      const prevIndex = queueIndex - 1;
      if (prevIndex < 0) {
        get().setCurrentTime(0);
        return;
      }

      loadAndPlay(queue[prevIndex], queue, 0);
    },

    volume: 0.75,
    isMuted: false,
    setVolume: (volume) => {
      engine.setVolume(volume);
      set({ volume, isMuted: volume === 0 });
    },
    toggleMute: () =>
      set((state) => {
        const nextMuted = !state.isMuted;
        engine.setVolume(nextMuted ? 0 : state.volume);
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
    retryConnection: () => {
      const { currentTrack, queue } = get();
      if (currentTrack) loadAndPlay(currentTrack, queue, lastKnownTime);
    },
  };
});

export { DEFAULT_COVER_URL };
