import { useLayoutEffect, useRef, useState } from "react";
import { MarqueeText } from "../../components/MarqueeText";
import { usePlayerStore, DEFAULT_COVER_URL } from "../../stores/playerStore";
import { LikeButton } from "./LikeButton";

// Bouton like : 20px (h-5 w-5) + 8px d'écart avant le texte.
const BUTTON_WIDTH = 20;
const BUTTON_GAP = 8;
const BUTTON_RESERVED = BUTTON_WIDTH + BUTTON_GAP;

export function PlayerSectionLeft() {
  const currentTrack = usePlayerStore((state) => state.currentTrack);

  const coverUrl = currentTrack?.coverUrl ?? DEFAULT_COVER_URL;
  const title = currentTrack?.title ?? "—";
  const artist = currentTrack?.artist ?? "—";

  const containerRef = useRef<HTMLDivElement>(null);
  const titleMeasureRef = useRef<HTMLSpanElement>(null);
  const artistMeasureRef = useRef<HTMLSpanElement>(null);
  // Position horizontale (px) du bouton like, calculée à part : le bloc titre/artiste
  // lui-même reste en flex-1/min-w-0 pur — exactement le pattern utilisé (et qui fonctionne)
  // sur AlbumPage/PlaylistPage — pour que MarqueeText gère son propre débordement/défilement
  // sans aucune interférence. Le bouton, positionné en absolu par-dessus, vient se coller
  // juste après le texte s'il est court (naturalWidth), ou se plaque à la fin de la zone
  // réservée (containerWidth - bouton) si le texte est trop long et défile.
  const [buttonLeft, setButtonLeft] = useState<number | null>(null);

  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      const titleEl = titleMeasureRef.current;
      const artistEl = artistMeasureRef.current;
      if (!container || !titleEl || !artistEl) return;

      const naturalWidth = Math.max(titleEl.scrollWidth, artistEl.scrollWidth);
      const availableTextSpace = Math.max(0, container.clientWidth - BUTTON_RESERVED);
      setButtonLeft(Math.min(naturalWidth, availableTextSpace) + BUTTON_GAP);
    }

    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [title, artist]);

  return (
    <div className="flex items-center gap-3 h-full min-w-0">
      <img src={coverUrl} alt="Cover" className="w-12 h-12 rounded-md object-cover shrink-0" />

      <div
        ref={containerRef}
        className="relative min-w-0 flex-1"
        style={{ paddingRight: BUTTON_RESERVED }}
      >
        {/* Éléments invisibles servant uniquement à mesurer la largeur naturelle (non
            tronquée) du titre et de l'artiste, pour positionner le bouton like. N'affecte
            en rien la mesure de débordement propre à MarqueeText. */}
        <span ref={titleMeasureRef} className="invisible absolute whitespace-nowrap text-sm">
          {title}
        </span>
        <span ref={artistMeasureRef} className="invisible absolute whitespace-nowrap text-xs">
          {artist}
        </span>

        {/* key={track id} : redémarre proprement le défilement (position, timers) à chaque
            changement de piste plutôt que de garder l'état de la précédente. */}
        <div key={currentTrack?.id ?? "empty"}>
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

        {currentTrack && buttonLeft !== null && (
          <div className="absolute top-1/2 -translate-y-1/2" style={{ left: buttonLeft }}>
            <LikeButton track={currentTrack} />
          </div>
        )}
      </div>
    </div>
  );
}
