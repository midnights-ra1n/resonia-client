import { useEffect, useRef, useState } from "react";

/** Détecte l'entrée dans le viewport (marge de préchargement configurable) pour ne déclencher
 *  du travail coûteux — ici, le téléchargement + mise en cache d'une pochette (voir
 *  `useCoverArt`) — qu'une fois l'élément réellement sur le point d'être visible, au lieu
 *  d'agir sur TOUS les éléments montés (grilles/carrousels non virtualisés : recherche, page
 *  d'accueil). Sans ce filtre, des dizaines de pochettes hors écran sont téléchargées et
 *  décodées en même temps que celles visibles, saturant la file réseau/décodage et retardant
 *  d'autant les pochettes réellement à l'écran — la cause des chargements de plusieurs
 *  secondes observés dans la recherche. `once: true` (comportement par défaut et unique ici) :
 *  une carte de grille ne redevient jamais utile à ré-observer après son premier affichage. */
const supportsIntersectionObserver = typeof IntersectionObserver !== "undefined";

export function useInViewport<T extends Element>(rootMargin = "400px"): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  // Navigateur sans IntersectionObserver : initialisé directement à `true` (jamais via un
  // `setState` dans l'effet, qui déclencherait un rendu en cascade évitable) — dégrade vers un
  // chargement non différé plutôt que de ne jamais charger la pochette.
  const [inView, setInView] = useState(!supportsIntersectionObserver);

  useEffect(() => {
    if (inView || !supportsIntersectionObserver) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true);
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView];
}
