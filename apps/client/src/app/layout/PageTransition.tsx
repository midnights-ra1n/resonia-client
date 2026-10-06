import { useEffect, useLayoutEffect, useRef, useState, type AnimationEvent } from "react";
import { useLocation, useOutlet } from "react-router-dom";

// Durée de l'animation `page-out` (index.css) + marge : filet de sécurité si `animationend`
// ne se déclenche pas (onglet en arrière-plan, animation interrompue).
const EXIT_FALLBACK_MS = 260;

/** Fondu de sortie puis fondu d'entrée à chaque changement de page.
 *
 *  À la navigation, l'ANCIENNE page reste affichée le temps de s'estomper : l'élément conservé
 *  est celui renvoyé par `useOutlet()` au rendu précédent, qui embarque son propre contexte de
 *  route (paramètres figés) — l'ancienne page continue donc d'afficher SON contenu (pas celui
 *  de la nouvelle route) pendant qu'elle disparaît, et garde son état (même clé). Une fois le
 *  fondu terminé, la nouvelle page est montée avec le fondu d'entrée et le défilement revient
 *  en haut. Clé = chemin uniquement : la recherche live (query seule) ne rejoue rien.
 *  Opacity/transform uniquement : composition GPU, aucun recalcul de mise en page. */
export function PageTransition({ scrollRoot }: { scrollRoot: HTMLElement | null }) {
  const location = useLocation();
  const outlet = useOutlet();
  const [shownPath, setShownPath] = useState(location.pathname);
  const leaving = shownPath !== location.pathname;

  // Dernier contenu affiché AVANT la navigation : mis à jour après chaque rendu stable.
  const previousOutlet = useRef(outlet);
  useEffect(() => {
    if (!leaving) previousOutlet.current = outlet;
  });

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setShownPath(location.pathname), EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, location.pathname]);

  // Nouvelle page : repart du haut (avant peinture, pas de saut visible).
  useLayoutEffect(() => {
    scrollRoot?.scrollTo({ top: 0 });
  }, [shownPath, scrollRoot]);

  function handleAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    // Ignore les animations des enfants (modales, squelettes...) qui remontent jusqu'ici.
    if (e.target === e.currentTarget && leaving) setShownPath(location.pathname);
  }

  return (
    <div
      key={shownPath}
      className={leaving ? "pointer-events-none animate-page-out" : "animate-page-in"}
      onAnimationEnd={handleAnimationEnd}
    >
      {/* eslint-disable-next-line react-hooks/refs -- lecture voulue : contenu figé de la page sortante */}
      {leaving ? previousOutlet.current : outlet}
    </div>
  );
}
