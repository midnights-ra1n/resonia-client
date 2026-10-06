import { Link } from "react-router-dom";
import type { AlbumSummary } from "@resonia/api-client";
import { MusicNotes, Pause, Play } from "../../components/icons";
import { useCoverArt } from "../../hooks/useCoverArt";
import { useDominantColor } from "../../hooks/useDominantColor";
import { useTranslation } from "../../lib/i18n";
import { usePlayerStore } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { usePlayCollection } from "./usePlayCollection";
import { CoverImage } from "../../components/CoverImage";

interface HomeHeroProps {
  album: AlbumSummary | undefined;
  loading: boolean;
}

/** Bandeau « Reprendre l'écoute » en tête d'accueil : le dernier album écouté, en grand, avec
 *  le bouton Lecture — le seul élément orange plein de l'écran (règle de la palette Carotte).
 *  Le halo de couleur vient de la pochette (couleur dominante, échantillonnée une seule fois
 *  puis mise en cache) : dégradé STATIQUE, aucune animation ni filtre continu. */
export function HomeHero({ album, loading }: HomeHeroProps) {
  const { t } = useTranslation();
  const activeServerId = useServersStore((s) => s.activeServerId);
  const { client, loadingId, playAlbum } = usePlayCollection();
  const isThisAlbumPlaying = usePlayerStore(
    (s) => s.isPlaying && !!album && s.currentTrack?.albumId === album.id,
  );
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const coverUrl = client && album?.coverArt ? client.getCoverArtUrl(album.coverArt, 600) : undefined;
  const cachedCoverUrl = useCoverArt(activeServerId ?? undefined, album?.coverArt, 600, coverUrl);
  const dominantColor = useDominantColor(cachedCoverUrl);

  if (loading && !album) {
    return <div className="mb-10 h-[232px] animate-pulse rounded-panel bg-surface-2" />;
  }
  if (!album) return null;

  const meta = [album.artist, album.year, t("album.trackCount", { count: album.songCount })]
    .filter(Boolean)
    .join(" · ");

  function handlePlay() {
    if (!album) return;
    if (isThisAlbumPlaying) togglePlay();
    else void playAlbum(album);
  }

  return (
    <section className="relative mb-10 overflow-hidden rounded-panel border border-white/5 bg-surface-2 shadow-e2">
      {dominantColor && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{ background: `linear-gradient(120deg, ${dominantColor} 0%, transparent 75%)` }}
        />
      )}

      <div className="relative flex items-end gap-6 p-6">
        <Link to={`/albums/${album.id}`} tabIndex={-1} className="shrink-0">
          <div className="relative h-44 w-44 overflow-hidden rounded-cover bg-surface-3 shadow-e2 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-inset after:ring-white/[0.06]">
            {cachedCoverUrl ? (
              <CoverImage src={cachedCoverUrl} alt={album.name} className="h-full w-full object-cover" decoding="async" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-neutral-600">
                <MusicNotes size={48} />
              </div>
            )}
          </div>
        </Link>

        <div className="min-w-0 flex-1 pb-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
            {t("home.resumeListening")}
          </p>
          <Link to={`/albums/${album.id}`} className="mt-2 block">
            <h2 className="line-clamp-2 text-[44px] font-black leading-[1.05] text-white">{album.name}</h2>
          </Link>
          <p className="mt-2 truncate text-[13px] text-neutral-300">{meta}</p>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={handlePlay}
              disabled={loadingId === album.id}
              className="flex h-11 items-center gap-2 rounded-full bg-accent pl-4 pr-6 font-medium text-on-accent shadow-play transition-[transform,background-color] hover:scale-[1.03] hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-60"
            >
              {isThisAlbumPlaying ? (
                <Pause size={22} fill="currentColor" />
              ) : (
                <Play size={22} fill="currentColor" />
              )}
              {isThisAlbumPlaying ? t("home.pause") : t("album.play")}
            </button>
            <Link
              to={`/albums/${album.id}`}
              className="flex h-11 items-center rounded-full border border-neutral-600 px-5 text-sm font-medium text-white transition-colors hover:border-white"
            >
              {t("home.openAlbum")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
