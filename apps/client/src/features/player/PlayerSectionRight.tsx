import { useState } from "react";
import { ListMusic, Mic2, Plug, Volume2, VolumeX } from "lucide-react";
import { usePlayerStore } from "../../stores/playerStore";

export function PlayerSectionRight() {
  // Sélecteurs fins : ce panneau n'a rien à voir avec currentTime mais un `usePlayerStore()`
  // sans sélecteur s'abonne au store entier et re-rendrait ces contrôles à chaque tick de
  // lecture (voir tickProgress dans playerStore).
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const showQueue = usePlayerStore((s) => s.showQueue);
  const toggleQueue = usePlayerStore((s) => s.toggleQueue);
  const showLyrics = usePlayerStore((s) => s.showLyrics);
  const toggleLyrics = usePlayerStore((s) => s.toggleLyrics);
  const showConnect = usePlayerStore((s) => s.showConnect);
  const toggleConnect = usePlayerStore((s) => s.toggleConnect);

  const [isDragging, setIsDragging] = useState(false);

  const effectiveVolume = isMuted ? 0 : volume;
  const volumePercent = Math.round(effectiveVolume * 100);

  return (
    <div className="flex items-center gap-3 h-full">
      {/* Volume */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleMute}
          className="text-neutral-400 hover:text-white transition-colors"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted || effectiveVolume === 0 ? (
            <VolumeX size={18} />
          ) : (
            <Volume2 size={18} />
          )}
        </button>
        <div className="relative w-24 group">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={effectiveVolume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            onPointerDown={() => setIsDragging(true)}
            onPointerUp={() => setIsDragging(false)}
            onPointerLeave={() => setIsDragging(false)}
            className="w-full h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer accent-white"
          />
          {isDragging && (
            <div
              className="absolute -top-8 transform -translate-x-1/2 bg-neutral-800 text-white text-xs px-2 py-1 rounded shadow pointer-events-none whitespace-nowrap"
              style={{ left: `${effectiveVolume * 100}%` }}
            >
              {volumePercent}%
            </div>
          )}
        </div>
      </div>

      {/* Queue */}
      <button
        onClick={toggleQueue}
        className={`transition-colors ${showQueue
          ? "text-green-400"
          : "text-neutral-400 hover:text-white"
          }`}
        title="Queue"
      >
        <ListMusic size={18} />
      </button>

      {/* Lyrics */}
      <button
        onClick={toggleLyrics}
        className={`transition-colors ${showLyrics
          ? "text-green-400"
          : "text-neutral-400 hover:text-white"
          }`}
        title="Lyrics"
      >
        <Mic2 size={18} />
      </button>

      {/* Connect */}
      <button
        onClick={toggleConnect}
        className={`transition-colors ${showConnect
          ? "text-green-400"
          : "text-neutral-400 hover:text-white"
          }`}
        title="Connect"
      >
        <Plug size={18} />
      </button>
    </div>
  );
}
