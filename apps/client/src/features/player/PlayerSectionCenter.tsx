import {
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useRef, useState } from "react";
import { usePlayerStore } from "../../stores/playerStore";

// 0 est une valeur d'écoulement légitime (tout début de piste, y compris juste après un
// enchaînement gapless) : seule une valeur non finie ou négative signifie "pas de piste".
// Confondre "0 seconde écoulée" avec "durée inconnue" faisait clignoter "--:--" à chaque
// changement de piste (le store remet currentTime à 0), ce qui ressemblait à une coupure.
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PlayerSectionCenter() {
  // Sélecteurs fins plutôt que la déstructuration du store entier : currentTime change
  // jusqu'à 4x/s pendant la lecture (voir tickProgress dans playerStore), et un store
  // entier abonné ici re-rendrait aussi les boutons de contrôle à chaque tick alors
  // qu'eux seuls dépendent d'isPlaying/isShuffle/isRepeat. ProgressBar isole le reste.
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const isRepeat = usePlayerStore((s) => s.isRepeat);
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);

  return (
    <div className="flex flex-col items-center gap-2 w-full max-w-2xl">
      {/* Control buttons */}
      <div className="flex items-center gap-6">
        <button
          onClick={toggleShuffle}
          className={`transition-colors ${isShuffle
            ? "text-green-400"
            : "text-neutral-400 hover:text-white"
            }`}
          title="Shuffle"
        >
          <Shuffle size={18} />
        </button>

        <button
          onClick={prevTrack}
          className="text-neutral-400 hover:text-white transition-colors"
          title="Previous"
        >
          <SkipBack size={22} fill="currentColor" />
        </button>

        <button
          onClick={togglePlay}
          className="w-9 h-9 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause size={18} fill="black" className="text-neutral-900" />
          ) : (
            <Play size={18} fill="black" className="text-neutral-900 ml-0.5" />
          )}
        </button>

        <button
          onClick={nextTrack}
          className="text-neutral-400 hover:text-white transition-colors"
          title="Next"
        >
          <SkipForward size={22} fill="currentColor" />
        </button>

        <button
          onClick={toggleRepeat}
          className={`transition-colors ${isRepeat
            ? "text-green-400"
            : "text-neutral-400 hover:text-white"
            }`}
          title="Repeat"
        >
          <Repeat size={18} />
        </button>
      </div>

      <ProgressBar />
    </div>
  );
}

// Seul ce composant re-rend au rythme de tickProgress (currentTime) : isolé du reste des
// contrôles pour que le tick de lecture n'entraîne pas un re-render des boutons ci-dessus.
function ProgressBar() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const showTimeRemaining = usePlayerStore((s) => s.showTimeRemaining);
  const toggleTimeDisplay = usePlayerStore((s) => s.toggleTimeDisplay);

  const duration = currentTrack?.duration ?? 0;

  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleClickBar = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current || !duration) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setCurrentTime(pct * duration);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current || !duration) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverProgress(pct * duration);
  };

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-xs text-neutral-400 w-10 text-right tabular-nums select-none">
        {currentTrack ? formatTime(currentTime) : "--:--"}
      </span>

      <div
        ref={barRef}
        className="relative flex-1 h-1.5 bg-neutral-700 rounded-full cursor-pointer group"
        onClick={handleClickBar}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverProgress(null)}
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={() => setIsDragging(false)}
      >
        {/* Hover fill — only when hover is behind current progress */}
        {hoverProgress !== null && hoverProgress < currentTime && (
          <div
            className="absolute top-0 left-0 h-full bg-neutral-500 rounded-full"
            style={{
              width: `${(hoverProgress / (duration || 1)) * 100}%`,
            }}
          />
        )}

        {/* Progress fill */}
        <div
          className="absolute top-0 left-0 h-full bg-white rounded-full group-hover:bg-emerald-500 transition-colors"
          style={{ width: `${progress}%` }}
        />

        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow"
          style={{
            left: `calc(${isDragging && hoverProgress !== null ? (hoverProgress / (duration || 1)) * 100 : progress}% - 6px)`,
          }}
        />
      </div>

      <span
        className="text-xs text-neutral-400 w-10 tabular-nums select-none cursor-pointer hover:text-white"
        onClick={toggleTimeDisplay}
        title={
          showTimeRemaining ? "Click for total time" : "Click for remaining time"
        }
      >
        {!currentTrack
          ? "--:--"
          : showTimeRemaining
            ? `-${formatTime(Math.max(duration - currentTime, 0))}`
            : formatTime(duration)}
      </span>
    </div>
  );
}
