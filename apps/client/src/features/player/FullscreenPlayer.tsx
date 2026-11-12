import { useEffect, useMemo, useRef, useState } from "react";
import { CoverImage } from "../../components/CoverImage";
import { MarqueeText } from "../../components/MarqueeText";
import { CaretDown, Lyrics } from "../../components/icons";
import { useCachedDominantColor } from "../../hooks/useCachedDominantColor";
import { useCoverArt } from "../../hooks/useCoverArt";
import { useTranslation } from "../../lib/i18n";
import { isElectron } from "../../lib/platform";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { DEFAULT_COVER_URL, usePlayerStore } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { LyricsView } from "../lyrics/LyricsView";
import { LikeButton } from "./LikeButton";
import { PlayerSectionCenter } from "./PlayerSectionCenter";

const HI_RES = 1200;

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

/** Plein écran de la fenêtre du système : IPC côté desktop (l'API Fullscreen du navigateur
 *  n'y suit pas le plein écran natif), API Fullscreen (préfixe webkit pour Safari) sur le web. */
function useSystemFullscreen() {
  const [on, setOn] = useState(false);
  const onRef = useRef(false);
  useEffect(() => {
    onRef.current = on;
  }, [on]);

  useEffect(() => {
    if (isElectron()) return window.resonia!.fullscreen.onChange(setOn);
    const sync = () => setOn(Boolean(document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const set = (enabled: boolean) => {
    if (isElectron()) {
      void window.resonia!.fullscreen.set(enabled);
    } else if (enabled) {
      const el = document.documentElement as FsEl;
      void (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
    } else {
      const doc = document as FsDoc;
      void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    }
  };

  // En quittant la vue, on rend aussi la fenêtre à sa taille normale.
  useEffect(
    () => () => {
      if (onRef.current) set(false);
    },
    [],
  );

  return [on, set] as const;
}

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
  const animated = useSettingsStore((s) => s.animatedBackground);
  const [windowFs, setWindowFs] = useSystemFullscreen();
  const server = useServersStore((s) => s.servers.find((x) => x.id === activeServerId));

  // `currentTrack.coverUrl` est une miniature 300 px : elle servirait de source à une pochette
  // affichée à ~600 px (donc floue). On redemande l'image en haute résolution au serveur.
  const coverArtId = currentTrack?.coverArtId;
  const hiResUrl = useMemo(
    () => (server && coverArtId ? getClientForServer(server).getCoverArtUrl(coverArtId, HI_RES) : undefined),
    [server, coverArtId],
  );
  const cover = useCoverArt(activeServerId ?? undefined, coverArtId, HI_RES, hiResUrl);
  const coverUrl = cover ?? DEFAULT_COVER_URL;
  const dominant = useCachedDominantColor(
    activeServerId ?? undefined,
    currentTrack?.coverArtId,
    coverUrl !== DEFAULT_COVER_URL ? coverUrl : undefined,
  );

  // Échap ferme ; sans piste il n'y a rien à montrer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false); // le démontage quitte aussi le plein écran fenêtre
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
      {animated && dominant && (
        <div aria-hidden className="fs-aurora" data-paused={!isPlaying} style={{ "--c": dominant } as React.CSSProperties} />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/85" />

      <header className="relative z-10 flex items-center justify-between p-4">
        <button autoFocus type="button" onClick={() => setFullscreen(false)} className={iconBtn} title={t("fullscreen.close")} aria-label={t("fullscreen.close")}>
          <CaretDown size={22} />
        </button>
        <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setWindowFs(!windowFs)}
          className={iconBtn}
          title={windowFs ? t("fullscreen.windowExit") : t("fullscreen.windowEnter")}
          aria-label={windowFs ? t("fullscreen.windowExit") : t("fullscreen.windowEnter")}
          aria-pressed={windowFs}
        >
          {/* Pas d'icône « agrandir » dans les packs d'icônes : coins dessinés en ligne. */}
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {windowFs ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </svg>
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
        </div>
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
