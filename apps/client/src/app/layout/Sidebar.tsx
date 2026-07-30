import { BarChart3, Disc, Download, Folder, Home, LayoutList, Library, Music, Plus, Settings, Star } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "../../lib/i18n";

const links = [
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

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-1 bg-neutral-950 p-4">

      <div className="flex justify-center items-center gap-4 py-4">
        <img src="/favicon.svg" alt="Description" className="w-16" />
      </div>
      {links.map(({ to, icon: Icon, key }) => (
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

      <div className="mt-4">
        <div className="flex items-center gap-1">
          <NavLink
            to="/playlists"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
              }`
            }
          >
            <Library size={18} />
            {t("nav.playlists")}
          </NavLink>
          <button
            className="flex items-center rounded-lg px-2 py-2 text-sm font-medium text-neutral-400 hover:bg-neutral-900 hover:text-white transition"
            onClick={() => { }}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}
