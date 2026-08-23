import { AlbumCarousel } from "../album/AlbumCarousel";
import { ResultSection } from "../search/ResultSection";
import { PlaylistCard } from "../search/PlaylistCard";
import { useAlbumList } from "../../hooks/useAlbumList";
import { useHomePlaylists } from "./useHomePlaylists";
import { useTranslation } from "../../lib/i18n";
import { useServersStore } from "../../stores/serversStore";

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
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-white">{t("home.greeting", { username })}</h1>

      {nothingLoaded ? (
        <p className="text-neutral-400">{t("home.noAlbums")}</p>
      ) : (
        <>
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
