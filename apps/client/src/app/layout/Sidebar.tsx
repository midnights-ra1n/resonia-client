import { BarChart3, Disc, Download, Folder, Home, LayoutList, Library, Music, Settings, Star } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { usePlaylists } from "../../hooks/usePlaylists";
import { useTranslation } from "../../lib/i18n";
import { PlaylistSidebarItem } from "./PlaylistSidebarItem";

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

      {/* Spotify-like playlists section - with scroll only for this section */}
      <div className="mt-auto flex-1 overflow-y-auto">
        <h3 className="text-sm font-medium text-neutral-400 mb-2 mt-6 uppercase tracking-wider">Playlists</h3>
        {/* Version label */}
        <nav className="space-y-1">
          {playlists.map((playlist) => (
            <PlaylistSidebarItem key={playlist.id} playlist={playlist} />
          ))}
        </nav>
      </div>
    </aside>
  );
}
