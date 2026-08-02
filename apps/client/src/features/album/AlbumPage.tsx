import { useParams } from "react-router-dom";
import { Play, Pause, Shuffle } from "lucide-react";
import { useAlbum } from "./useAlbum";
import { useServersStore } from "../../stores/serversStore";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useTranslation } from "../../lib/i18n";
import { useArtistAlbums } from "./useArtistAlbums";
import { useSimilarAlbums } from "./useSimilarAlbums";
import { AlbumCarousel } from "./AlbumCarousel";


function formatTrackDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatAlbumDuration(seconds: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hours > 0) return t("album.durationHoursMinutes", { hours, minutes: mins });
  return t("album.durationMinutes", { minutes: mins });
}

export function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const { album, loading, error } = useAlbum(id);
  const { t } = useTranslation();
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  // Hooks appelés inconditionnellement, AVANT tout early return.
  const artistId = album?.artistId;
  const { albums: artistAlbums, loading: artistAlbumsLoading } = useArtistAlbums(
    artistId,
    album?.id ?? "",
  );

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;

  // Premier carrousel : albums de l'artiste (ex: Scooter)
  const { albums: scotterAlbums, loading: scotterLoading } = useSimilarAlbums(
    artistId,
    album?.id ?? "",
    "scotter",
  );

  // Deuxième carrousel : suggestions aléatoires
  const { albums: randomAlbums, loading: randomLoading } = useSimilarAlbums(
    artistId,
    album?.id ?? "",
    undefined,
  );

  if (loading) {
    return <div className="p-8 text-neutral-400">{t("common.loading")}</div>;
  }

  if (error || !album || !client) {
    return <div className="p-8 text-neutral-400">{error ?? t("album.notFound")}</div>;
  }

  const coverUrl = album.coverArt ? client.getCoverArtUrl(album.coverArt, 600) : undefined;

  type AlbumSong = NonNullable<typeof album>["song"][number];

  function toTrack(song: AlbumSong): Track {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      duration: song.duration,
      coverUrl: song.coverArt ? client!.getCoverArtUrl(song.coverArt, 300) : coverUrl,
    };
  }

  const isThisAlbumCurrent = currentTrack !== null && album.song.some((s) => s.id === currentTrack.id);
  const isThisAlbumPlaying = isThisAlbumCurrent && isPlaying;

  function handlePlayAlbum() {
    if (isThisAlbumPlaying) {
      togglePlay();
      return;
    }
    const queue = album!.song.map(toTrack);
    if (queue.length > 0) playTrack(queue[0], queue);
  }

  function handleShuffleToggle() {
    toggleShuffle();
  }

  function handleTrackClick(song: AlbumSong) {
    if (currentTrack?.id === song.id) {
      togglePlay();
      return;
    }
    const queue = album!.song.map(toTrack);
    playTrack(toTrack(song), queue);
  }

  return (
    <div>
      {/* Header dégradé */}
      <div className="flex items-end gap-6 bg-gradient-to-b from-neutral-700 to-neutral-900 px-8 pb-6 pt-16">
        <div className="h-56 w-56 shrink-0 overflow-hidden rounded shadow-2xl">
          {coverUrl ? (
            <img src={coverUrl} alt={album.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-800 text-neutral-600">♪</div>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{t("album.labelAlbum")}</p>
          <h1 className="mt-2 truncate text-5xl font-black text-white">{album.name}</h1>
          <div className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
            <span className="font-semibold text-white">{album.artist}</span>
            {album.year && <span>· {album.year}</span>}
            <span>· {t("album.trackCount", { count: album.songCount })}</span>
            <span>, {formatAlbumDuration(album.duration, t)}</span>
          </div>
        </div>
      </div>

      {/* Barre d'actions */}
      <div className="flex items-center gap-6 bg-neutral-900/40 px-8 py-6 mb-6">
        <button
          onClick={handlePlayAlbum}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg transition hover:scale-105 hover:bg-emerald-400"
          title={t("album.play")}
        >
          {isThisAlbumPlaying ? (
            <Pause size={22} fill="black" className="text-neutral-900" />
          ) : (
            <Play size={22} fill="black" className="ml-1 text-neutral-900" />
          )}
        </button>

        <button
          onClick={handleShuffleToggle}
          className={`transition-colors ${isShuffle ? "text-emerald-400" : "text-neutral-400 hover:text-white"}`}
          title={t("album.shuffle")}
        >
          <Shuffle size={24} />
        </button>
      </div>

      {/* Tracklist */}
      <div className="px-8 pb-12">
        <div className="grid grid-cols-[32px_1fr_auto] gap-3 border-b border-neutral-800 px-2 pb-2 text-xs uppercase tracking-wider text-neutral-500">
          <span className="text-center">#</span>
          <span>{t("album.columnTitle")}</span>
          <span>{t("album.columnDuration")}</span>
        </div>

        {album.song.map((song, index) => {
          const isCurrent = currentTrack?.id === song.id;
          return (
            <div
              key={song.id}
              onClick={() => handleTrackClick(song)}
              className="group grid cursor-pointer grid-cols-[32px_1fr_auto] items-center gap-3 rounded-md px-2 py-3 hover:bg-neutral-800/60"
            >
              <div className="flex items-center justify-center text-sm text-neutral-400">
                {isCurrent && isPlaying ? (
                  <Pause size={14} className="text-emerald-400" fill="currentColor" />
                ) : (
                  <>
                    <span className="group-hover:hidden">{index + 1}</span>
                    <Play size={14} className="hidden text-white group-hover:block" fill="currentColor" />
                  </>
                )}
              </div>

              <div className="min-w-0">
                <p className={`truncate text-sm ${isCurrent ? "text-emerald-400" : "text-white"}`}>{song.title}</p>
                {song.artist !== album.artist && (
                  <p className="truncate text-xs text-neutral-400">{song.artist}</p>
                )}
              </div>

              <span className="text-xs text-neutral-400 tabular-nums">{formatTrackDuration(song.duration)}</span>
            </div>
          );
        })}

        {/* Carrousel albums de l'artiste */}
        {!scotterLoading && (
          <div className="mt-10">
            <h2 className="mb-4 text-xl font-semibold text-white">{t("album.moreFromArtist", { artist: album.artist })}</h2>
            <AlbumCarousel title={""} albums={scotterAlbums} />
          </div>
        )}

        {/* Carrousel suggestions aléatoires */}
        {!randomLoading && (
          <div className="mt-10">
            <h2 className="mb-4 text-xl font-semibold text-white">{t("album.similarAlbums")}</h2>
            <AlbumCarousel title={""} albums={randomAlbums} />
          </div>
        )}
      </div>
    </div>
  );
}