import { isTauri } from "../platform";
import {
  registerMediaSessionHandlers,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
  updateMediaSessionMetadata,
  resetMediaSession,
  type MediaSessionHandlers,
  type MediaSessionTrackInfo,
} from "./mediaSession";
import {
  registerDesktopMediaControls,
  updateDesktopMediaMetadata,
  setDesktopPlaybackState,
  clearDesktopMediaControls,
} from "./desktopMediaControls";

export type { MediaSessionTrackInfo } from "./mediaSession";

/** Façade unique utilisée par playerStore pour piloter le Now Playing système : bascule
 *  automatiquement entre la Web MediaSession API (navigateur) et le pont natif Rust
 *  (app de bureau — voir desktopMediaControls.ts pour le pourquoi). Un seul chemin actif à
 *  la fois, jamais les deux : sur desktop, enregistrer aussi les handlers Web MediaSession
 *  risquerait un double déclenchement (next/prev) si WKWebView relayait la commande en plus
 *  du pont natif sur certaines versions de macOS. */
export interface NowPlayingHandlers extends MediaSessionHandlers {
  /** Reçu directement du système sur desktop (togglePlayPauseCommand — la commande envoyée
   *  par la touche F8) : le play/pause système n'indique pas l'intention voulue (jouer vs.
   *  mettre en pause), seulement "bascule", contrairement à play/pause navigateur. */
  onToggle: () => void;
}

let lastKnownPlaying = false;
let lastKnownPosition = 0;

export async function initNowPlaying(handlers: NowPlayingHandlers) {
  if (isTauri()) {
    await registerDesktopMediaControls(handlers);
    return;
  }
  registerMediaSessionHandlers(handlers);
}

export function updateNowPlayingMetadata(track: MediaSessionTrackInfo, durationSecs?: number) {
  if (isTauri()) {
    updateDesktopMediaMetadata(track, durationSecs);
    return;
  }
  updateMediaSessionMetadata(track);
}

export function setNowPlayingPlaybackState(state: "playing" | "paused") {
  lastKnownPlaying = state === "playing";
  if (isTauri()) {
    setDesktopPlaybackState(lastKnownPlaying, lastKnownPosition);
    return;
  }
  setMediaSessionPlaybackState(state);
}

export function setNowPlayingPositionState(duration: number, position: number, force = false) {
  lastKnownPosition = position;
  if (isTauri()) {
    setDesktopPlaybackState(lastKnownPlaying, position);
    return;
  }
  setMediaSessionPositionState(duration, position, force);
}

export function clearNowPlaying() {
  lastKnownPlaying = false;
  lastKnownPosition = 0;
  if (isTauri()) {
    clearDesktopMediaControls();
    return;
  }
  resetMediaSession();
}
