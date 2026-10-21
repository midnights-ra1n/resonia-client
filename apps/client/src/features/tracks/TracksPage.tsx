import { useState } from "react";
import type { NavidromeSongSort, SongDTO } from "@resonia/api-client";
import { MusicNotes, Pause, Play, Shuffle, SortAscending, SortDescending } from "../../components/icons";
import { LoadMore } from "../../components/LoadMore";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useTrackListSelection } from "../../hooks/useTrackListSelection";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { TrackResultRow } from "../search/TrackResultRow";
import { useLibrarySongs } from "./useLibrarySongs";

type Order = "ASC" | "DESC";

// Sens par défaut de chaque tri : alphabétique pour les noms, plus récent / plus écouté d'abord sinon.
const SORTS: { id: NavidromeSongSort; labelKey: string; defaultOrder: Order }[] = [
  { id: "title", labelKey: "tracks.sortTitle", defaultOrder: "ASC" },
  { id: "artist", labelKey: "tracks.sortArtist", defaultOrder: "ASC" },
  { id: "album", labelKey: "tracks.sortAlbum", defaultOrder: "ASC" },
  { id: "year", labelKey: "tracks.sortYear", defaultOrder: "DESC" },
  { id: "createdAt", labelKey: "tracks.sortRecent", defaultOrder: "DESC" },
  { id: "playCount", labelKey: "tracks.sortPlayCount", defaultOrder: "DESC" },
];

const SEARCH_DEBOUNCE_MS = 300;

// Tri et recherche retrouvés en revenant sur la page (la liste est gardée par useLibrarySongs).
type View = { sort: NavidromeSongSort; order: Order; query: string };
let lastView: View = { sort: "title", order: "ASC", query: "" };
function rememberView(view: View) {
  lastView = view;
}

export function TracksPage() {
  const { t, locale } = useTranslation();
  const [view, setViewState] = useState(lastView);
  const setView = (next: View) => {
    rememberView(next);
    setViewState(next);
  };
  const query = useDebouncedValue(view.query.trim(), SEARCH_DEBOUNCE_MS);
  const { songs, total, loading, hasMore, unavailable, failed, loadMore, retry } = useLibrarySongs(
    view.sort,
    view.order,
    query,
  );

  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const playFromStart = usePlayerStore((s) => s.playFromStart);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id);

  const trackSelection = useTrackListSelection(songs.length);
  const selectedSongIds = Array.from(trackSelection.selectedIndices)
    .map((i) => songs[i]?.id)
    .filter((songId): songId is string => songId !== undefined);

  if (unavailable) {
    return <div className="p-8 text-neutral-400">{t("tracks.unavailable")}</div>;
  }
  const isListPlaying = isPlaying && currentTrackId !== undefined && songs.some((s) => s.id === currentTrackId);
  const client = server ? getClientForServer(server) : null;

  function toTrack(song: SongDTO): Track {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      artistId: song.artistId,
      album: song.album,
      albumId: song.albumId,
      duration: song.duration,
      suffix: song.suffix,
      bitRate: song.bitRate,
      coverUrl: client && song.coverArt ? client.getCoverArtUrl(song.coverArt, 300) : undefined,
      coverArtId: song.coverArt,
    };
  }

  function handlePlay() {
    if (isListPlaying) togglePlay();
    else if (songs.length > 0) playFromStart(songs.map(toTrack));
  }

  function handleSort(sort: NavidromeSongSort, defaultOrder: Order) {
    // Re-cliquer le tri actif inverse le sens, comme un en-tête de colonne.
    const order = view.sort === sort ? (view.order === "ASC" ? "DESC" : "ASC") : defaultOrder;
    setView({ ...view, sort, order });
    trackSelection.clearSelection();
  }

  return (
    <div>
      <div className="flex items-end gap-6 bg-gradient-to-b from-neutral-700 to-neutral-900 px-8 pb-6 pt-16">
        <div className="flex h-56 w-56 shrink-0 items-center justify-center rounded-xl bg-surface-2 shadow-2xl">
          <MusicNotes size={80} className="text-neutral-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-6xl font-black text-white">{t("nav.tracks")}</h1>
          {total !== null && (
            <p className="mt-4 text-sm text-neutral-300">
              {t("album.trackCount", { count: new Intl.NumberFormat(locale).format(total) })}
            </p>
          )}
        </div>
      </div>

      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-4 bg-neutral-900/95 px-8 py-4">
        <button
          onClick={handlePlay}
          disabled={songs.length === 0}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-accent shadow-play transition hover:scale-105 hover:bg-accent-hover disabled:opacity-50"
          title={t("artist.play")}
        >
          {isListPlaying ? (
            <Pause size={22} fill="currentColor" className="text-on-accent" />
          ) : (
            <Play size={22} fill="currentColor" className="ml-1 text-on-accent" />
          )}
        </button>
        <button
          onClick={toggleShuffle}
          className={`transition-colors ${isShuffle ? "text-accent" : "text-neutral-400 hover:text-white"}`}
          title={t("artist.shuffle")}
        >
          <Shuffle size={24} />
        </button>

        <div className="flex flex-wrap gap-2" role="group" aria-label={t("tracks.sortBy")}>
          {SORTS.map(({ id, labelKey, defaultOrder }) => {
            const active = view.sort === id;
            const OrderIcon = view.order === "ASC" ? SortAscending : SortDescending;
            return (
              <button
                key={id}
                onClick={() => handleSort(id, defaultOrder)}
                aria-pressed={active}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm transition-colors ${
                  active ? "bg-white text-black" : "bg-surface-2 text-white hover:bg-surface-3"
                }`}
              >
                {t(labelKey)}
                {active && <OrderIcon size={14} />}
              </button>
            );
          })}
        </div>

        <input
          type="search"
          value={view.query}
          onChange={(e) => {
            setView({ ...view, query: e.target.value });
            trackSelection.clearSelection();
          }}
          placeholder={t("tracks.searchPlaceholder")}
          aria-label={t("tracks.searchPlaceholder")}
          className="ml-auto w-64 rounded-full bg-surface-2 px-4 py-2 text-sm text-white placeholder:text-neutral-500 outline-none focus:ring-2 focus:ring-white/30"
        />
      </div>

      <div className="px-8 pb-12">
        {failed ? (
          <p className="text-neutral-400">
            {t("tracks.loadFailed")}{" "}
            <button onClick={retry} className="font-semibold text-white hover:underline">
              {t("tracks.retry")}
            </button>
          </p>
        ) : songs.length === 0 ? (
          // Pas de squelette : l'en-tête et les contrôles restent en place (focus du champ compris)
          // pendant un changement de tri ou de recherche ; la liste arrive en une requête.
          !loading && <p className="text-neutral-400">{t("search.noResults")}</p>
        ) : (
          <div
            ref={trackSelection.containerRef}
            tabIndex={0}
            onKeyDown={trackSelection.handleKeyDown}
            className="flex flex-col gap-1 outline-none"
          >
            {songs.map((song, index) => (
              <TrackResultRow
                key={song.id}
                song={song}
                songs={songs}
                index={index}
                isSelected={trackSelection.isSelected(index)}
                onSelectClick={trackSelection.handleRowClick}
                onEnsureSelected={trackSelection.ensureSelected}
                registerRow={trackSelection.registerRow}
                selectedSongIds={selectedSongIds}
                showAlbum
              />
            ))}
          </div>
        )}
        {hasMore && !loading && songs.length > 0 && <LoadMore key={songs.length} onVisible={loadMore} />}
      </div>
    </div>
  );
}
