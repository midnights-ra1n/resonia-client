import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AlbumSummary } from "@resonia/api-client";
import { AlbumCard } from "../home/AlbumCard";

interface AlbumCarouselProps {
  title: string;
  albums: AlbumSummary[];
}

export function AlbumCarousel({ title, albums }: AlbumCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollBy(amount: number) {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  if (albums.length === 0) return null;

  return (
    <section className="mt-10 mb-8 w-full">
      <div className="flex w-full items-center justify-between gap-4 mb-4">
  <h2 className="text-xl font-semibold text-white truncate">{title}</h2>
  <div className="flex shrink-0 gap-2">
    <button
      onClick={() => scrollBy(-600)}
      className="rounded-full bg-neutral-800 p-1.5 text-neutral-300 transition hover:bg-neutral-700 hover:text-white"
    >
      <ChevronLeft size={18} />
    </button>
    <button
      onClick={() => scrollBy(600)}
      className="rounded-full bg-neutral-800 p-1.5 text-neutral-300 transition hover:bg-neutral-700 hover:text-white"
    >
      <ChevronRight size={18} />
    </button>
  </div>
</div>

      <div ref={scrollRef} className="flex gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none]">
        {albums.map((album) => (
          <div key={album.id} className="w-40 shrink-0">
            <AlbumCard album={album} />
          </div>
        ))}
      </div>
    </section>
  );
}