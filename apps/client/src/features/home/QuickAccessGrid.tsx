import { Link } from "react-router-dom";
import type { AlbumSummary, PlaylistSummary } from "@resonia/api-client";
import { MusicNotes, Pause, Play } from "../../components/icons";
import { useCoverArt } from "../../hooks/useCoverArt";
import { useTranslation } from "../../lib/i18n";
import { usePlayerStore } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { usePlayCollection } from "./usePlayCollection";
import { CoverImage } from "../../components/CoverImage";
import { albumPrefetchProps } from "../album/useAlbum";
import { useAlbumContextMenu } from "../../components/menu/useAlbumContextMenu";

export type QuickAccessItem =
  | { kind: "album"; album: AlbumSummary }
  | { kind: "playlist"; playlist: PlaylistSummary };

interface QuickAccessGridProps {
  items: QuickAccessItem[];
  loading: boolean;
}

const SKELETON_COUNT = 8;

/** Grille d'accès rapide façon Spotify : tuiles compactes (pochette + nom), lecture directe
 *  au survol. Colonnes calculées sur la largeur du PANNEAU (container query `@container`),
 *  pas de la fenêtre : la grille reste juste quand la file d'attente réduit le contenu. */
export function QuickAccessGrid({ items, loading }: QuickAccessGridProps) {
  const { t } = useTranslation();
  const play = usePlayCollection();

  if (!loading && items.length === 0) return null;

  return (
    <section className="@container mb-10">
      <h2 className="mb-4 text-[22px] font-bold text-white">{t("home.quickAccess")}</h2>
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        {loading && items.length === 0
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2" />
            ))
          : items.map((item) => (
              <QuickAccessTile
                key={`${item.kind}-${item.kind === "album" ? item.album.id : item.playlist.id}`}
                item={item}
                play={play}
              />
            ))}
      </div>
    </section>
  );
}

function QuickAccessTile({
  item,
  play,
}: {
  item: QuickAccessItem;
  play: ReturnType<typeof usePlayCollection>;
}) {
  const { t } = useTranslation();
  const activeServerId = useServersStore((s) => s.activeServerId);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const id = item.kind === "album" ? item.album.id : item.playlist.id;
  const name = item.kind === "album" ? item.album.name : item.playlist.name;
  const coverArt = item.kind === "album" ? item.album.coverArt : item.playlist.coverArt;
  const to = item.kind === "album" ? `/albums/${id}` : `/playlists/${id}`;

  // Seule la lecture d'un ALBUM est reconnaissable sans requête (albumId de la piste en
  // cours) ; une playlist n'expose pas d'identifiant sur la piste, son bouton reste « Lecture ».
  const isPlaying = usePlayerStore(
    (s) => item.kind === "album" && s.isPlaying && s.currentTrack?.albumId === id,
  );

  const coverUrl = play.client && coverArt ? play.client.getCoverArtUrl(coverArt, 120) : undefined;
  const cachedCoverUrl = useCoverArt(activeServerId ?? undefined, coverArt, 120, coverUrl);

  // Clic droit : menu album (les playlists ont le leur sur leurs cartes et dans la sidebar).
  const albumMenu = useAlbumContextMenu(item.kind === "album" ? item.album : undefined, cachedCoverUrl);

  function handlePlay() {
    if (isPlaying) togglePlay();
    else if (item.kind === "album") void play.playAlbum(item.album);
    else void play.playPlaylist(item.playlist);
  }

  return (
    <div
      className="group relative flex h-16 items-center gap-3 overflow-hidden rounded-xl bg-surface-2 pr-3 shadow-e1 transition-colors hover:bg-surface-3"
      {...(item.kind === "album" ? { ...albumPrefetchProps(id), onContextMenu: albumMenu.onContextMenu } : {})}
    >
      {/* Lien en calque sur toute la tuile, bouton Play en FRÈRE au-dessus (z-10) : jamais de
          bouton imbriqué dans un lien (voir AlbumCard pour le bug de rechargement évité). */}
      <Link to={to} aria-label={name} className="absolute inset-0" />

      <div className="h-16 w-16 shrink-0 bg-surface-3">
        {cachedCoverUrl ? (
          <CoverImage src={cachedCoverUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-600">
            <MusicNotes size={24} />
          </div>
        )}
      </div>

      <span className={`min-w-0 flex-1 truncate text-sm font-medium ${isPlaying ? "text-accent" : "text-white"}`}>
        {name}
      </span>

      <button
        onClick={handlePlay}
        disabled={play.loadingId === id}
        title={t("album.play")}
        className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-play transition-[opacity,transform,translate,scale] hover:scale-105 disabled:opacity-60 ${
          isPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        }`}
      >
        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
      </button>
      {albumMenu.menuElement}
    </div>
  );
}
