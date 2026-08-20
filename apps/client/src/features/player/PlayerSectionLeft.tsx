import { MarqueeText } from "../../components/MarqueeText";
import { usePlayerStore, DEFAULT_COVER_URL } from "../../stores/playerStore";

export function PlayerSectionLeft() {
  const currentTrack = usePlayerStore((state) => state.currentTrack);

  const coverUrl = currentTrack?.coverUrl ?? DEFAULT_COVER_URL;
  const title = currentTrack?.title ?? "—";
  const artist = currentTrack?.artist ?? "—";

  return (
    <div className="flex items-center gap-3 h-full">
      <img src={coverUrl} alt="Cover" className="w-12 h-12 rounded-md object-cover shrink-0" />
      <div className="min-w-0 flex-1">
        <MarqueeText
          text={title}
          to={currentTrack?.albumId ? `/albums/${currentTrack.albumId}` : undefined}
          className="text-sm text-white hover:underline"
        />
        <MarqueeText
          text={artist}
          to={currentTrack?.artistId ? `/artists/${currentTrack.artistId}` : undefined}
          className="text-xs text-neutral-400 hover:text-white hover:underline"
        />
      </div>
    </div>
  );
}
