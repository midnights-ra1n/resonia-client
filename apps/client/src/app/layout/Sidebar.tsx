import { ChartBar, Disc, Download, Folder, House, ListBullets, MusicNotes, Plus, Star } from "../../components/icons";
import { useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { usePlaylists } from "../../hooks/usePlaylists";
import { useScrollingClass } from "../../hooks/useScrollingClass";
import { useTranslation } from "../../lib/i18n";
import { CreatePlaylistModal } from "./CreatePlaylistModal";
import { PlaylistSidebarItem } from "./PlaylistSidebarItem";
import LogoFull from "../../assets/Logo_full.svg?react";

const navLinks = [
  { to: "/", icon: House, key: "nav.home" },
  { to: "/favorites", icon: Star, key: "nav.favorites" },
  { to: "/artists", icon: Disc, key: "nav.artists" },
  { to: "/tracks", icon: MusicNotes, key: "nav.tracks" },
  { to: "/genres", icon: ListBullets, key: "nav.genres" },
  { to: "/folders", icon: Folder, key: "nav.folders" },
  { to: "/downloads", icon: Download, key: "nav.downloads" },
  { to: "/stats", icon: ChartBar, key: "nav.stats" },
];

export function Sidebar() {
  const { t } = useTranslation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { playlists, refreshPlaylists } = usePlaylists();
  const handlePlaylistCreated = () => {
    refreshPlaylists();
  };
  const playlistsScrollRef = useRef<HTMLDivElement>(null);
  useScrollingClass(playlistsScrollRef);

  return (
    // Deux cartes flottantes empilées (marque + navigation, puis playlists) plutôt qu'un seul
    // bloc : la bibliothèque se lit comme un objet à part, à la manière de Spotify.
    <aside className="flex w-60 shrink-0 flex-col gap-3 min-h-0">
      <div className="flex shrink-0 flex-col gap-1 rounded-panel border border-white/5 bg-neutral-900 p-3 shadow-e2">
        {/* Logo complet (icône + nom), aligné à gauche sur les entrées de navigation. SVG
            intégré au bundle (svgr) : aucune requête, net à toute densité d'écran, et aucun
            chemin à résoudre sous Electron (`file://`). */}
        <div className="flex items-center px-2 pt-2 pb-3">
          <LogoFull role="img" aria-label="Resonia" className="h-8 w-auto" />
        </div>

        {/* Navigation links */}
        {navLinks.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-accent-soft text-accent" : "text-neutral-400 hover:bg-surface-2 hover:text-white"
              }`
            }
          >
            <Icon size={18} />
            {t(key)}
          </NavLink>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-panel border border-white/5 bg-neutral-900 p-3 shadow-e2">
        <div className="mb-2 mt-1 flex items-center justify-between">
          <h3 className="px-3 text-[11px] font-medium text-neutral-500 uppercase tracking-[0.12em]">Playlists</h3>
          <button
            onClick={() => setShowCreateModal(true)}
            className="text-neutral-400 transition hover:text-white"
            title="Créer une playlist"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Spotify-like playlists section - with scroll only for this section */}
        <div ref={playlistsScrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <nav className="space-y-1">
            {playlists.map((playlist) => (
              <PlaylistSidebarItem key={playlist.id} playlist={playlist} onChanged={refreshPlaylists} />
            ))}
          </nav>
        </div>
      </div>
      {showCreateModal && (
        <CreatePlaylistModal onClose={() => setShowCreateModal(false)} onCreated={handlePlaylistCreated} />
      )}
    </aside>
  );
}
