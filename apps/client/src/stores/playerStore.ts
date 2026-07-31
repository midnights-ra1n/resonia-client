import { create } from "zustand";
import { getHybridEngine, CROSSFADE_SECONDS } from "../lib/audio/hybridAudioEngine";
import { getCachedTrackUrl, cacheTrackInBackground } from "../lib/audio/audioCache";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { getQualityById } from "../lib/audio/qualityOptions";
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
const PRELOAD_LEAD_SECONDS = 10;
const SCROBBLE_MIN_DURATION = 30;

function getActiveQualityId(): string {
  return useSettingsStore.getState().audioQualityId;
}

function getActiveClient() {
  const { servers, activeServerId } = useServersStore.getState();
  const server = servers.find((s) => s.id === activeServerId);
  return server ? getClientForServer(server) : null;
}

async function resolvePlayableUrl(track: Track): Promise<string | null> {
  const qualityId = getActiveQualityId();

  const cached = await getCachedTrackUrl(track.id, qualityId);
  if (cached) return cached;

  const client = getActiveClient();
  if (!client) return null;

  const quality = getQualityById(qualityId);
  const streamUrl = client.getStreamUrl(track.id, {
    format: quality?.format,
    maxBitRate: quality?.maxBitRate,
  });

  cacheTrackInBackground(track.id, qualityId, streamUrl);
  return streamUrl;
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
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const engine = getHybridEngine();

  let preloadedForKey: string | null = null;
  let crossfadeTriggeredForKey: string | null = null;
  let scrobbledNowPlaying = false;
  let scrobbledSubmission = false;

  function resetPlaybackFlags() {
    preloadedForKey = null;
    crossfadeTriggeredForKey = null;
    scrobbledNowPlaying = false;
    scrobbledSubmission = false;
  }

  function sendScrobble(track: Track, submission: boolean) {
    const client = getActiveClient();
    if (!client) return;
    client.scrobble(track.id, { submission }).catch((err) => console.warn("[player] Scrobble échoué", err));
  }

  function upcomingTrack(): Track | null {
    const { queue, queueIndex, isShuffle, isRepeat, currentTrack } = get();
    if (isShuffle || queue.length < 2) return null;
    if (isRepeat) return currentTrack;
    return queue[queueIndex + 1] ?? null;
  }

  engine.onTimeUpdate(async (time, duration) => {
    const { currentTrack } = get();
    if (!currentTrack) return;

    set({ currentTime: time });

    if (!scrobbledNowPlaying && time > 1) {
      scrobbledNowPlaying = true;
      sendScrobble(currentTrack, false);
    }

    const threshold = Math.min(duration / 2, 240);
    if (!scrobbledSubmission && duration >= SCROBBLE_MIN_DURATION && time >= threshold) {
      scrobbledSubmission = true;
      sendScrobble(currentTrack, true);
    }

    const remaining = duration - time;

    if (remaining <= PRELOAD_LEAD_SECONDS && preloadedForKey !== currentTrack.id) {
      const next = upcomingTrack();
      if (next) {
        const url = await resolvePlayableUrl(next);
        if (url) {
          engine.preload(url);
          preloadedForKey = currentTrack.id;
        }
      }
    }

    if (remaining <= CROSSFADE_SECONDS + 0.05 && crossfadeTriggeredForKey !== currentTrack.id) {
      const next = upcomingTrack();
      if (next) {
        crossfadeTriggeredForKey = currentTrack.id;
        const { queueIndex, isRepeat } = get();
        const nextIndex = isRepeat ? queueIndex : queueIndex + 1;

        engine.crossfadeToPreloaded(() => {
          resetPlaybackFlags();
          set({ currentTrack: next, queueIndex: nextIndex, currentTime: 0 });
        });
      }
    }
  });

  engine.onEnded(() => get().nextTrack());

  async function loadAndPlay(track: Track, queue: Track[], offset = 0) {
    const url = await resolvePlayableUrl(track);
    if (!url) {
      console.warn("[player] Aucun serveur actif, lecture impossible");
      return;
    }

    const index = queue.findIndex((t) => t.id === track.id);
    resetPlaybackFlags();
    engine.playNew(url, offset);

    set({
      currentTrack: track,
      queue,
      queueIndex: index === -1 ? 0 : index,
      currentTime: offset,
      isPlaying: true,
    });
  }

  return {
    currentTrack: null,
    setCurrentTrack: (track) => set({ currentTrack: track }),

    queue: [],
    queueIndex: -1,

    playTrack: async (track, queueParam) => {
      await loadAndPlay(track, queueParam ?? [track], 0);
    },

    isPlaying: false,
    togglePlay: () => {
      const { currentTrack, isPlaying } = get();
      if (!currentTrack) return;
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
          engine.pause();
          set({ isPlaying: false });
          return;
        }
      }

      loadAndPlay(queue[nextIndex], queue, 0);
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
  };
});

export { DEFAULT_COVER_URL };
