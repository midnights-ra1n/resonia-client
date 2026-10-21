import { useParams } from "react-router-dom";
import { LoadMore } from "../../components/LoadMore";
import { usePagedList } from "../../hooks/usePagedList";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useServersStore } from "../../stores/serversStore";
import { AlbumCard } from "../home/AlbumCard";
import { genreBackground, useGenres } from "./useGenres";

const ALBUMS_PAGE_SIZE = 60;

export function GenrePage() {
  const { name = "" } = useParams<{ name: string }>();
  const { t } = useTranslation();
  const { genres } = useGenres();
  const genre = genres.find((g) => g.value === name);

  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const { items: albums, loading, hasMore, failed, loadMore, retry } = usePagedList(
    server ? `${server.id}:genreAlbums:${name}` : null,
    (offset) => getClientForServer(server!).getAlbumsByGenre(name, ALBUMS_PAGE_SIZE, offset),
    ALBUMS_PAGE_SIZE,
  );

  return (
    <div>
      <div
        className="px-8 pb-8 pt-24"
        style={{ backgroundImage: `linear-gradient(to bottom, ${genreBackground(name)}, var(--color-neutral-900))` }}
      >
        <p className="text-sm font-medium text-white">{t("genres.label")}</p>
        <h1 className="mt-2 text-6xl font-black text-white">{name}</h1>
        {genre && (
          <p className="mt-4 text-sm text-neutral-200">
            {t("genres.albumsAndSongs", { albums: genre.albumCount, songs: genre.songCount })}
          </p>
        )}
      </div>

      <div className="px-8 pb-12 pt-6">
        {failed ? (
          <p className="text-neutral-400">
            {t("tracks.loadFailed")}{" "}
            <button onClick={retry} className="font-semibold text-white hover:underline">
              {t("tracks.retry")}
            </button>
          </p>
        ) : albums.length === 0 ? (
          !loading && <p className="text-neutral-400">{t("genres.noAlbums")}</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
            {albums.map((album) => (
              <div key={album.id} className="grid-card-cv">
                <AlbumCard album={album} />
              </div>
            ))}
          </div>
        )}
        {hasMore && !loading && albums.length > 0 && <LoadMore key={albums.length} onVisible={loadMore} />}
      </div>
    </div>
  );
}
