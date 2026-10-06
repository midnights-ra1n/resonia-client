import { useRef } from "react";
import { CaretLeft, CaretRight } from "../../components/icons";
import type { AlbumSummary } from "@resonia/api-client";
import { AlbumCard } from "../home/AlbumCard";
import { useScrollingClass } from "../../hooks/useScrollingClass";
import { SectionInViewContext, useSectionInView } from "../../hooks/useInViewport";

interface AlbumCarouselProps {
  title: string;
  albums: AlbumSummary[];
}

export function AlbumCarousel({ title, albums }: AlbumCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Toutes les pochettes du carrousel se chargent ensemble, avant d'arriver à l'écran.
  const [sectionRef, sectionInView] = useSectionInView<HTMLElement>();
  useScrollingClass(scrollRef);

  function scrollBy(amount: number) {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  if (albums.length === 0) return null;

  return (
    <section ref={sectionRef} className="mb-8 w-full">
      <div className="flex w-full items-center justify-between gap-4 mb-4">
  <h2 className="text-[22px] font-bold text-white truncate">{title}</h2>
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

      <SectionInViewContext.Provider value={sectionInView}>
        <div ref={scrollRef} className="flex gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none]">
          {albums.map((album) => (
            <div key={album.id} className="grid-card-cv w-40 shrink-0">
              <AlbumCard album={album} />
            </div>
          ))}
        </div>
      </SectionInViewContext.Provider>
    </section>
  );
}