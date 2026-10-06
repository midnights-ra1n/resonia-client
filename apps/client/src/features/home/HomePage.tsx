import { useMemo } from "react";
import { AlbumCarousel } from "../album/AlbumCarousel";
import { HomeHero } from "./HomeHero";
import { QuickAccessGrid, type QuickAccessItem } from "./QuickAccessGrid";
import { ResultSection } from "../search/ResultSection";
import { PlaylistCard } from "../search/PlaylistCard";
import { useAlbumList } from "../../hooks/useAlbumList";
import { useHomePlaylists } from "./useHomePlaylists";
import { useTranslation } from "../../lib/i18n";
import { useServersStore } from "../../stores/serversStore";

const QUICK_ACCESS_SIZE = 8;
const QUICK_ACCESS_MAX_PLAYLISTS = 4;

function greetingKey(hour: number) {
  if (hour >= 5 && hour < 12) return "home.greetingMorning";
  if (hour >= 12 && hour < 18) return "home.greetingAfternoon";
  return "home.greetingEvening";
}

export function HomePage() {
  const { t } = useTranslation();
  const { servers, activeServerId } = useServersStore();
  const activeServer = servers.find((s) => s.id === activeServerId);
  const username = activeServer?.username ?? "";

  const { playlists, loading: playlistsLoading } = useHomePlaylists();
  const { albums: frequentAlbums, loading: frequentLoading } = useAlbumList("frequent", 20);
  const { albums: newAlbums, loading: newLoading } = useAlbumList("newest", 20);
  const { albums: recentAlbums, loading: recentLoading } = useAlbumList("recent", 20);
  const { albums: randomAlbums, loading: randomLoading } = useAlbumList("random", 20);

  // Bandeau : le dernier album écouté (à défaut, le plus écouté).
  const heroAlbum = recentAlbums[0] ?? frequentAlbums[0];

  // Accès rapide : quelques playlists puis les albums les plus écoutés (sans répéter celui du
  // bandeau), jusqu'à remplir la grille.
  const quickAccessItems = useMemo<QuickAccessItem[]>(() => {
    const items: QuickAccessItem[] = playlists
      .slice(0, QUICK_ACCESS_MAX_PLAYLISTS)
      .map((playlist) => ({ kind: "playlist", playlist }));
    for (const album of frequentAlbums) {
      if (items.length >= QUICK_ACCESS_SIZE) break;
      if (album.id !== heroAlbum?.id) items.push({ kind: "album", album });
    }
    return items;
  }, [playlists, frequentAlbums, heroAlbum?.id]);

  const nothingLoaded =
    !playlistsLoading &&
    !frequentLoading &&
    !newLoading &&
    !recentLoading &&
    !randomLoading &&
    playlists.length === 0 &&
    frequentAlbums.length === 0 &&
    newAlbums.length === 0 &&
    recentAlbums.length === 0 &&
    randomAlbums.length === 0;

  return (
    <div className="px-8 pt-4 pb-8">
      <h1 className="mb-6 text-[32px] font-black leading-[1.05] text-white">
        {t(greetingKey(new Date().getHours()), { username })}
      </h1>

      {nothingLoaded ? (
        <p className="text-neutral-400">{t("home.noAlbums")}</p>
      ) : (
        <>
          <HomeHero album={heroAlbum} loading={recentLoading || frequentLoading} />
          <QuickAccessGrid items={quickAccessItems} loading={playlistsLoading || frequentLoading} />

          {playlists.length > 0 && (
            <ResultSection title={t("home.yourPlaylists")}>
              {playlists.map((playlist) => (
                <PlaylistCard key={playlist.id} playlist={playlist} />
              ))}
            </ResultSection>
          )}

          <AlbumCarousel title={t("home.mostPlayedAlbums")} albums={frequentAlbums} />
          <AlbumCarousel title={t("home.recentlyPlayed")} albums={recentAlbums} />
          <AlbumCarousel title={t("home.newReleases")} albums={newAlbums} />
          <AlbumCarousel title={t("home.discover")} albums={randomAlbums} />
        </>
      )}
    </div>
  );
}
