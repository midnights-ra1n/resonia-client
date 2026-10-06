import { CaretLeft, CaretRight } from "../../components/icons";
import { useRef, type ReactNode } from "react";
import { SectionInViewContext, useSectionInView } from "../../hooks/useInViewport";

interface ResultSectionProps {
  title: string;
  children: ReactNode;
}

export function ResultSection({ title, children }: ResultSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Toutes les pochettes du carrousel se chargent ensemble, avant d'arriver à l'écran.
  const [sectionRef, sectionInView] = useSectionInView<HTMLElement>();

  function scrollBy(amount: number) {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  return (
    <section ref={sectionRef} className="mb-8 w-full">
      <div className="mb-4 flex w-full items-center justify-between gap-4">
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
          {children}
        </div>
      </SectionInViewContext.Provider>
    </section>
  );
}
