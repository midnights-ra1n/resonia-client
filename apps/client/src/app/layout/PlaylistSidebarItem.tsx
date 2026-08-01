import { ListMusic, Play } from "lucide-react";
import { NavLink } from "react-router-dom";

interface PlaylistSidebarItemProps {
  id: string;
  name: string;
  coverUrl?: string;
  onPlay: (id: string) => void;
}

export function PlaylistSidebarItem({
  id,
  name,
  coverUrl,
  onPlay,
}: PlaylistSidebarItemProps) {
  return (
    <NavLink
      to={`/playlists/${id}`}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition ${
          isActive
            ? "bg-neutral-800 text-white"
            : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
        }`
      }
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-neutral-800">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-600">
            <ListMusic size={16} />
          </div>
        )}

        {/* Overlay + bouton play au hover, comme sur Spotify */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPlay(id);
          }}
          aria-label={`Lire la playlist ${name}`}
          className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Play size={16} className="fill-white text-white" />
        </button>
      </div>

      <span className="truncate">{name}</span>
    </NavLink>
  );
}
