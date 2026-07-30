import { usePlayerStore, DEFAULT_COVER_URL } from "../../stores/playerStore";

export function PlayerSectionLeft() {
  const currentTrack = usePlayerStore((state) => state.currentTrack);

  const coverUrl = currentTrack?.coverUrl ?? DEFAULT_COVER_URL;
  const title = currentTrack?.title ?? "—";
  const artist = currentTrack?.artist ?? "—";

  return (
    <div className="flex items-center gap-3 h-full">
      <img
        src={coverUrl}
        alt="Cover"
        className="w-12 h-12 rounded-md object-cover shrink-0"
      />
      <div className="min-w-0">
        <p className="text-sm text-white truncate">{title}</p>
        <p className="text-xs text-neutral-400 truncate">{artist}</p>
      </div>
    </div>
  );
}
