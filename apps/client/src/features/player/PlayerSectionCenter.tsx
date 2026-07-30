import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
} from "lucide-react";
import { usePlayerStore } from "../../stores/playerStore";

function formatTime(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PlayerSectionCenter() {
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    isShuffle,
    toggleShuffle,
    isRepeat,
    toggleRepeat,
    nextTrack,
    prevTrack,
    currentTime,
    setCurrentTime,
    showTimeRemaining,
    toggleTimeDisplay,
  } = usePlayerStore();

  const duration = currentTrack?.duration ?? 0;
  const [isDragging, setIsDragging] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Simuler la progression du temps quand on joue (sera remplacé par le vrai audio)
  useEffect(() => {
    if (!isPlaying || !currentTrack || isDragging) return;
    const interval = setInterval(() => {
      usePlayerStore.setState((state) => ({
        currentTime: Math.min(state.currentTime + 1, state.currentTrack?.duration ?? 0),
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, currentTrack, isDragging]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const displayTime = showTimeRemaining
    ? Math.max(duration - currentTime, 0)
    : currentTime;

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
    <div className="flex flex-col items-center gap-2 w-full max-w-2xl">
      {/* Control buttons */}
      <div className="flex items-center gap-6">
        <button
          onClick={toggleShuffle}
          className={`transition-colors ${
            isShuffle
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
          className={`transition-colors ${
            isRepeat
              ? "text-green-400"
              : "text-neutral-400 hover:text-white"
          }`}
          title="Repeat"
        >
          <Repeat size={18} />
        </button>
      </div>

      {/* Progress bar + time */}
      <div className="flex items-center gap-2 w-full">
        <span className="text-xs text-neutral-400 w-10 text-right tabular-nums select-none">
          {formatTime(displayTime)}
        </span>

        <div
          ref={barRef}
          className="relative flex-1 h-1 bg-neutral-700 rounded-full cursor-pointer group"
          onClick={handleClickBar}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverProgress(null)}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
        >
          {/* Hover fill */}
          {hoverProgress !== null && (
            <div
              className="absolute top-0 left-0 h-full bg-neutral-500 rounded-full"
              style={{
                width: `${(hoverProgress / (duration || 1)) * 100}%`,
              }}
            />
          )}

          {/* Progress fill */}
          <div
            className="absolute top-0 left-0 h-full bg-white rounded-full group-hover:bg-green-400 transition-colors"
            style={{ width: `${progress}%` }}
          />

          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow"
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>

        <span
          className="text-xs text-neutral-400 w-10 tabular-nums select-none cursor-pointer hover:text-white"
          onClick={toggleTimeDisplay}
          title={
            showTimeRemaining ? "Click for elapsed time" : "Click for remaining time"
          }
        >
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
