import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InfoModal } from "../../components/InfoModal";
import { MarqueeText } from "../../components/MarqueeText";
import { ContextMenu } from "../../components/menu/ContextMenu";
import { buildTrackMenuItems } from "../../components/menu/buildTrackMenuItems";
import { useContextMenu } from "../../components/menu/useContextMenu";
import { usePlayerStore, DEFAULT_COVER_URL } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { useCoverArt } from "../../hooks/useCoverArt";
import { formatTrackDuration } from "../../lib/format/duration";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { LikeButton } from "./LikeButton";

// Bouton like : 20px (h-5 w-5) + 8px d'écart avant le texte.
const BUTTON_WIDTH = 20;
const BUTTON_GAP = 8;
const BUTTON_RESERVED = BUTTON_WIDTH + BUTTON_GAP;

export function PlayerSectionLeft() {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const servers = useServersStore((s) => s.servers);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const menu = useContextMenu();
  const [infoOpen, setInfoOpen] = useState(false);

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;

  // Passe par le cache disque des pochettes (même mécanisme que les grilles/cartes) : évite
  // un nouveau téléchargement réseau à chaque changement de piste, source du délai et de
  // l'affichage transitoire de la pochette précédente que l'on cherche à corriger ici. Le
  // préchargement des pistes à venir (voir playerStore.refreshUpcomingPrefetch) alimente ce
  // même cache en avance, donc au moment où la piste devient active la pochette est déjà
  // disponible localement la plupart du temps.
  const cachedCoverUrl = useCoverArt(
    activeServerId ?? undefined,
    currentTrack?.coverArtId,
    300,
    currentTrack?.coverUrl,
  );
  const coverUrl = cachedCoverUrl ?? DEFAULT_COVER_URL;
  const title = currentTrack?.title ?? "—";
  const artist = currentTrack?.artist ?? "—";

  const containerRef = useRef<HTMLDivElement>(null);
  const titleMeasureRef = useRef<HTMLSpanElement>(null);
  const artistMeasureRef = useRef<HTMLSpanElement>(null);
  // Position horizontale (px) du bouton like, calculée à part : le bloc titre/artiste
  // lui-même reste en flex-1/min-w-0 pur — exactement le pattern utilisé (et qui fonctionne)
  // sur AlbumPage/PlaylistPage — pour que MarqueeText gère son propre débordement/défilement
  // sans aucune interférence. Le bouton, positionné en absolu par-dessus, vient se coller
  // juste après le texte s'il est court (naturalWidth), ou se plaque à la fin de la zone
  // réservée (containerWidth - bouton) si le texte est trop long et défile.
  const [buttonLeft, setButtonLeft] = useState<number | null>(null);

  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      const titleEl = titleMeasureRef.current;
      const artistEl = artistMeasureRef.current;
      if (!container || !titleEl || !artistEl) return;

      const naturalWidth = Math.max(titleEl.scrollWidth, artistEl.scrollWidth);
      const availableTextSpace = Math.max(0, container.clientWidth - BUTTON_RESERVED);
      setButtonLeft(Math.min(naturalWidth, availableTextSpace) + BUTTON_GAP);
    }

    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [title, artist]);

  return (
    <div className="flex items-center gap-3 h-full min-w-0">
      <img
        key={currentTrack?.id ?? "empty"}
        src={coverUrl}
        alt="Cover"
        className="w-12 h-12 rounded-md object-cover shrink-0 bg-neutral-800"
        decoding="async"
      />

      <div
        ref={containerRef}
        className="relative min-w-0 flex-1"
        style={{ paddingRight: BUTTON_RESERVED }}
        onContextMenu={(e) => {
          if (!currentTrack) return;
          menu.handleContextMenu(e);
        }}
      >
        {/* Éléments invisibles servant uniquement à mesurer la largeur naturelle (non
            tronquée) du titre et de l'artiste, pour positionner le bouton like. N'affecte
            en rien la mesure de débordement propre à MarqueeText. */}
        <span ref={titleMeasureRef} className="invisible absolute whitespace-nowrap text-sm">
          {title}
        </span>
        <span ref={artistMeasureRef} className="invisible absolute whitespace-nowrap text-xs">
          {artist}
        </span>

        {/* key={track id} : redémarre proprement le défilement (position, timers) à chaque
            changement de piste plutôt que de garder l'état de la précédente. */}
        <div key={currentTrack?.id ?? "empty"}>
          <MarqueeText
            text={title}
            to={currentTrack?.albumId ? `/albums/${currentTrack.albumId}` : undefined}
            className="text-sm text-white hover:underline"
          />
          <MarqueeText
            text={artist}
            to={currentTrack?.artistId ? `/artists/${currentTrack.artistId}` : undefined}
            className="text-xs text-neutral-400 hover:text-white hover:underline"
          />
        </div>

        {currentTrack && buttonLeft !== null && (
          <div className="absolute top-1/2 -translate-y-1/2" style={{ left: buttonLeft }}>
            <LikeButton track={currentTrack} />
          </div>
        )}
      </div>

      {menu.open && currentTrack && client && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={menu.close}
          items={buildTrackMenuItems({
            track: currentTrack,
            client,
            t,
            navigate,
            addToQueue,
            onOpenInfo: () => setInfoOpen(true),
          })}
        />
      )}

      {infoOpen && currentTrack && (
        <InfoModal
          title={currentTrack.title}
          coverUrl={cachedCoverUrl ?? undefined}
          onClose={() => setInfoOpen(false)}
          rows={[
            { label: t("search.artistLabel"), value: currentTrack.artist },
            { label: t("album.labelAlbum"), value: currentTrack.album },
            { label: t("playlist.columnDuration"), value: formatTrackDuration(currentTrack.duration) },
          ]}
        />
      )}
    </div>
  );
}
