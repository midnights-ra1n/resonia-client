import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { PlayerBar } from "../../features/player/PlayerBar";
import { QueuePanel } from "../../features/player/QueuePanel";
import { useTranslation } from "../../lib/i18n";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleGoBack = () => {
    navigate(location.state?.back ?? -1);
  };

  const handleGoForward = () => {
    navigate(location.state?.forward ?? 1);
  };

  return (
    <div className="flex h-screen bg-neutral-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-10 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800">
          <form onSubmit={handleSubmit} className="flex items-center justify-center px-4 py-3 gap-2">
            {/* Boutons navigation à gauche de la barre de recherche */}
            <div className="flex items-center gap-1 pr-2">
              <button onClick={handleGoBack} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition" title="Aller à la page précédente">
                <ArrowLeft size={16} />
              </button>
              <button onClick={handleGoForward} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition" title="Aller à la page suivante">
                <ArrowRight size={16} />
              </button>
            </div>
            
            <div className="relative w-full max-w-xl">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search.placeholder")}
                className="w-full rounded-full bg-neutral-900 border border-neutral-700 px-5 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
            </div>
          </form>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <PlayerBar />
      </div>
      <QueuePanel />
    </div>
  );
}