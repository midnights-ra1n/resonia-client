import { BarChart3, Disc, Download, Folder, Home, LayoutList, Library, Music, Settings, Star } from "lucide-react";
import { NavLink, Link } from "react-router-dom";
import { useTranslation } from "../../lib/i18n";
import { usePlaylists } from "../../hooks/usePlaylists";

const navLinks = [
  { to: "/", icon: Home, key: "nav.home" },
  { to: "/favorites", icon: Star, key: "nav.favorites" },
  { to: "/artists", icon: Disc, key: "nav.artists" },
  { to: "/tracks", icon: Music, key: "nav.tracks" },
  { to: "/genres", icon: LayoutList, key: "nav.genres" },
  { to: "/folders", icon: Folder, key: "nav.folders" },
  { to: "/downloads", icon: Download, key: "nav.downloads" },
  { to: "/stats", icon: BarChart3, key: "nav.stats" },
  { to: "/settings", icon: Settings, key: "nav.settings" },
];

export function Sidebar() {
  const { t } = useTranslation();
  const { playlists, loading, error } = usePlaylists();

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-1 bg-neutral-950 p-4">
      {/* Logo */}
      <div className="flex justify-center items-center gap-4 py-4">
        <img src="/favicon.svg" alt="Resonia" className="w-16" />
      </div>

      {/* Navigation links */}
      {navLinks.map(({ to, icon: Icon, key }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
            }`
          }
        >
          <Icon size={18} />
          {t(key)}
        </NavLink>
      ))}

      {/* Spotify-like playlists section */}
      <div className="mt-auto">
        <h3 className="text-sm font-medium text-neutral-400 mb-2 uppercase tracking-wider">Playlists</h3>
        {loading ? (
          <div className="flex flex-col gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 w-full bg-neutral-900 rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : error ? (
          <div className="text-sm text-red-400">{error}</div>
        ) : playlists.length > 0 ? (
          <nav className="space-y-1">
            {playlists.map((playlist) => (
              <Link
                key={playlist.id}
                to={`/playlists/${playlist.id}`}
                className="group flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition hover:bg-neutral-900"
              >
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-neutral-800">
                  {playlist.coverArt ? (
                    <img
                      src={playlist.coverArt}
                      alt={playlist.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-neutral-600">
                      <Library size={16} />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <Music size={18} className="text-white" />
                  </div>
                </div>
                <span className="truncate text-neutral-300 group-hover:text-white">{playlist.name}</span>
              </Link>
            ))}
          </nav>
        ) : (
          <p className="text-sm text-neutral-500">Pas de playlists disponibles</p>
        )}
      </div>

      {/* Version label */}
      <div className="space-y-1">
        <label className="text-sm text-neutral-400">resonia-client version</label>
      </div>
    </aside>
  );
}
