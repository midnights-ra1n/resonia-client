import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useTranslation } from "../../lib/i18n";
import { genreBackground, useGenres } from "./useGenres";

export function GenresPage() {
  const { t, locale } = useTranslation();
  const { genres, loading } = useGenres();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase(locale));

  // Les plus fournis d'abord, comme « Parcourir tout » sur Spotify.
  const sorted = useMemo(
    () =>
      genres
        .filter((g) => g.value.toLocaleLowerCase(locale).includes(deferredQuery))
        .sort((a, b) => b.songCount - a.songCount),
    [genres, deferredQuery, locale],
  );

  if (loading) return <PageSkeleton />;

  return (
    <div className="px-8 pb-12 pt-16">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black text-white">{t("nav.genres")}</h1>
          <p className="mt-3 text-sm text-neutral-400">{t("genres.count", { count: genres.length })}</p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("genres.filterPlaceholder")}
          aria-label={t("genres.filterPlaceholder")}
          className="w-64 rounded-full bg-surface-2 px-4 py-2 text-sm text-white placeholder:text-neutral-500 outline-none focus:ring-2 focus:ring-white/30"
        />
      </div>

      {sorted.length === 0 ? (
        <p className="text-neutral-400">{t(genres.length === 0 ? "genres.empty" : "search.noResults")}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4">
          {sorted.map((genre) => (
            <Link
              key={genre.value}
              to={`/genres/${encodeURIComponent(genre.value)}`}
              className="flex h-28 flex-col justify-between overflow-hidden rounded-lg p-4 shadow-e1 transition-transform hover:scale-[1.02]"
              style={{ backgroundColor: genreBackground(genre.value) }}
            >
              <span className="line-clamp-2 text-lg font-bold text-white">{genre.value}</span>
              <span className="text-item-sub text-white/75">
                {t("genres.albumsAndSongs", { albums: genre.albumCount, songs: genre.songCount })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
