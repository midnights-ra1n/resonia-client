import { create } from "zustand";
import { getSampleAccurateEngine } from "../lib/audio/sampleAccurateEngine";
import { loadTrackArrayBuffer } from "../lib/audio/audioCache";
import { detectEdgeSilence } from "../lib/audio/trimSilence";
import {
  updateMediaSessionMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
  registerMediaSessionHandlers,
} from "../lib/audio/mediaSession";
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
const SCROBBLE_MIN_DURATION = 30;

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
  const engine = getSampleAccurateEngine();

  let scheduledNextKey: string | null = null;
  let scrobbledNowPlaying = false;
  let scrobbledSubmission = false;

  function resetPlaybackFlags() {
    scheduledNextKey = null;
    scrobbledNowPlaying = false;
    scrobbledSubmission = false;
  }

  function sendScrobble(track: Track, submission: boolean) {
    const client = getActiveClient();
    if (!client) return;
    client.scrobble(track.id, { submission }).catch((err) => console.warn("[player] Scrobble échoué", err));
  }

  function tickProgress() {
    const track = get().currentTrack;
    if (track) {
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

  engine.onEnded(() => get().nextTrack());

  registerMediaSessionHandlers({
    onPlay: () => get().togglePlay(),
    onPause: () => get().togglePlay(),
    onNext: () => get().nextTrack(),
    onPrevious: () => get().prevTrack(),
    onSeekTo: (time) => get().setCurrentTime(time),
  });

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
        updateMediaSessionMetadata(nextTrackData);
        resetPlaybackFlags();
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
      const arrayBuffer = await loadTrackArrayBuffer(track.id, qualityId, streamUrl);
      const audioBuffer = await engine.decode(arrayBuffer);
      const trim = detectEdgeSilence(audioBuffer);

      const index = queue.findIndex((t) => t.id === track.id);
      engine.play(audioBuffer, trim, offset);
      resetPlaybackFlags();

      set({
        currentTrack: track,
        queue,
        queueIndex: index === -1 ? 0 : index,
        currentTime: offset,
        isPlaying: true,
      });

      updateMediaSessionMetadata(track);
      setMediaSessionPlaybackState("playing");

      scheduleGaplessNext();
    } catch (err) {
      console.error("[player] Impossible de charger le titre", err);
    }
  }

  return {
    currentTrack: null,
    setCurrentTrack: (track) => set({ currentTrack: track }),

    queue: [],
    queueIndex: -1,

    playTrack: async (track, queueParam) => {
      resetPlaybackFlags();
      await loadAndPlay(track, queueParam ?? [track], 0);
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
          setMediaSessionPlaybackState("paused");
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
