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
        {loading ? (
          <p className="text-neutral-400">{t("common.loading")}</p>
        ) : albums.length === 0 ? (
          <p className="text-neutral-400">{t("home.noAlbums")}</p>
        ) : (
          <div className="group/carousel relative">
            <div className="flex w-full items-center justify-between gap-4 mb-4">
              <h2 className="text-xl font-semibold text-white truncate">{t("home.mostPlayedAlbums")}</h2>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => scroll("left")}
                  className="rounded-full bg-neutral-800 p-1.5 text-neutral-300 transition hover:bg-neutral-700 hover:text-white"
                  aria-label="Défiler à gauche"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => scroll("right")}
                  className="rounded-full bg-neutral-800 p-1.5 text-neutral-300 transition hover:bg-neutral-700 hover:text-white"
                  aria-label="Défiler à droite"
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
          </div>
        )}
      </section>
    </div>
  );
}

