import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MediaSessionHandlers, MediaSessionTrackInfo } from "./mediaSession";

/** Pendant desktop de mediaSession.ts : pilote le pont natif Rust (voir
 *  src-tauri/src/media_controls.rs) plutôt que navigator.mediaSession, dont WKWebView ne
 *  relaie pas fiablement les commandes distantes (touches F7/F8/F9, boutons du widget Now
 *  Playing) vers MPRemoteCommandCenter. */

type MediaControlPayload =
  | { type: "Play" }
  | { type: "Pause" }
  | { type: "Toggle" }
  | { type: "Next" }
  | { type: "Previous" }
  | { type: "SeekForward" }
  | { type: "SeekBackward" }
  | { type: "SetPosition"; value: number };

let unlisten: UnlistenFn | null = null;

export async function registerDesktopMediaControls(handlers: MediaSessionHandlers & { onToggle: () => void }) {
  unlisten?.();
  unlisten = await listen<MediaControlPayload>("media-control-event", (event) => {
    const payload = event.payload;
    switch (payload.type) {
      case "Play":
        handlers.onPlay();
        break;
      case "Pause":
        handlers.onPause();
        break;
      case "Toggle":
        handlers.onToggle();
        break;
      case "Next":
        handlers.onNext();
        break;
      case "Previous":
        handlers.onPrevious();
        break;
      case "SeekForward":
        handlers.onSeekForward?.();
        break;
      case "SeekBackward":
        handlers.onSeekBackward?.();
        break;
      case "SetPosition":
        handlers.onSeekTo(payload.value);
        break;
    }
  });
}

export function updateDesktopMediaMetadata(track: MediaSessionTrackInfo, durationSecs?: number) {
  invoke("media_set_metadata", {
    title: track.title,
    artist: track.artist,
    album: track.album,
    coverUrl: track.coverUrl ?? null,
    durationSecs: durationSecs && isFinite(durationSecs) && durationSecs > 0 ? durationSecs : null,
  }).catch((err) => console.error("[media_controls] échec media_set_metadata", err));
}

export function setDesktopPlaybackState(playing: boolean, positionSecs: number) {
  invoke("media_set_playback", {
    playing,
    positionSecs: isFinite(positionSecs) && positionSecs >= 0 ? positionSecs : 0,
  }).catch((err) => console.error("[media_controls] échec media_set_playback", err));
}

export function clearDesktopMediaControls() {
  invoke("media_clear").catch((err) => console.error("[media_controls] échec media_clear", err));
}
