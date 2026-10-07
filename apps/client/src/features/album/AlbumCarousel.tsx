import { useCallback, useRef, useState, type ReactNode } from "react";
import { CaretLeft, CaretRight } from "../../components/icons";
import type { AlbumSummary } from "@resonia/api-client";
import { AlbumCard } from "../home/AlbumCard";
import { useScrollingClass } from "../../hooks/useScrollingClass";
import { SectionInViewContext, useSectionInView } from "../../hooks/useInViewport";
import { useScrollEdges } from "../../hooks/useScrollEdges";

interface AlbumCarouselProps {
  title: string;
  albums: AlbumSummary[];
  /** Contenu affiché sous le titre (ex: filtres de la discographie d'un artiste). */
  toolbar?: ReactNode;
}

export function AlbumCarousel({ title, albums, toolbar }: AlbumCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Élément suivi aussi en état : useScrollEdges doit le recevoir une fois monté.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const setScrollNode = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScrollEl(node);
  }, []);
  useScrollEdges(scrollEl, "x");
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
      {toolbar && <div className="mb-4">{toolbar}</div>}

      <SectionInViewContext.Provider value={sectionInView}>
        {/* Dégradés des côtés : les cartes coupées par le bord s'estompent au lieu d'être tranchées net
            (masqués du côté calé au début/à la fin, voir useScrollEdges). */}
        <div className="relative">
          <div aria-hidden className="edge-fade-start inset-y-0 left-0 w-12 bg-gradient-to-r from-neutral-900 to-transparent" />
          <div aria-hidden className="edge-fade-end inset-y-0 right-0 w-12 bg-gradient-to-l from-neutral-900 to-transparent" />
          <div ref={setScrollNode} className="flex gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none]">
            {albums.map((album) => (
              <div key={album.id} className="grid-card-cv w-40 shrink-0">
                <AlbumCard album={album} />
              </div>
            ))}
          </div>
        </div>
      </SectionInViewContext.Provider>
    </section>
  );
}