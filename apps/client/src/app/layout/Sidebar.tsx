import { BarChart3, Download, Home, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "../../lib/i18n";

const links = [
  { to: "/", icon: Home, key: "nav.home" },
  { to: "/stats", icon: BarChart3, key: "nav.stats" },
  { to: "/downloads", icon: Download, key: "nav.downloads" },
  { to: "/settings", icon: Settings, key: "nav.settings" },
];

export function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-1 bg-neutral-950 p-4">
      <div className="mb-6 px-2 text-xl font-bold text-white">{t("common.appName")}</div>
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
    </aside>
  );
}
