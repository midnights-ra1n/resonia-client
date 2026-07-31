import { ListMusic, Mic2, Plug, Volume2, VolumeX } from "lucide-react";
import { usePlayerStore } from "../../stores/playerStore";

export function PlayerSectionRight() {
  const {
    volume,
    isMuted,
    setVolume,
    toggleMute,
    showQueue,
    toggleQueue,
    showLyrics,
    toggleLyrics,
    showConnect,
    toggleConnect,
  } = usePlayerStore();

  const effectiveVolume = isMuted ? 0 : volume;

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
            className="w-full h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer accent-white"
          />
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
