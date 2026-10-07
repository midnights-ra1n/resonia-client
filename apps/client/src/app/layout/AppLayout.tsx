import { ArrowLeft, ArrowRight, WifiSlash } from "../../components/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AccountMenu } from "../../features/account/AccountMenu";
import { DownloadsIndicator } from "../../features/downloads/DownloadsIndicator";
import { UpdateIndicator } from "./UpdateIndicator";
import { LyricsView } from "../../features/lyrics/LyricsView";
import { PlayerBar } from "../../features/player/PlayerBar";
import { QueuePanel } from "../../features/player/QueuePanel";
import { DebugPanel } from "../../features/player/debug/DebugPanel";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { ScrollRootContext } from "../../hooks/useInViewport";
import { useScrollingClass } from "../../hooks/useScrollingClass";
import { useTranslation } from "../../lib/i18n";
import { useOnlineStore } from "../../lib/network/onlineStatus";
import { useFavoritesStore } from "../../stores/favoritesStore";
import { usePlayerStore } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { PageTransition } from "./PageTransition";
import { useScrollEdges } from "../../hooks/useScrollEdges";
import { Sidebar } from "./Sidebar";

const MIN_QUERY_LENGTH = 2;

// Champs/éléments dans lesquels la barre d'espace doit garder son sens normal (saisir un
// espace) plutôt que de basculer play/pause : la recherche, mais aussi tout champ texte ou
// élément interactif natif (inputs des modales, textarea, boutons focus, éléments édition).
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState(
    () => new URLSearchParams(location.search).get("q") ?? "",
  );
  const debouncedQuery = useDebouncedValue(query, 300);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const showLyrics = usePlayerStore((s) => s.showLyrics);
  const showQueue = usePlayerStore((s) => s.showQueue);
  // La file d'attente reste affichable par-dessus la vue paroles (seule la sidebar se replie).
  const queueOpen = showQueue;
  // Paroles : fondu d'entrée à l'ouverture, fondu de sortie à la fermeture (la vue reste montée
  // jusqu'à la fin du fondu, pendant que sidebar et file d'attente se redéploient).
  const [lyricsMounted, setLyricsMounted] = useState(showLyrics);
  if (showLyrics && !lyricsMounted) setLyricsMounted(true);
  const lyricsLeaving = lyricsMounted && !showLyrics;
  const lyricsLayout = showLyrics || lyricsLeaving;
  const finishLyricsExit = (e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && lyricsLeaving) setLyricsMounted(false);
  };
  // Repli si `animationend` ne se déclenche pas (fenêtre masquée : animations suspendues).
  useEffect(() => {
    if (!lyricsLeaving) return;
    const timer = window.setTimeout(() => setLyricsMounted(false), 400);
    return () => window.clearTimeout(timer);
  }, [lyricsLeaving]);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const loadFavorites = useFavoritesStore((s) => s.load);
  const mainRef = useRef<HTMLElement>(null);
  useScrollingClass(mainRef);
  // Le conteneur qui défile, exposé aux IntersectionObserver des pochettes (voir
  // ScrollRootContext). Ref callback STABLE (useCallback) : appelée au montage/démontage
  // seulement, jamais à chaque rendu.
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  useScrollEdges(scrollRoot, "y");
  const setMainRef = useCallback((el: HTMLElement | null) => {
    mainRef.current = el;
    setScrollRoot(el);
  }, []);
  const isOnline = useOnlineStore((s) => s.isOnline);

  useEffect(() => {
    if (activeServerId) loadFavorites();
  }, [activeServerId, loadFavorites]);

  // Espace = play/pause partout dans l'app, sauf pendant une saisie (recherche, modales,
  // champs de formulaire...) où l'espace doit rester un espace normal.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      togglePlay();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay]);

  // Changement de page (lien du lecteur, menu du compte, précédent/suivant...) : la vue paroles
  // se ferme pour laisser voir la page demandée. `location.key` change à chaque navigation,
  // même vers la même URL ; le premier passage (montage) est ignoré.
  const lastLocationKey = useRef(location.key);
  useEffect(() => {
    if (lastLocationKey.current === location.key) return;
    lastLocationKey.current = location.key;
    if (usePlayerStore.getState().showLyrics) usePlayerStore.setState({ showLyrics: false });
  }, [location.key]);

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

  // Saisie dans la recherche : on quitte la vue paroles pour laisser place aux résultats. Le
  // champ reste monté (en-tête commun), le focus et la frappe ne sont donc pas interrompus.
  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (value.trim().length > 0 && usePlayerStore.getState().showLyrics) {
      usePlayerStore.setState({ showLyrics: false });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      if (usePlayerStore.getState().showLyrics) usePlayerStore.setState({ showLyrics: false });
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
    // Cartes flottantes sur fond `bg-sunken`, séparées par 12px : sidebar (2 cartes), contenu,
    // file d'attente (si ouverte). La barre de lecture ne prend AUCUNE place dans la mise en
    // page : elle flotte par-dessus le bas de la colonne de contenu, qui défile dessous (le
    // `pb` de <main> garantit que la dernière ligne reste atteignable au-dessus d'elle).
    // `overflow-hidden` + `isolate` sur le panneau de contenu : le rayon découpe le scroll, et
    // le panneau forme son propre contexte d'empilement (aucun z-index de page ne déborde).
    <div className="flex h-screen bg-bg-sunken p-3">
      {/* Sidebar et file d'attente REPLIÉES (largeur animée) plutôt que démontées à l'ouverture
          des paroles : la colonne de contenu — et le lecteur flottant qui y est ancré —
          s'élargit en douceur au lieu de sauter. Marges plutôt que `gap` : elles s'animent
          avec la largeur, sans laisser d'espace fantôme une fois replié. `inert` : contenu
          replié hors du parcours clavier/lecteur d'écran. */}
      <div
        inert={showLyrics}
        className={`flex min-h-0 shrink-0 overflow-hidden transition-[width,margin-right,opacity] duration-[320ms] ${
          showLyrics ? "mr-0 w-0 opacity-0" : "mr-3 w-60 opacity-100"
        }`}
      >
        <Sidebar />
      </div>
      <div className="relative flex flex-1 min-w-0 min-h-0">
        <div className="relative isolate flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden rounded-panel border border-white/5 bg-neutral-900 shadow-e2">
          <header className="z-10 shrink-0">
            {!isOnline && (
              <div className="flex items-center justify-center gap-2 bg-amber-500/10 px-4 py-1.5 text-xs font-medium text-amber-400">
                <WifiSlash size={14} />
                {t("common.offline")}
              </div>
            )}
            <form
              onSubmit={handleSubmit}
              className="grid grid-cols-[auto_1fr_auto] items-center px-4 pt-4 pb-2 gap-2"
            >
              {/* Boutons navigation à gauche de la barre de recherche */}
              <div className="flex items-center gap-2 pr-2">
                <button
                  onClick={handleGoBack}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-neutral-400 shadow-e1 hover:bg-surface-3 hover:text-white transition-colors"
                  title="Aller à la page précédente"
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  onClick={handleGoForward}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-neutral-400 shadow-e1 hover:bg-surface-3 hover:text-white transition-colors"
                  title="Aller à la page suivante"
                >
                  <ArrowRight size={16} />
                </button>
              </div>

              <div className="relative mx-auto w-full max-w-xl">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder={t("search.placeholder")}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  className="h-10 w-full rounded-full bg-surface-2 border border-white/5 px-5 text-sm text-white placeholder-neutral-500 shadow-e1 hover:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-[border-color,box-shadow]"
                />
              </div>

              {/* Indicateur de téléchargements en cours, mise à jour (téléchargement en cours ou bouton de
                  redémarrage une fois prête) et bulle du compte
                  (serveurs, paramètres, déconnexion), à droite */}
              <div className="flex items-center justify-end gap-2 pl-2">
                <UpdateIndicator />
                <DownloadsIndicator />
                <AccountMenu />
              </div>
            </form>
          </header>

          {lyricsLayout ? (
            <div
              className={`flex flex-1 min-h-0 flex-col ${lyricsLeaving ? "pointer-events-none animate-fade-out" : "animate-fade-in"}`}
              onAnimationEnd={finishLyricsExit}
            >
              <LyricsView />
            </div>
          ) : (
            <div className="relative flex flex-1 min-h-0 flex-col">
              {/* Dégradé du haut : le contenu qui défile s'estompe sous l'en-tête au lieu d'y être
                  coupé net. Visible seulement une fois la page défilée (voir useScrollEdges). */}
              <div
                aria-hidden
                className="edge-fade-start inset-x-0 top-0 h-10 bg-gradient-to-b from-neutral-900 via-neutral-900/60 to-transparent"
              />
              <main ref={setMainRef} className="flex-1 min-h-0 overflow-y-auto pb-[104px]">
                <ScrollRootContext.Provider value={scrollRoot}>
                  <PageTransition scrollRoot={scrollRoot} />
                </ScrollRootContext.Provider>
              </main>
            </div>
          )}

          {/* Léger dégradé sombre sous le lecteur flottant : le contenu qui défile dessous s'y
              estompe au lieu d'être coupé net. Calque statique (aucune animation ni filtre),
              découpé par le rayon du panneau ; sous le lecteur (z-30), au-dessus du contenu. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-36 bg-gradient-to-t from-black/60 via-black/25 to-transparent"
          />
        </div>

        {/* Lecteur flottant : `pointer-events-none` sur le calque pleine largeur pour que les
            clics passent au contenu sur les côtés, réactivés sur la barre elle-même. */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex justify-center">
          {/* Largeur proportionnelle à la colonne de contenu (96 %) plutôt que plafonnée à une
              valeur fixe : le lecteur suit la taille de l'écran tout en gardant toujours une marge
              visible sur les côtés, pour l'effet flottant. Plafond large pour les très grands écrans. */}
          <div className="pointer-events-auto w-[min(96%,1760px)]">
            <PlayerBar />
          </div>
        </div>
      </div>
      <div
        inert={!queueOpen}
        className={`flex min-h-0 shrink-0 overflow-hidden transition-[width,margin-left,opacity] duration-[320ms] ${
          queueOpen ? "ml-3 w-80 opacity-100" : "ml-0 w-0 opacity-0"
        }`}
      >
        <QueuePanel />
      </div>
      <DebugPanel />
    </div>
  );
}
