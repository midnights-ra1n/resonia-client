import { useTranslation } from "../../lib/i18n";
import { useMostPlayedAlbums } from "./useMostPlayedAlbums";
import { useMostPlayedSongs } from "./useMostPlayedSongs";
import { AlbumCard } from "./AlbumCard";
import { SongRow } from "./SongRow";

export function HomePage() {
  const { t } = useTranslation();
  const { albums, loading: albumsLoading } = useMostPlayedAlbums();
  const { songs, loading: songsLoading } = useMostPlayedSongs();

  return (
    <div className="p-8 space-y-10">
      <h1 className="text-2xl font-bold text-white">{t("home.greeting")}</h1>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">{t("home.mostPlayedAlbums")}</h2>

        {albumsLoading ? (
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

      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">{t("home.mostPlayedSongs")}</h2>

        {songsLoading ? (
          <p className="text-neutral-400">{t("common.loading")}</p>
        ) : songs.length === 0 ? (
          <p className="text-neutral-400">{t("home.noSongs")}</p>
        ) : (
          <div className="max-w-3xl">
            {songs.map((song, index) => (
              <SongRow key={song.id} song={song} index={index} allSongs={songs} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
