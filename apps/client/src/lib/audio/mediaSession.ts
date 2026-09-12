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

  // WebKit a un comportement observé où réassigner `metadata` peut désarmer les
  // gestionnaires "play"/"pause" déjà posés (previoustrack/nexttrack semblent y survivre,
  // ce qui expliquait que ces deux-là continuent de fonctionner après un changement de
  // piste alors que play/pause se figent) — on les réapplique donc systématiquement juste
  // après chaque mise à jour des métadonnées plutôt qu'une seule fois à l'initialisation.
  if (_lastHandlers) applyActionHandlers(_lastHandlers);
}

export function setMediaSessionPlaybackState(state: "playing" | "paused" | "none") {
  if (!isSupported()) return;
  navigator.mediaSession.playbackState = state;
  // Voir le commentaire dans updateMediaSessionMetadata : ce désarmement de play/pause a
  // aussi été observé après un enchaînement gapless vers la piste suivante (aucun
  // changement de `metadata` synchrone à cet instant précis dans certains chemins), donc on
  // réapplique ici aussi plutôt que de dépendre d'un seul point de réapplication.
  if (_lastHandlers) applyActionHandlers(_lastHandlers);
}

let _lastPositionState: { duration: number; position: number } | null = null;
let _currentPosition: number = 0;
const POSITION_UPDATE_THRESHOLD = 0.25;

export function setMediaSessionPositionState(duration: number, position: number, force = false, playbackRate = 1) {
  if (!isSupported() || !("setPositionState" in navigator.mediaSession)) return;
  if (!isFinite(duration) || duration <= 0) return;

  const adjustedDuration = Math.max(duration, 0);
  const adjustedPosition = Math.min(Math.max(position, 0), adjustedDuration);

  if (
    !force &&
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
      // Reflète le pitch fader (voir GaplessEngine.setPlaybackRate) : sans ça, le widget
      // Now Playing système extrapole la position entre deux mises à jour en supposant une
      // vitesse de 1x, et dérive visiblement si la piste tourne plus vite/lentement.
      playbackRate,
    });
  } catch {
  }

  // Filet de sécurité supplémentaire (voir updateMediaSessionMetadata) : appelé à chaque
  // tick pendant la lecture (donc plusieurs fois par seconde), ce qui rattrape aussi tout
  // désarmement de play/pause survenu entre deux mises à jour de métadonnées, notamment
  // pendant un enchaînement gapless vers la piste suivante.
  if (_lastHandlers) applyActionHandlers(_lastHandlers);
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

let _lastHandlers: MediaSessionHandlers | null = null;

function applyActionHandlers(handlers: MediaSessionHandlers) {
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

export function registerMediaSessionHandlers(handlers: MediaSessionHandlers) {
  if (!isSupported()) return;
  _lastHandlers = handlers;
  applyActionHandlers(handlers);
}

export function updateCurrentPositionForSeek(currentTime: number) {
  _currentPosition = currentTime;
}
export function resetMediaSession() {
  if (!isSupported()) return;

  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = "none";
  _lastHandlers = null;

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
