import { GripVertical, X } from "lucide-react";
import { MarqueeText } from "../../components/MarqueeText";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useCallback, useState } from "react";

const MAX_QUEUE_DISPLAY = 50;

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function QueuePanel() {
  const { showQueue, toggleQueue } = usePlayerStore();

  if (!showQueue) return null;

  return (
    <div className="fixed right-0 top-0 bottom-20 z-40 flex w-80 flex-col border-l border-neutral-800 bg-neutral-900 shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white">File d'attente</h2>
        <button onClick={toggleQueue} className="text-neutral-400 transition-colors hover:text-white" title="Fermer">
          <X size={18} />
        </button>
      </div>

      <QueueList />
    </div>
  );
}

type DropPosition = "before" | "after";

function QueueList() {
  const { queue, playOrder, playOrderPosition, reorderQueue } = usePlayerStore();

  const [dragLocalIndex, setDragLocalIndex] = useState<number | null>(null);
  const [hoverLocalIndex, setHoverLocalIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>("before");

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
    <div className="flex-1 min-h-0 overflow-y-auto" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
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
  const coverUrl = track.coverUrl ?? "/default-cover.svg";

  return (
    <li className="relative">
      {showIndicatorBefore && (
        <div className="pointer-events-none absolute -top-px left-0 right-0 z-10 h-0.5 bg-emerald-500" />
      )}

      <div
        draggable
        onDragStart={() => onDragStart(localIndex)}
        onDragOver={(e) => onDragOverItem(e, localIndex)}
        onDragEnd={onDragEnd}
        className={`group flex cursor-grab items-center gap-3 px-4 py-2 transition-colors active:cursor-grabbing ${
          isDragging ? "opacity-40" : "hover:bg-neutral-800/50"
        }`}
      >
        <div className="shrink-0 text-neutral-600 opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-neutral-400">
          <GripVertical size={14} />
        </div>

        <img
          src={coverUrl}
          alt=""
          draggable={false}
          className="h-10 w-10 shrink-0 rounded object-cover"
          loading="lazy"
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
        <div className="pointer-events-none absolute -bottom-px left-0 right-0 z-10 h-0.5 bg-emerald-500" />
      )}
    </li>
  );
}