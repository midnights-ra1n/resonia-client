import { create } from "zustand";
import { getCachedTrackUrl, loadTrackArrayBuffer } from "../lib/audio/audioCache";
import { getInstantGaplessEngine } from "../lib/audio/instantGaplessEngine";
import {
  registerMediaSessionHandlers,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
  updateMediaSessionMetadata,
} from "../lib/audio/mediaSession";
import { getQualityById } from "../lib/audio/qualityOptions";
import { detectEdgeSilence } from "../lib/audio/trimSilence";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { useServersStore } from "./serversStore";
import { useSettingsStore } from "./settingsStore";
import { linearOrder, reshuffleUpcoming, shuffleIndices } from "../lib/audio/shuffle";

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
  playOrder: number[];
  playOrderPosition: number;

  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  playFromStart: (queue: Track[]) => Promise<void>;

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
  reorderQueue: (dragIndex: number, hoverIndex: number) => void;
  showLyrics: boolean;
  toggleLyrics: () => void;
  showConnect: boolean;
  toggleConnect: () => void;

  showTimeRemaining: boolean;
  toggleTimeDisplay: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const engine = getInstantGaplessEngine();

  let scheduledNextKey: string | null = null;
  let scrobbledNowPlaying = false;
  let scrobbledSubmission = false;
  let decodeToken = 0;

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
    const { queue, playOrder, playOrderPosition, isRepeat } = get();
    if (queue.length < 2 || playOrder.length < 2) return;

    const nextPos = playOrderPosition + 1;
    const nextQueueIndex = isRepeat ? playOrder[playOrderPosition] : playOrder[nextPos];
    if (nextQueueIndex === undefined) return;

    const nextTrackData = queue[nextQueueIndex];
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

      engine.scheduleNext(audioBuffer, trim, () => {
        set({
          currentTrack: nextTrackData,
          playOrderPosition: isRepeat ? get().playOrderPosition : nextPos,
          queueIndex: nextQueueIndex,
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

  async function refinePreciseTrim(track: Track, qualityId: string, streamUrl: string, token: number) {
    try {
      const arrayBuffer = await loadTrackArrayBuffer(track.id, qualityId, streamUrl);
      const audioBuffer = await engine.decode(arrayBuffer);
      if (token !== decodeToken) return;
      const trim = detectEdgeSilence(audioBuffer);
      engine.attachPreciseTrim(trim, audioBuffer.duration);
    } catch (err) {
      console.warn("[player] Décodage en arrière-plan échoué (trim précis indisponible)", err);
    }
  }

  async function loadAndPlay(track: Track, queue: Track[], offset = 0) {
  const qualityId = getActiveQualityId();

  const cachedUrl = await getCachedTrackUrl(track.id, qualityId);
  const instantUrl = cachedUrl ?? resolveStreamUrl(track);
  if (!instantUrl) {
    console.warn("[player] Aucun serveur actif, lecture impossible");
    return;
  }

  resetPlaybackFlags();
  decodeToken++;
  const token = decodeToken;

  engine.playInstant(instantUrl, offset);

  set({
    currentTrack: track,
    queue,
    currentTime: offset,
    isPlaying: true,
  });

  updateMediaSessionMetadata(track);
  setMediaSessionPlaybackState("playing");

  const networkStreamUrl = resolveStreamUrl(track);
  if (networkStreamUrl) {
    refinePreciseTrim(track, qualityId, networkStreamUrl, token);
  }

  scheduleGaplessNext();
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

    currentTime: 0,
    setCurrentTime: (time) => {
      engine.seek(time);
      scheduledNextKey = null;
      set({ currentTime: time });
      scheduleGaplessNext();
    },

    isShuffle: false,
    toggleShuffle: () => {
      scheduledNextKey = null;
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
    },

    isRepeat: false,
    toggleRepeat: () =>
      set((state) => {
        scheduledNextKey = null;
        return { isRepeat: !state.isRepeat };
      }),

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
        set({ currentTrack: null, isPlaying: false, currentTime: 0 });
        updateMediaSessionMetadata({ title: "—", artist: "—", album: "—" });
        setMediaSessionPlaybackState("paused");
        resetPlaybackFlags();
        return;
      }

      const nextQueueIndex = playOrder[nextPos];
      set({ playOrderPosition: nextPos, queueIndex: nextQueueIndex });
      loadAndPlay(queue[nextQueueIndex], queue, 0);
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
    reorderQueue: (dragIndex, hoverIndex) =>
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
    }),
    showLyrics: false,
    toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
    showConnect: false,
    toggleConnect: () => set((state) => ({ showConnect: !state.showConnect })),

    showTimeRemaining: false,
    toggleTimeDisplay: () => set((state) => ({ showTimeRemaining: !state.showTimeRemaining })),
  };
});

export { DEFAULT_COVER_URL };

