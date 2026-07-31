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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

