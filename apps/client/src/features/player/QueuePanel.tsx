import { DotsSixVertical, X } from "../../components/icons";
import { MarqueeText } from "../../components/MarqueeText";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useCallback, useRef, useState } from "react";
import { useScrollingClass } from "../../hooks/useScrollingClass";
import { useDelayedUnmount } from "../../hooks/useDelayedUnmount";
import { useCoverArt } from "../../hooks/useCoverArt";
import { useServersStore } from "../../stores/serversStore";
import { CoverImage } from "../../components/CoverImage";

const MAX_QUEUE_DISPLAY = 50;

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function QueuePanel() {
  const showQueue = usePlayerStore((s) => s.showQueue);
  const toggleQueue = usePlayerStore((s) => s.toggleQueue);

  // Reste monté pendant le repli animé de son conteneur (voir AppLayout, 320 ms).
  const mounted = useDelayedUnmount(showQueue, 320);
  if (!mounted) return null;

  return (
    // Carte flottante à part entière dans la rangée d'AppLayout (et non plus un calque fixe
    // par-dessus) : le contenu et le lecteur se resserrent à côté, rien n'est masqué — le
    // bouton file d'attente du lecteur reste cliquable. Son ouverture/fermeture est animée par
    // le conteneur repliable d'AppLayout (largeur), pas ici.
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-panel border border-white/5 bg-neutral-900 shadow-e2">
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white">File d'attente</h2>
        <button onClick={toggleQueue} className="text-neutral-400 transition-colors hover:text-white" title="Fermer">
          <X size={18} />
        </button>
      </div>

      <QueueList />
    </aside>
  );
}

type DropPosition = "before" | "after";

function QueueList() {
  const queue = usePlayerStore((s) => s.queue);
  const playOrder = usePlayerStore((s) => s.playOrder);
  const playOrderPosition = usePlayerStore((s) => s.playOrderPosition);
  const reorderQueue = usePlayerStore((s) => s.reorderQueue);

  const [dragLocalIndex, setDragLocalIndex] = useState<number | null>(null);
  const [hoverLocalIndex, setHoverLocalIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>("before");
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollingClass(scrollRef);

  const upcomingIndices = playOrder.slice(playOrderPosition + 1, playOrderPosition + 1 + MAX_QUEUE_DISPLAY);
  const upcoming = upcomingIndices.map((queueIdx) => queue[queueIdx]).filter(Boolean);
  const hasMore = playOrder.length > playOrderPosition + 1 + MAX_QUEUE_DISPLAY;

  const handleDragStart = useCallback((localIndex: number) => {
    setDragLocalIndex(localIndex);
  }, []);

  const handleDragOverItem = useCallback(
    (e: React.DragEvent, localIndex: number) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const isTopHalf = e.clientY < rect.top + rect.height / 2;
      setHoverLocalIndex(localIndex);
      setDropPosition(isTopHalf ? "before" : "after");
    },
    [],
  );

  const handleDrop = useCallback(() => {
    if (dragLocalIndex === null || hoverLocalIndex === null) {
      setDragLocalIndex(null);
      setHoverLocalIndex(null);
      return;
    }

    const baseOffset = playOrderPosition + 1;
    const fromAbsolute = baseOffset + dragLocalIndex;

    let toAbsolute = baseOffset + hoverLocalIndex + (dropPosition === "after" ? 1 : 0);
    if (fromAbsolute < toAbsolute) toAbsolute -= 1;

    if (fromAbsolute !== toAbsolute) {
      reorderQueue(fromAbsolute, toAbsolute);
    }

    setDragLocalIndex(null);
    setHoverLocalIndex(null);
  }, [dragLocalIndex, hoverLocalIndex, dropPosition, playOrderPosition, reorderQueue]);

  const handleDragEnd = useCallback(() => {
    setDragLocalIndex(null);
    setHoverLocalIndex(null);
  }, []);

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      {upcoming.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-neutral-500">
          <p className="text-sm">Aucune musique dans la file d'attente.</p>
        </div>
      ) : (
        <ul className="py-2">
          {upcoming.map((track, i) => (
            <QueueItem
              key={`${track.id}-${i}`}
              track={track}
              localIndex={i}
              isDragging={dragLocalIndex === i}
              showIndicatorBefore={hoverLocalIndex === i && dropPosition === "before" && dragLocalIndex !== i}
              showIndicatorAfter={hoverLocalIndex === i && dropPosition === "after" && dragLocalIndex !== i}
              onDragStart={handleDragStart}
              onDragOverItem={handleDragOverItem}
              onDragEnd={handleDragEnd}
            />
          ))}

          {hasMore && (
            <li className="px-4 py-3 text-center text-xs text-neutral-500">
              + {playOrder.length - (playOrderPosition + 1 + MAX_QUEUE_DISPLAY)} musique(s) de plus
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function QueueItem({
  track,
  localIndex,
  isDragging,
  showIndicatorBefore,
  showIndicatorAfter,
  onDragStart,
  onDragOverItem,
  onDragEnd,
}: {
  track: Track;
  localIndex: number;
  isDragging: boolean;
  showIndicatorBefore: boolean;
  showIndicatorAfter: boolean;
  onDragStart: (localIndex: number) => void;
  onDragOverItem: (e: React.DragEvent, localIndex: number) => void;
  onDragEnd: () => void;
}) {
  const activeServerId = useServersStore((s) => s.activeServerId);
  // Passe par le cache disque des pochettes (voir coverCache.ts / useCoverArt) plutôt que
  // l'URL réseau directe : sans ça, chaque montage/réaffichage de la liste d'attente
  // retapait le réseau pour une pochette déjà téléchargée (perçu comme un défilement
  // saccadé/lent dans la file d'attente).
  const cachedCoverUrl = useCoverArt(activeServerId ?? undefined, track.coverArtId, 80, track.coverUrl);
  // Voir le même commentaire dans playerStore.ts (DEFAULT_COVER_URL) : `BASE_URL`, jamais un
  // chemin racine en dur.
  const coverUrl = cachedCoverUrl ?? `${import.meta.env.BASE_URL}default-cover.svg`;

  return (
    <li className="relative">
      {showIndicatorBefore && (
        <div className="pointer-events-none absolute -top-px left-0 right-0 z-10 h-0.5 bg-accent" />
      )}

      <div
        draggable
        onDragStart={() => onDragStart(localIndex)}
        onDragOver={(e) => onDragOverItem(e, localIndex)}
        onDragEnd={onDragEnd}
        className={`group mx-2 flex cursor-grab items-center gap-3 rounded-xl px-2 py-2 transition-colors active:cursor-grabbing ${
          isDragging ? "opacity-40" : "hover:bg-neutral-800/60"
        }`}
      >
        <div className="shrink-0 text-neutral-600 opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-neutral-400">
          <DotsSixVertical size={14} />
        </div>

        <CoverImage
          src={coverUrl}
          alt=""
          draggable={false}
          className="h-10 w-10 shrink-0 rounded-lg object-cover"
          loading="lazy"
          decoding="async"
        />

        <div className="min-w-0 flex-1">
          <MarqueeText
            text={track.title}
            to={track.albumId ? `/albums/${track.albumId}` : undefined}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            className="text-sm text-white hover:underline"
          />
          <MarqueeText
            text={track.artist}
            to={track.artistId ? `/artists/${track.artistId}` : undefined}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            className="text-xs text-neutral-400 hover:text-white hover:underline"
          />
        </div>

        {track.duration > 0 && (
          <span className="shrink-0 text-xs text-neutral-500">{formatDuration(track.duration)}</span>
        )}
      </div>

      {showIndicatorAfter && (
        <div className="pointer-events-none absolute -bottom-px left-0 right-0 z-10 h-0.5 bg-accent" />
      )}
    </li>
  );
}