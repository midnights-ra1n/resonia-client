import { useCallback, useRef, useState } from "react";
import type { ArtistSummary } from "@resonia/api-client";
import { CaretLeft, CaretRight } from "../../components/icons";
import { ArtistCard } from "../search/ArtistCard";
import { useScrollingClass } from "../../hooks/useScrollingClass";
import { useScrollEdges } from "../../hooks/useScrollEdges";

interface ArtistCarouselProps {
  title: string;
  artists: ArtistSummary[];
}

/** Pendant de AlbumCarousel pour des artistes (cartes rondes) — voir ce dernier pour le détail
 *  des dégradés de bord et de la classe de défilement. */
export function ArtistCarousel({ title, artists }: ArtistCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const setScrollNode = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScrollEl(node);
  }, []);
  useScrollEdges(scrollEl, "x");
  useScrollingClass(scrollRef);

  if (artists.length === 0) return null;

  function scrollBy(amount: number) {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  return (
    <section className="mb-8 w-full">
      <div className="mb-4 flex w-full items-center justify-between gap-4">
        <h2 className="truncate text-[22px] font-bold text-white">{title}</h2>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => scrollBy(-600)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-neutral-300 shadow-e1 transition-colors hover:bg-surface-3 hover:text-white"
          >
            <CaretLeft size={18} />
          </button>
          <button
            onClick={() => scrollBy(600)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-neutral-300 shadow-e1 transition-colors hover:bg-surface-3 hover:text-white"
          >
            <CaretRight size={18} />
          </button>
        </div>
      </div>
      <div className="relative">
        <div aria-hidden className="edge-fade-start inset-y-0 left-0 w-12 bg-gradient-to-r from-neutral-900 to-transparent" />
        <div aria-hidden className="edge-fade-end inset-y-0 right-0 w-12 bg-gradient-to-l from-neutral-900 to-transparent" />
        <div ref={setScrollNode} className="flex gap-2 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none]">
          {artists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </div>
      </div>
    </section>
  );
}
