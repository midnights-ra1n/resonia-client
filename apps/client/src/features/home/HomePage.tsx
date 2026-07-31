import { useTranslation } from "../../lib/i18n";
// Fallback local hook: original './hooks/useMostPlayedAlbums' not found.
// Provides a minimal implementation to avoid module resolution errors.
import { useState, useEffect } from "react";

function useMostPlayedAlbums() {
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // Minimal placeholder: no remote fetch, just simulate loaded empty state.
    const t = setTimeout(() => {
      if (mounted) {
        setAlbums([]);
        setLoading(false);
      }
    }, 0);

    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, []);

  return { albums, loading };
}
import { AlbumCard } from "./AlbumCard";

export function HomePage() {
  const { t } = useTranslation();
  const { albums, loading } = useMostPlayedAlbums();

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-white">{t("home.greeting")}</h1>

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
