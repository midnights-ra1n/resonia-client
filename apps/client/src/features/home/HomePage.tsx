import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { useMostPlayedAlbums } from "../../hooks/useMostPlayedAlbums";
import { useTranslation } from "../../lib/i18n";
import { useServersStore } from "../../stores/serversStore";
import { AlbumCard } from "./AlbumCard";

export function HomePage() {
  const { t } = useTranslation();
  const { albums, loading } = useMostPlayedAlbums();
  const { servers, activeServerId } = useServersStore();
  const activeServer = servers.find((s) => s.id === activeServerId);
  const username = activeServer?.username ?? "";
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const { current } = scrollRef;
    const scrollAmount = current.clientWidth * 0.75;
    current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-white">{t("home.greeting", { username })}</h1>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">{t("home.mostPlayedAlbums")}</h2>

        {loading ? (
          <p className="text-neutral-400">{t("common.loading")}</p>
        ) : albums.length === 0 ? (
          <p className="text-neutral-400">{t("home.noAlbums")}</p>
        ) : (
          <div className="group/carousel relative">
            {/* Flèche gauche */}
            <button
              onClick={() => scroll("left")}
              className="absolute left-0 top-1/2 z-10 flex h-full w-16 -translate-y-1/2 items-center justify-center bg-gradient-to-r from-neutral-950 to-transparent opacity-0 transition-opacity group-hover/carousel:opacity-100"
              aria-label="Défiler à gauche"
            >
              <ChevronLeft className="h-8 w-8 text-white" />
            </button>

            {/* Carrousel */}
            <div
              ref={scrollRef}
              className="flex gap-4 overflow-x-auto pb-3 scroll-smooth"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {albums.map((album) => (
                <div key={album.id} className="w-[200px] shrink-0">
                  <AlbumCard album={album} />
                </div>
              ))}
            </div>

            {/* Flèche droite */}
            <button
              onClick={() => scroll("right")}
              className="absolute right-0 top-1/2 z-10 flex h-full w-16 -translate-y-1/2 items-center justify-center bg-gradient-to-l from-neutral-950 to-transparent opacity-0 transition-opacity group-hover/carousel:opacity-100"
              aria-label="Défiler à droite"
            >
              <ChevronRight className="h-8 w-8 text-white" />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

