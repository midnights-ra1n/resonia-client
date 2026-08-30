import {
  registerMediaSessionHandlers,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
  updateMediaSessionMetadata,
  resetMediaSession,
  type MediaSessionHandlers,
  type MediaSessionTrackInfo,
} from "./mediaSession";

export type { MediaSessionTrackInfo } from "./mediaSession";

/** Façade Now Playing système, unique implémentation web ET desktop : `navigator.mediaSession`
 *  est traduit nativement par la webview (WebView2/Chromium vers SMTC sur Windows, WebKit vers
 *  MPNowPlayingInfoCenter/MPRIS sur macOS/Linux) — aucun pont Rust custom n'est nécessaire. */
export type NowPlayingHandlers = MediaSessionHandlers;

export async function initNowPlaying(handlers: NowPlayingHandlers) {
  registerMediaSessionHandlers(handlers);
}

export function updateNowPlayingMetadata(track: MediaSessionTrackInfo) {
  updateMediaSessionMetadata(track);
}

export function setNowPlayingPlaybackState(state: "playing" | "paused") {
  setMediaSessionPlaybackState(state);
}

export function setNowPlayingPositionState(duration: number, position: number, force = false, playbackRate = 1) {
  setMediaSessionPositionState(duration, position, force, playbackRate);
}

export function clearNowPlaying() {
  resetMediaSession();
}
