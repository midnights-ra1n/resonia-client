import { useSearchParams } from "react-router-dom";
import { useTrackListSelection } from "../../hooks/useTrackListSelection";
import { useTranslation } from "../../lib/i18n";
import { AlbumResultRow } from "./AlbumResultRow";
import { ArtistCard } from "./ArtistCard";
import { PlaylistCard } from "./PlaylistCard";
import { ResultSection } from "./ResultSection";
import { TrackResultRow } from "./TrackResultRow";
import { useSearch } from "./useSearch";

const MIN_QUERY_LENGTH = 2;
const MAX_SONGS_SHOWN = 8;

export function SearchPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const trimmed = query.trim();

  const { results, loading, removePlaylistLocally } = useSearch(trimmed);
  const hasQuery = trimmed.length >= MIN_QUERY_LENGTH;
  const hasResults =
    results.songs.length > 0 || results.albums.length > 0 || results.artists.length > 0 || results.playlists.length > 0;

  const shownSongs = results.songs.slice(0, MAX_SONGS_SHOWN);
  const trackSelection = useTrackListSelection(shownSongs.length);
  const selectedSongIds = Array.from(trackSelection.selectedIndices)
    .map((i) => shownSongs[i]?.id)
    .filter((songId): songId is string => songId !== undefined);

  if (!hasQuery) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-neutral-400">
        {t("search.prompt")}
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-white">{t("search.resultsFor", { query: trimmed })}</h1>

      {loading ? (
        <p className="text-neutral-400">{t("common.loading")}</p>
      ) : !hasResults ? (
        <p className="text-neutral-400">{t("search.noResults")}</p>
      ) : (
        <>
          {results.albums.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-4 text-xl font-semibold text-white">{t("search.sectionAlbums")}</h2>
              <div className="flex flex-col gap-1">
                {results.albums.map((album) => (
                  <AlbumResultRow key={album.id} album={album} />
                ))}
              </div>
            </section>
          )}

          {shownSongs.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-4 text-xl font-semibold text-white">{t("search.sectionSongs")}</h2>
              <div
                ref={trackSelection.containerRef}
                tabIndex={0}
                onKeyDown={trackSelection.handleKeyDown}
                className="flex flex-col gap-1 outline-none"
              >
                {shownSongs.map((song, index) => (
                  <TrackResultRow
                    key={song.id}
                    song={song}
                    songs={results.songs}
                    index={index}
                    isSelected={trackSelection.isSelected(index)}
                    onSelectClick={trackSelection.handleRowClick}
                    onEnsureSelected={trackSelection.ensureSelected}
                    registerRow={trackSelection.registerRow}
                    selectedSongIds={selectedSongIds}
                  />
                ))}
              </div>
            </section>
          )}

          {results.artists.length > 0 && (
            <ResultSection title={t("search.sectionArtists")}>
              {results.artists.map((artist) => (
                <ArtistCard key={artist.id} artist={artist} />
              ))}
            </ResultSection>
          )}

          {results.playlists.length > 0 && (
            <ResultSection title={t("search.sectionPlaylists")}>
              {results.playlists.map((playlist) => (
                <PlaylistCard
                  key={playlist.id}
                  playlist={playlist}
                  onDeleted={() => removePlaylistLocally(playlist.id)}
                />
              ))}
            </ResultSection>
          )}
        </>
      )}
    </div>
  );
}
