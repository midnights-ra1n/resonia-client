import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { PlayerBar } from "../../features/player/PlayerBar";
import { QueuePanel } from "../../features/player/QueuePanel";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useTranslation } from "../../lib/i18n";
import { Sidebar } from "./Sidebar";

const MIN_QUERY_LENGTH = 2;

export function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get("q") ?? "");
  const debouncedQuery = useDebouncedValue(query, 300);

  // Synchronise le champ avec le paramètre "q" quand l'utilisateur arrive sur /search
  // par un autre chemin que la saisie (lien, navigation retour...).
  useEffect(() => {
    if (location.pathname !== "/search") return;
    setQuery(new URLSearchParams(location.search).get("q") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Recherche "live" façon Spotify : dès 2 caractères, l'URL /search est mise à jour
  // sans attendre la soumission du formulaire, sans empiler l'historique.
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length >= MIN_QUERY_LENGTH) {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

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
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="sticky top-0 z-10 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800">
          <form onSubmit={handleSubmit} className="flex items-center justify-center px-4 py-3 gap-2">
            {/* Boutons navigation à gauche de la barre de recherche */}
            <div className="flex items-center gap-1 pr-2">
              <button onClick={handleGoBack} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition" title="Aller à la page précédente">
                <ArrowLeft size={16} />
              </button>
              <button onClick={handleGoForward} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition" title="Aller à la page suivante">
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

        <main className="flex-1 min-h-0 overflow-y-auto">
          <Outlet />
        </main>
        <PlayerBar />
      </div>
      <QueuePanel />
    </div>
  );
}