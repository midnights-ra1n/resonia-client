import { Pause, Play, Shuffle } from "lucide-react";
import { useParams } from "react-router-dom";
import type { AlbumSummary } from "@resonia/api-client";
import { AlbumCarousel } from "../album/AlbumCarousel";
import { TrackResultRow } from "../search/TrackResultRow";
import { useCoverArt } from "../../hooks/useCoverArt";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { useArtist } from "./useArtist";
import { useArtistPhoto } from "./useArtistPhoto";
import { useArtistPopularSongs } from "./useArtistPopularSongs";

export function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const { artist, loading, error } = useArtist(id);
  const { songs: popularSongs, loading: popularSongsLoading, source: popularSongsSource } = useArtistPopularSongs(
    artist?.name,
  );

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

  const navidromeCoverUrl = client && artist?.coverArt ? client.getCoverArtUrl(artist.coverArt, 600) : undefined;
  const photoUrl = useArtistPhoto(artist?.name, navidromeCoverUrl);
  const cachedPhotoUrl = useCoverArt(activeServerId ?? undefined, artist ? `artist:${artist.id}` : undefined, 600, photoUrl);

  if (loading) {
    return <div className="p-8 text-neutral-400">{t("common.loading")}</div>;
  }

  if (error || !artist) {
    return <div className="p-8 text-neutral-400">{error ?? t("artist.notFound")}</div>;
  }

  const albums: AlbumSummary[] = (artist.album ?? [])
    .map((a) => ({ ...a, artistId: a.artistId ?? artist.id }))
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const isThisArtistCurrent = currentTrack !== null && popularSongs.some((s) => s.id === currentTrack.id);
  const isThisArtistPlaying = isThisArtistCurrent && isPlaying;

  function toTrack(song: (typeof popularSongs)[number]): Track {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      artistId: song.artistId ?? artist!.id,
      album: song.album,
      albumId: song.albumId,
      duration: song.duration,
      coverUrl: song.coverArt ? client?.getCoverArtUrl(song.coverArt, 300) : undefined,
    };
  }

  function handlePlay() {
    if (isThisArtistPlaying) {
      togglePlay();
      return;
    }
    if (popularSongs.length > 0) playFromStart(popularSongs.map(toTrack));
  }

  return (
    <div>
      <div className="relative h-80 w-full overflow-hidden bg-neutral-800">
        {cachedPhotoUrl && (
          <img src={cachedPhotoUrl} alt={artist.name} className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/10 to-black/20" />
        <div className="absolute bottom-6 left-8 right-8">
          <h1 className="truncate text-6xl font-black text-white drop-shadow-lg">{artist.name}</h1>
          {artist.albumCount > 0 && (
            <p className="mt-2 text-sm text-neutral-200 drop-shadow">
              {t("artist.albumCount", { count: artist.albumCount })}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6 bg-neutral-900/40 px-8 py-6 mb-6">
        <button
          onClick={handlePlay}
          disabled={popularSongs.length === 0}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg transition hover:scale-105 hover:bg-emerald-400 disabled:opacity-50"
          title={t("artist.play")}
        >
          {isThisArtistPlaying ? (
            <Pause size={22} fill="black" className="text-neutral-900" />
          ) : (
            <Play size={22} fill="black" className="ml-1 text-neutral-900" />
          )}
        </button>

        <button
          onClick={toggleShuffle}
          className={`transition-colors ${isShuffle ? "text-emerald-400" : "text-neutral-400 hover:text-white"}`}
          title={t("artist.shuffle")}
        >
          <Shuffle size={24} />
        </button>
      </div>

      <div className="px-8 pb-12">
        {!popularSongsLoading && popularSongs.length > 0 && (
          <section className="mb-10">
            <div className="mb-4 flex items-baseline gap-2">
              <h2 className="text-xl font-semibold text-white">{t("artist.popularSongs")}</h2>
              {popularSongsSource === "lastfm" && (
                <span className="text-xs text-neutral-500">{t("artist.popularSongsSourceLastfm")}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {popularSongs.map((song) => (
                <TrackResultRow key={song.id} song={song} songs={popularSongs} />
              ))}
            </div>
          </section>
        )}

        {albums.length > 0 && <AlbumCarousel title={t("artist.discography")} albums={albums} />}
      </div>
    </div>
  );
}
