import { GripVertical, X } from "lucide-react";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useState, useCallback, useRef } from "react";

const MAX_QUEUE_DISPLAY = 50;

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function QueuePanel() {
  const { showQueue, toggleQueue, queue, queueIndex, reorderQueue } = usePlayerStore();

  if (!showQueue) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-80 bg-neutral-900 border-l border-neutral-800 z-50 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
          File d'attente
        </h2>
        <button
          onClick={toggleQueue}
          className="text-neutral-400 hover:text-white transition-colors"
          title="Fermer"
        >
          <X size={18} />
        </button>
      </div>

      {/* Queue List */}
      <QueueList />
    </div>
  );
}

function QueueList() {
  const { queue, queueIndex, reorderQueue } = usePlayerStore();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);

  const upcoming = queue.slice(queueIndex + 1, queueIndex + 1 + MAX_QUEUE_DISPLAY);
  const hasMore = queue.length > queueIndex + 1 + MAX_QUEUE_DISPLAY;

  const handleDragStart = useCallback((index: number) => {
    dragItemRef.current = index;
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      const sourceIndex = dragItemRef.current;
      if (sourceIndex === null || sourceIndex === targetIndex) return;
      reorderQueue(sourceIndex, targetIndex);
      dragItemRef.current = targetIndex;
      setDragIndex(targetIndex);
    },
    [reorderQueue]
  );

  const handleDragEnd = useCallback(() => {
    dragItemRef.current = null;
    setDragIndex(null);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      {upcoming.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-2 px-6 text-center">
          <p className="text-sm">Aucune musique dans la file d'attente.</p>
        </div>
      ) : (
        <ul className="py-2">
          {upcoming.map((track, i) => (
            <QueueItem
              key={`${track.id}-${i}`}
              track={track}
              index={i}
              isDragging={dragIndex === i}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            />
          ))}

          {hasMore && (
            <li className="px-4 py-3 text-center text-xs text-neutral-500">
              + {queue.length - (queueIndex + 1 + MAX_QUEUE_DISPLAY)} musique(s) de plus
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function QueueItem({
  track,
  index,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  track: Track;
  index: number;
  isDragging: boolean;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
}) {
  const coverUrl = track.coverUrl ?? "/default-cover.svg";

  return (
    <li
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className={`group flex items-center gap-3 px-4 py-2 cursor-grab active:cursor-grabbing transition-colors ${
        isDragging
          ? "bg-neutral-800 opacity-60"
          : "hover:bg-neutral-800/50"
      }`}
    >
      {/* Drag handle */}
      <div className="text-neutral-600 group-hover:text-neutral-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical size={14} />
      </div>

      {/* Cover */}
      <img
        src={coverUrl}
        alt=""
        className="w-10 h-10 rounded shrink-0 object-cover"
        loading="lazy"
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{track.title}</p>
        <p className="text-xs text-neutral-400 truncate">{track.artist}</p>
      </div>

      {/* Duration */}
      {track.duration > 0 && (
        <span className="text-xs text-neutral-500 shrink-0">
          {formatDuration(track.duration)}
        </span>
      )}
    </li>
  );
}
