import { useEffect, useState } from "react";
import { CoverImage } from "../../components/CoverImage";
import { MarqueeText } from "../../components/MarqueeText";
import { CaretDown, Lyrics } from "../../components/icons";
import { useCachedDominantColor } from "../../hooks/useCachedDominantColor";
import { useCoverArt } from "../../hooks/useCoverArt";
import { useTranslation } from "../../lib/i18n";
import { DEFAULT_COVER_URL, usePlayerStore } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { LyricsView } from "../lyrics/LyricsView";
import { LikeButton } from "./LikeButton";
import { PlayerSectionCenter } from "./PlayerSectionCenter";

/** Vue « Lecture en cours » plein écran, façon Spotify : grande pochette sur un fond teinté de
 *  sa couleur dominante, contrôles de lecture, et bouton paroles qui ouvre les paroles à côté.
 *  Montée seulement quand elle est ouverte (aucun coût au repos). Fond = aplat + dégradé
 *  statiques : pas de blur/backdrop-filter (coût GPU continu sur WebKit/WebView2). */
export function FullscreenPlayer() {
  const { t } = useTranslation();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setFullscreen = usePlayerStore((s) => s.setFullscreen);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const [lyricsOpen, setLyricsOpen] = useState(false);

  const cover = useCoverArt(activeServerId ?? undefined, currentTrack?.coverArtId, 800, currentTrack?.coverUrl);
  const coverUrl = cover ?? DEFAULT_COVER_URL;
  const dominant = useCachedDominantColor(
    activeServerId ?? undefined,
    currentTrack?.coverArtId,
    coverUrl !== DEFAULT_COVER_URL ? coverUrl : undefined,
  );

  // Échap ferme ; sans piste il n'y a rien à montrer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setFullscreen]);
  useEffect(() => {
    if (!currentTrack) setFullscreen(false);
  }, [currentTrack, setFullscreen]);

  if (!currentTrack) return null;

  const iconBtn = "flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/10";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="on-media fixed inset-0 z-[70] flex animate-fade-in flex-col text-white transition-colors duration-700"
      style={{ backgroundColor: dominant ?? "var(--color-surface-1)" }}
    >
      {/* Voile : fond sombre en bas pour la lisibilité, la teinte de la pochette reste en haut. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/85" />

      <header className="relative z-10 flex items-center justify-between p-4">
        <button autoFocus type="button" onClick={() => setFullscreen(false)} className={iconBtn} title={t("fullscreen.close")} aria-label={t("fullscreen.close")}>
          <CaretDown size={22} />
        </button>
        <button
          type="button"
          onClick={() => setLyricsOpen((v) => !v)}
          className={`${iconBtn} ${lyricsOpen ? "bg-white/15 text-accent" : ""}`}
          title={t("fullscreen.lyrics")}
          aria-label={t("fullscreen.lyrics")}
          aria-pressed={lyricsOpen}
        >
          <Lyrics size={20} />
        </button>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center gap-[6vw] px-[5vw] pb-8">
        <div className={`flex min-w-0 flex-col items-center gap-6 ${lyricsOpen ? "w-[min(42vw,52vh)]" : "w-[min(70vw,56vh)]"} transition-[width] duration-300`}>
          {/* La pochette rétrécit en pause (transform seulement : composité par le GPU). */}
          <CoverImage
            key={currentTrack.id}
            src={coverUrl}
            alt=""
            decoding="async"
            className={`aspect-square w-full rounded-lg bg-surface-3 object-cover shadow-[0_24px_80px_rgba(0,0,0,0.55)] transition-transform duration-500 ${isPlaying ? "scale-100" : "scale-[0.92]"}`}
          />
          <div className="flex w-full items-center gap-3">
            <div className="min-w-0 flex-1">
              <MarqueeText auto text={currentTrack.title} to={currentTrack.albumId ? `/albums/${currentTrack.albumId}` : undefined} className="text-2xl font-bold hover:underline" />
              <MarqueeText auto text={currentTrack.artist} to={currentTrack.artistId ? `/artists/${currentTrack.artistId}` : undefined} className="text-base text-white/70 hover:text-white hover:underline" />
            </div>
            <LikeButton track={currentTrack} />
          </div>
          <PlayerSectionCenter />
        </div>

        {lyricsOpen && (
          <div className="flex h-full min-w-0 flex-1 flex-col">
            <LyricsView bare />
          </div>
        )}
      </div>
    </div>
  );
}
