import { useMemo, useState } from "react";
import { Pause, Play, Shuffle } from "../../components/icons";
import { useParams } from "react-router-dom";
import type { AlbumSummary } from "@resonia/api-client";
import { AlbumCarousel } from "../album/AlbumCarousel";
import { TrackResultRow } from "../search/TrackResultRow";
import { useCoverArt } from "../../hooks/useCoverArt";
import { useDominantColor } from "../../hooks/useDominantColor";
import { useTrackListSelection } from "../../hooks/useTrackListSelection";
import { useTranslation } from "../../lib/i18n";
import { formatAlbumDuration } from "../../lib/format/duration";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { useArtist } from "./useArtist";
import { useArtistPopularSongs } from "./useArtistPopularSongs";
import { biographyToText, useArtistInfo } from "./useArtistInfo";
import { releaseCategory, sortByYearDesc, type ReleaseCategory } from "./discography";
import { ArtistCarousel } from "./ArtistCarousel";
import { CoverImage } from "../../components/CoverImage";
import { PageSkeleton } from "../../components/PageSkeleton";
import { MarqueeText } from "../../components/MarqueeText";
import { useSpotifyArtist } from "../../lib/spotify/spotifyService";

// Les images Spotify passent par le même cache disque que les pochettes, sous un « serveur »
// fictif : identifiant = dernier segment de l'URL i.scdn.co, stable pour une image donnée.
const SPOTIFY_CACHE_ID = "spotify";

function spotifyImageId(url: string | null | undefined): string | undefined {
  return url ? url.split("/").pop() || undefined : undefined;
}

// Comme Spotify : 5 titres populaires, 10 une fois dépliés.
const POPULAR_COLLAPSED_COUNT = 5;

type DiscographyFilter = "all" | ReleaseCategory;

const FILTER_LABEL_KEYS: Record<DiscographyFilter, string> = {
  all: "artist.filterAll",
  album: "artist.filterAlbums",
  single: "artist.filterSingles",
  compilation: "artist.filterCompilations",
};

export function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  // Remontage à chaque artiste (navigation d'un artiste similaire à l'autre) : filtres, bio
  // dépliée et suivi repartent de zéro sans effet de réinitialisation.
  return <ArtistPageContent key={id} id={id} />;
}

function ArtistPageContent({ id }: { id: string | undefined }) {
  const { t, locale } = useTranslation();

  const { artist, loading, error } = useArtist(id);
  const info = useArtistInfo(artist?.id);
  // undefined tant que l'option est désactivée (réglage par défaut) : aucune requête vers Spotify.
  const spotify = useSpotifyArtist(artist?.name);
  const {
    songs: popularSongs,
    loading: popularSongsLoading,
    source: popularSongsSource,
    lastfmError,
  } = useArtistPopularSongs(artist?.name);

  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;

  const playFromStart = usePlayerStore((s) => s.playFromStart);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const [showAllPopular, setShowAllPopular] = useState(false);
  const [discographyFilter, setDiscographyFilter] = useState<DiscographyFilter>("all");
  const [bioExpanded, setBioExpanded] = useState(false);
  // Suivi optimiste : `starred` n'est relu qu'au prochain chargement de l'artiste.
  const [followOverride, setFollowOverride] = useState<boolean | null>(null);
  const following = followOverride ?? Boolean(artist?.starred);

  const photoUrl = client && artist?.coverArt ? client.getCoverArtUrl(artist.coverArt, 300) : undefined;
  // Même taille (300) et même clé que ArtistCard : la photo déjà vue dans un carrousel ou une
  // recherche s'affiche sans nouveau téléchargement.
  const navidromePhotoUrl = useCoverArt(activeServerId ?? undefined, artist?.coverArt, 300, photoUrl);
  const spotifyAvatarUrl = useCoverArt(
    SPOTIFY_CACHE_ID,
    spotifyImageId(spotify?.avatarUrl),
    640,
    spotify?.avatarUrl ?? undefined,
  );
  const bannerUrl = useCoverArt(
    SPOTIFY_CACHE_ID,
    spotifyImageId(spotify?.bannerUrl),
    1280,
    spotify?.bannerUrl ?? undefined,
  );
  const cachedPhotoUrl = spotifyAvatarUrl ?? navidromePhotoUrl;
  const dominantColor = useDominantColor(bannerUrl ?? cachedPhotoUrl);

  const shownPopularCount = showAllPopular ? popularSongs.length : Math.min(popularSongs.length, POPULAR_COLLAPSED_COUNT);
  const trackSelection = useTrackListSelection(shownPopularCount);

  const albums = useMemo<AlbumSummary[]>(
    () => sortByYearDesc((artist?.album ?? []).map((a) => ({ ...a, artistId: a.artistId ?? artist!.id }))),
    [artist],
  );
  const availableFilters = useMemo<DiscographyFilter[]>(() => {
    const present = new Set(albums.map(releaseCategory));
    const categories = (["album", "single", "compilation"] as const).filter((c) => present.has(c));
    // Une seule catégorie : les filtres n'apporteraient rien.
    return categories.length > 1 ? ["all", ...categories] : [];
  }, [albums]);
  const visibleAlbums = useMemo(
    () => (discographyFilter === "all" ? albums : albums.filter((a) => releaseCategory(a) === discographyFilter)),
    [albums, discographyFilter],
  );
  // Bio Spotify en priorité (souvent plus complète), sinon celle de Last.fm relayée par Navidrome.
  const biography = useMemo(
    () => biographyToText(spotify?.biography ?? undefined) || biographyToText(info?.biography),
    [spotify?.biography, info?.biography],
  );
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  if (loading) {
    return <PageSkeleton />;
  }

  if (error || !artist) {
    return <div className="p-8 text-neutral-400">{error ?? t("artist.notFound")}</div>;
  }

  const totalSongs = albums.reduce((sum, a) => sum + (a.songCount ?? 0), 0);
  const totalDuration = albums.reduce((sum, a) => sum + (a.duration ?? 0), 0);
  const isThisArtistCurrent = currentTrack !== null && popularSongs.some((s) => s.id === currentTrack.id);
  const isThisArtistPlaying = isThisArtistCurrent && isPlaying;
  const shownPopularSongs = popularSongs.slice(0, shownPopularCount);
  const similarArtists = info?.similarArtist ?? [];
  const musicBrainzId = info?.musicBrainzId ?? artist.musicBrainzId;
  const spotifyStats = spotify
    ? [
        spotify.monthlyListeners !== null
          ? { label: t("artist.monthlyListeners"), value: numberFormat.format(spotify.monthlyListeners) }
          : null,
        spotify.followers !== null ? { label: t("artist.followers"), value: numberFormat.format(spotify.followers) } : null,
        spotify.worldRank !== null
          ? { label: t("artist.worldRank"), value: `#${numberFormat.format(spotify.worldRank)}` }
          : null,
      ].filter((stat): stat is { label: string; value: string } => stat !== null)
    : [];
  const hasAbout = biography !== "" || Boolean(info?.lastFmUrl) || Boolean(musicBrainzId) || spotify !== undefined;
  const headerMeta = [
    spotify?.monthlyListeners != null
      ? t("artist.monthlyListenersCount", { count: numberFormat.format(spotify.monthlyListeners) })
      : null,
    artist.albumCount > 0 ? t("artist.albumCount", { count: artist.albumCount }) : null,
    totalSongs > 0 ? t("album.trackCount", { count: totalSongs }) : null,
    totalDuration > 0 ? formatAlbumDuration(totalDuration, t) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const selectedSongIds = Array.from(trackSelection.selectedIndices)
    .map((i) => popularSongs[i]?.id)
    .filter((songId): songId is string => songId !== undefined);

  function toTrack(song: (typeof popularSongs)[number]): Track {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      artistId: song.artistId ?? artist!.id,
      album: song.album,
      albumId: song.albumId,
      duration: song.duration,
      suffix: song.suffix,
      bitRate: song.bitRate,
      coverUrl: song.coverArt ? client?.getCoverArtUrl(song.coverArt, 300) : undefined,
      coverArtId: song.coverArt,
    };
  }

  function handlePlay() {
    if (isThisArtistPlaying) {
      togglePlay();
      return;
    }
    if (popularSongs.length > 0) playFromStart(popularSongs.map(toTrack));
  }

  function handleToggleFollow() {
    if (!client) return;
    const next = !following;
    setFollowOverride(next);
    (next ? client.starArtist(artist!.id) : client.unstarArtist(artist!.id)).catch((err) => {
      console.error("[artist] Échec de la mise à jour du suivi", err);
      setFollowOverride(!next);
    });
  }

  return (
    <div>
      {bannerUrl ? (
        // Bannière Spotify : en-tête pleine largeur, nom posé sur l'image comme sur Spotify.
        <div className="relative h-[22rem] w-full overflow-hidden bg-neutral-800">
          <CoverImage
            src={bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[center_25%]"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/20 to-black/30" />
          <div className="absolute bottom-6 left-8 right-8">
            <p className="text-sm font-medium text-white drop-shadow">{t("artist.label")}</p>
            <h1 className="mt-1">
              <MarqueeText auto text={artist.name} className="text-7xl font-black text-white drop-shadow-lg" />
            </h1>
            {headerMeta && <p className="mt-3 text-sm text-neutral-100 drop-shadow">{headerMeta}</p>}
          </div>
        </div>
      ) : (
        <div
          className="flex items-end gap-6 bg-gradient-to-b from-neutral-700 to-neutral-900 px-8 pb-6 pt-16"
          style={
            dominantColor
              ? {
                  // Même rendu que la page album (thèmes clairs : couleur atténuée via `--dominant-strength`).
                  backgroundImage: `linear-gradient(to bottom, color-mix(in srgb, ${dominantColor} var(--dominant-strength, 100%), var(--color-neutral-900)), var(--color-neutral-900))`,
                }
              : undefined
          }
        >
          <div className="flex h-56 w-56 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-800 shadow-2xl">
            {cachedPhotoUrl ? (
              <CoverImage src={cachedPhotoUrl} alt={artist.name} className="h-full w-full object-cover" decoding="async" />
            ) : (
              <span className="text-5xl text-neutral-600">♪</span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">{t("artist.label")}</p>
            <h1 className="mt-2">
              <MarqueeText auto text={artist.name} className="text-6xl font-black text-white" />
            </h1>
            {headerMeta && <p className="mt-4 text-sm text-neutral-300">{headerMeta}</p>}
          </div>
        </div>
      )}

      <div className="mb-6 flex items-center gap-6 bg-neutral-900/40 px-8 py-6">
        <button
          onClick={handlePlay}
          disabled={popularSongs.length === 0}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-accent shadow-play transition hover:scale-105 hover:bg-accent-hover disabled:opacity-50"
          title={t("artist.play")}
        >
          {isThisArtistPlaying ? (
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

        <button
          onClick={handleToggleFollow}
          aria-pressed={following}
          className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-[color,border-color,transform] hover:scale-[1.03] ${
            following ? "border-accent text-accent" : "border-neutral-500 text-white hover:border-white"
          }`}
        >
          {following ? t("artist.following") : t("artist.follow")}
        </button>
      </div>

      <div className="px-8 pb-12">
        {!popularSongsLoading && popularSongs.length > 0 && (
          <section className="mb-10">
            <div className="mb-4 flex items-baseline gap-2">
              <h2 className="text-[22px] font-bold text-white">{t("artist.popularSongs")}</h2>
              {popularSongsSource === "lastfm" && (
                <span className="text-xs text-neutral-500">{t("artist.popularSongsSourceLastfm")}</span>
              )}
              {popularSongsSource === "local" && lastfmError && (
                <span className="text-xs text-amber-500" title={lastfmError}>
                  {t("artist.popularSongsLastfmError", { error: lastfmError })}
                </span>
              )}
            </div>
            <div
              ref={trackSelection.containerRef}
              tabIndex={0}
              onKeyDown={trackSelection.handleKeyDown}
              className="flex flex-col gap-1 outline-none"
            >
              {shownPopularSongs.map((song, index) => (
                <TrackResultRow
                  key={song.id}
                  song={song}
                  songs={popularSongs}
                  index={index}
                  isSelected={trackSelection.isSelected(index)}
                  onSelectClick={trackSelection.handleRowClick}
                  onEnsureSelected={trackSelection.ensureSelected}
                  registerRow={trackSelection.registerRow}
                  selectedSongIds={selectedSongIds}
                />
              ))}
            </div>
            {popularSongs.length > POPULAR_COLLAPSED_COUNT && (
              <button
                onClick={() => setShowAllPopular((v) => !v)}
                className="mt-3 px-2 text-sm font-semibold text-neutral-400 transition-colors hover:text-white"
              >
                {showAllPopular ? t("artist.showLess") : t("artist.showMore")}
              </button>
            )}
          </section>
        )}

        {albums.length > 0 && (
          <AlbumCarousel
            title={t("artist.discography")}
            albums={visibleAlbums}
            toolbar={
              availableFilters.length > 0 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("artist.discography")}>
                  {availableFilters.map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setDiscographyFilter(filter)}
                      aria-pressed={discographyFilter === filter}
                      className={`rounded-full px-3 py-1 text-sm transition-colors ${
                        discographyFilter === filter
                          ? "bg-white text-black"
                          : "bg-surface-2 text-white hover:bg-surface-3"
                      }`}
                    >
                      {t(FILTER_LABEL_KEYS[filter])}
                    </button>
                  ))}
                </div>
              )
            }
          />
        )}

        <ArtistCarousel title={t("artist.similarArtists")} artists={similarArtists} />

        {hasAbout && (
          <section className="mb-8 max-w-3xl">
            <h2 className="mb-4 text-[22px] font-bold text-white">{t("artist.about")}</h2>
            <div className="rounded-lg bg-surface-2 p-6 shadow-e1">
              {spotifyStats.length > 0 && (
                <dl className="mb-4 flex flex-wrap gap-x-10 gap-y-3">
                  {spotifyStats.map((stat) => (
                    <div key={stat.label}>
                      <dt className="text-xs text-neutral-400">{stat.label}</dt>
                      <dd className="text-2xl font-bold text-white">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {biography !== "" && (
                <>
                  <p className={`whitespace-pre-line text-sm leading-relaxed text-neutral-300 ${bioExpanded ? "" : "line-clamp-4"}`}>
                    {biography}
                  </p>
                  <button
                    onClick={() => setBioExpanded((v) => !v)}
                    className="mt-2 text-sm font-semibold text-white hover:underline"
                  >
                    {bioExpanded ? t("artist.showLess") : t("artist.showMore")}
                  </button>
                </>
              )}
              {spotify && spotify.topCities.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs text-neutral-400">{t("artist.topCities")}</h3>
                  <ul className="mt-2 flex flex-col gap-1 text-sm text-neutral-300">
                    {spotify.topCities.map((city) => (
                      <li key={`${city.city}-${city.country}`} className="flex justify-between gap-4">
                        <span className="truncate">
                          {city.city}, {city.country}
                        </span>
                        <span className="shrink-0 text-neutral-400">
                          {t("artist.listenersCount", { count: numberFormat.format(city.listeners) })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(info?.lastFmUrl || musicBrainzId || spotify) && (
                <div className={`flex flex-wrap items-center gap-2 ${biography !== "" || spotify ? "mt-4" : ""}`}>
                  {spotify && (
                    <a
                      href={spotify.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-300 transition-colors hover:border-white hover:text-white"
                    >
                      Spotify
                    </a>
                  )}
                  {info?.lastFmUrl && (
                    <a
                      href={info.lastFmUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-300 transition-colors hover:border-white hover:text-white"
                    >
                      Last.fm
                    </a>
                  )}
                  {musicBrainzId && (
                    <a
                      href={`https://musicbrainz.org/artist/${encodeURIComponent(musicBrainzId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-300 transition-colors hover:border-white hover:text-white"
                    >
                      MusicBrainz
                    </a>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
