export interface MediaSessionTrackInfo {
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
}

function isSupported(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

export function updateMediaSessionMetadata(track: MediaSessionTrackInfo) {
  if (!isSupported()) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.coverUrl
      ? [
        { src: track.coverUrl, sizes: "96x96", type: "image/jpeg" },
        { src: track.coverUrl, sizes: "128x128", type: "image/jpeg" },
        { src: track.coverUrl, sizes: "256x256", type: "image/jpeg" },
        { src: track.coverUrl, sizes: "512x512", type: "image/jpeg" },
        { src: track.coverUrl, sizes: "1024x1024", type: "image/jpeg" },
      ]
      : [],
  });
}

export function setMediaSessionPlaybackState(state: "playing" | "paused" | "none") {
  if (!isSupported()) return;
  navigator.mediaSession.playbackState = state;
}

let _lastPositionState: { duration: number; position: number } | null = null;
let _currentPosition: number = 0;
const POSITION_UPDATE_THRESHOLD = 0.25;

export function setMediaSessionPositionState(duration: number, position: number) {
  if (!isSupported() || !("setPositionState" in navigator.mediaSession)) return;
  if (!isFinite(duration) || duration <= 0) return;

  const adjustedDuration = Math.max(duration, 0);
  const adjustedPosition = Math.min(Math.max(position, 0), adjustedDuration);

  if (
    _lastPositionState &&
    Math.abs(_lastPositionState.duration - adjustedDuration) < 0.1 &&
    Math.abs(_lastPositionState.position - adjustedPosition) < POSITION_UPDATE_THRESHOLD
  ) {
    return;
  }

  _lastPositionState = { duration: adjustedDuration, position: adjustedPosition };
  _currentPosition = adjustedPosition;

  try {
    navigator.mediaSession.setPositionState({
      duration: adjustedDuration,
      position: adjustedPosition,
      playbackRate: 1,
    });
  } catch {
  }
}

export function clearMediaSessionPositionState() {
  _lastPositionState = null;
}

export interface MediaSessionHandlers {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeekTo: (time: number) => void;
  onSeekForward?: () => void;
  onSeekBackward?: () => void;
}

const SEEK_INTERVAL = 10;

export function registerMediaSessionHandlers(handlers: MediaSessionHandlers) {
  if (!isSupported()) return;

  navigator.mediaSession.setActionHandler("play", handlers.onPlay);
  navigator.mediaSession.setActionHandler("pause", handlers.onPause);
  navigator.mediaSession.setActionHandler("nexttrack", handlers.onNext);
  navigator.mediaSession.setActionHandler("previoustrack", handlers.onPrevious);

  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (details.seekTime !== undefined) {
      handlers.onSeekTo(details.seekTime);
    }
  });

  if (handlers.onSeekForward) {
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      const offset = details.seekOffset ?? SEEK_INTERVAL;
      handlers.onSeekTo(_currentPosition + offset);
    });
  }

  if (handlers.onSeekBackward) {
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      const offset = details.seekOffset ?? SEEK_INTERVAL;
      handlers.onSeekTo(_currentPosition - offset);
    });
  }
}

export function updateCurrentPositionForSeek(currentTime: number) {
  _currentPosition = currentTime;
}
export function resetMediaSession() {
  if (!isSupported()) return;

  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = "none";

  try {
    navigator.mediaSession.setActionHandler("play", null);
    navigator.mediaSession.setActionHandler("pause", null);
    navigator.mediaSession.setActionHandler("nexttrack", null);
    navigator.mediaSession.setActionHandler("previoustrack", null);
    navigator.mediaSession.setActionHandler("seekto", null);
    navigator.mediaSession.setActionHandler("seekforward", null);
    navigator.mediaSession.setActionHandler("seekbackward", null);
  } catch {
  }

  clearMediaSessionPositionState();
  _currentPosition = 0;
}
