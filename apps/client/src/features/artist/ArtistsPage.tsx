import { useDeferredValue, useMemo, useState } from "react";
import type { ArtistSummary } from "@resonia/api-client";
import { ArtistCard } from "../search/ArtistCard";
import { PageSkeleton } from "../../components/PageSkeleton";
import { LoadMore } from "../../components/LoadMore";
import { useCachedQuery } from "../../lib/cache/queryCache";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useServersStore } from "../../stores/serversStore";

// La liste change rarement (scan de bibliothèque) : une heure avant rafraîchissement en arrière-plan.
const ARTISTS_STALE_MS = 60 * 60_000;
// Cartes montées par tranche : une bibliothèque de plusieurs milliers d'artistes ne crée pas
// autant de composants (et d'observers) d'un coup, seulement au fil du défilement.
const RENDER_BATCH = 120;
const NO_ARTISTS: ArtistSummary[] = [];

export function ArtistsPage() {
  const { t, locale } = useTranslation();
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const { data, loading } = useCachedQuery(
    server ? `${server.id}:artists` : null,
    () => getClientForServer(server!).getArtists(),
    ARTISTS_STALE_MS,
  );
  const artists = data ?? NO_ARTISTS;

  const [query, setQuery] = useState("");
  // Filtrage en priorité basse : la frappe reste fluide même sur une longue liste.
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase(locale));
  const [limit, setLimit] = useState(RENDER_BATCH);

  const filtered = useMemo(
    () => (deferredQuery ? artists.filter((a) => a.name.toLocaleLowerCase(locale).includes(deferredQuery)) : artists),
    [artists, deferredQuery, locale],
  );

  if (loading) return <PageSkeleton />;

  return (
    <div className="px-8 pb-12 pt-16">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black text-white">{t("nav.artists")}</h1>
          <p className="mt-3 text-sm text-neutral-400">{t("artists.count", { count: artists.length })}</p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(RENDER_BATCH);
          }}
          placeholder={t("artists.filterPlaceholder")}
          aria-label={t("artists.filterPlaceholder")}
          className="w-64 rounded-full bg-surface-2 px-4 py-2 text-sm text-white placeholder:text-neutral-500 outline-none focus:ring-2 focus:ring-white/30"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-neutral-400">{t(artists.length === 0 ? "artists.empty" : "search.noResults")}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] justify-items-center gap-2">
          {filtered.slice(0, limit).map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </div>
      )}
      {limit < filtered.length && <LoadMore key={limit} onVisible={() => setLimit(limit + RENDER_BATCH)} />}
    </div>
  );
}
