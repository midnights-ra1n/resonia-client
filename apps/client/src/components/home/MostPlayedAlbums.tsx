import { useTranslation } from "../../lib/i18n";
import type { Album } from "../../types/album";

interface MostPlayedAlbumsProps {
  albums: Album[];
  isLoading: boolean;
  error?: string | null;
  /** Déclenché par le clic sur le bouton play (survol) */
  onPlayAlbum: (album: Album) => void;
  /** Déclenché par le clic sur la pochette / le titre (navigation vers la page album) */
  onOpenAlbum: (album: Album) => void;
}

const SKELETON_COUNT = 8;

export function MostPlayedAlbums({
  albums,
  isLoading,
  error,
  onPlayAlbum,
  onOpenAlbum,
}: MostPlayedAlbumsProps) {
  const { t } = useTranslation();
  const showEmptyState = !isLoading && !error && albums.length === 0;

  return (
    <section className="w-full" aria-label={t("home.mostPlayedAlbums.title")}>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xl font-bold text-neutral-100 font-roboto">
          {t("home.mostPlayedAlbums.title")}
        </h2>
      </div>

      {error ? (
        <p className="text-sm text-neutral-400">{error}</p>
      ) : showEmptyState ? (
        <p className="text-sm text-neutral-400">
          {t("home.mostPlayedAlbums.empty")}
        </p>
      ) : (
        <div
          className="flex gap-5 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent"
          role="list"
        >
          {isLoading
            ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <AlbumCardSkeleton key={i} />
              ))
            : albums.map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  onPlay={() => onPlayAlbum(album)}
                  onOpen={() => onOpenAlbum(album)}
                />
              ))}
        </div>
      )}
    </section>
  );
}

interface AlbumCardProps {
  album: Album;
  onPlay: () => void;
  onOpen: () => void;
}

function AlbumCard({ album, onPlay, onOpen }: AlbumCardProps) {
  const { t } = useTranslation();

  return (
    <div
      role="listitem"
      className="group relative w-[170px] shrink-0 snap-start cursor-pointer rounded-md p-3 bg-neutral-900/40 hover:bg-neutral-800/70 transition-colors duration-200"
      onClick={onOpen}
    >
      <div className="relative w-full aspect-square overflow-hidden rounded-md shadow-lg bg-neutral-800">
        {album.coverArtUrl ? (
          <img
            src={album.coverArtUrl}
            alt={t("home.mostPlayedAlbums.coverAlt", { name: album.name })}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CoverPlaceholderIcon />
          </div>
        )}

        {/* Voile sombre au survol, comme sur Spotify, pour faire ressortir le bouton play */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200" />

        <button
          type="button"
          aria-label={t("home.mostPlayedAlbums.playAlbum", { name: album.name })}
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className="
            absolute bottom-2 right-2
            flex items-center justify-center
            h-11 w-11 rounded-full
            bg-emerald-500 text-black shadow-xl
            opacity-0 translate-y-2
            group-hover:opacity-100 group-hover:translate-y-0
            focus-visible:opacity-100 focus-visible:translate-y-0
            transition-all duration-200 ease-out
            hover:scale-105 hover:bg-emerald-400
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300
          "
        >
          <PlayIcon />
        </button>
      </div>

      <div className="mt-3 min-w-0">
        <p className="truncate text-sm font-semibold text-neutral-100 font-roboto">
          {album.name}
        </p>
        <p className="truncate text-xs text-neutral-400 font-roboto mt-0.5">
          {album.artist}
        </p>
      </div>
    </div>
  );
}

function AlbumCardSkeleton() {
  return (
    <div className="w-[170px] shrink-0 rounded-md p-3 animate-pulse">
      <div className="w-full aspect-square rounded-md bg-neutral-800" />
      <div className="mt-3 h-3.5 w-4/5 rounded bg-neutral-800" />
      <div className="mt-2 h-3 w-2/3 rounded bg-neutral-800" />
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-[1px]" fill="currentColor">
      <path d="M8 5.14v13.72c0 .84.91 1.36 1.64.94l11.36-6.86a1.08 1.08 0 0 0 0-1.88L9.64 4.2A1.08 1.08 0 0 0 8 5.14z" />
    </svg>
  );
}

function CoverPlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-neutral-600" fill="currentColor">
      <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
    </svg>
  );
}
