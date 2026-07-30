import { create } from "zustand";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl?: string;
}

export interface PlayerState {
  // Track
  currentTrack: Track | null;
  setCurrentTrack: (track: Track | null) => void;

  // Playback
  isPlaying: boolean;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;

  // Progress
  currentTime: number;
  setCurrentTime: (time: number) => void;

  // Controls
  isShuffle: boolean;
  toggleShuffle: () => void;
  isRepeat: boolean;
  toggleRepeat: () => void;
  nextTrack: () => void;
  prevTrack: () => void;

  // Volume
  volume: number;
  isMuted: boolean;
  setVolume: (volume: number) => void;
  toggleMute: () => void;

  // UI panels
  showQueue: boolean;
  toggleQueue: () => void;
  showLyrics: boolean;
  toggleLyrics: () => void;
  showConnect: boolean;
  toggleConnect: () => void;

  // Time display
  showTimeRemaining: boolean;
  toggleTimeDisplay: () => void;
}

const DEFAULT_COVER_URL = "/default-cover.svg";

export const usePlayerStore = create<PlayerState>((set) => ({
  // Track
  currentTrack: null,
  setCurrentTrack: (track) => set({ currentTrack: track }),

  // Playback
  isPlaying: false,
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaying: (playing) => set({ isPlaying: playing }),

  // Progress
  currentTime: 0,
  setCurrentTime: (time) => set({ currentTime: time }),

  // Controls
  isShuffle: false,
  toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),
  isRepeat: false,
  toggleRepeat: () => set((state) => ({ isRepeat: !state.isRepeat })),
  nextTrack: () => {
    // Will be implemented when we have a playlist
    console.log("Next track");
  },
  prevTrack: () => {
    // Will be implemented when we have a playlist
    console.log("Previous track");
  },

  // Volume
  volume: 0.75,
  isMuted: false,
  setVolume: (volume) => set({ volume, isMuted: volume === 0 }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  // UI panels
  showQueue: false,
  toggleQueue: () => set((state) => ({ showQueue: !state.showQueue })),
  showLyrics: false,
  toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
  showConnect: false,
  toggleConnect: () => set((state) => ({ showConnect: !state.showConnect })),

  // Time display
  showTimeRemaining: false,
  toggleTimeDisplay: () =>
    set((state) => ({ showTimeRemaining: !state.showTimeRemaining })),
}));

export { DEFAULT_COVER_URL };
