import { createContext, useContext, useEffect, useState } from "react";

/** Élément qui défile réellement (le `<main>` d'AppLayout). Indispensable comme `root` des
 *  IntersectionObserver : avec le viewport par défaut, un ancêtre `overflow: auto` DÉCOUPE la
 *  zone d'intersection — la marge de préchargement (`rootMargin`) n'avait alors aucun effet, et
 *  chaque pochette ne commençait à charger qu'au moment exact où elle devenait visible (d'où
 *  leur apparition une par une, en décalé, pendant le défilement). */
export const ScrollRootContext = createContext<HTMLElement | null>(null);

/** Visibilité partagée par une SECTION (carrousel, rangée) : toutes ses cartes se chargent
 *  ensemble dès que la section approche de l'écran, au lieu que chacune attende sa propre
 *  entrée — indispensable dans un carrousel horizontal, que son propre `overflow-x` découpe. */
export const SectionInViewContext = createContext<boolean | null>(null);

const supportsIntersectionObserver = typeof IntersectionObserver !== "undefined";

/** Détecte l'approche du viewport pour ne déclencher du travail coûteux (téléchargement +
 *  décodage d'une pochette, voir `useCoverArt`) qu'au besoin, au lieu de charger toutes les
 *  cartes montées d'une grille non virtualisée. `once` : un élément vu le reste.
 *  À l'intérieur d'une `SectionInViewContext`, c'est la visibilité de la section qui fait foi. */
export function useInViewport<T extends Element>(rootMargin = "600px"): [(el: T | null) => void, boolean] {
  // Ref callback (élément en état) plutôt qu'un useRef : l'observer se pose dès que l'élément
  // apparaît, même s'il est rendu conditionnellement après le premier rendu du composant.
  const [el, setEl] = useState<T | null>(null);
  const root = useContext(ScrollRootContext);
  const sectionInView = useContext(SectionInViewContext);
  // Navigateur sans IntersectionObserver : initialisé directement à `true` (jamais via un
  // `setState` dans l'effet) — dégrade vers un chargement non différé.
  const [inView, setInView] = useState(!supportsIntersectionObserver);

  useEffect(() => {
    if (sectionInView !== null || inView || !supportsIntersectionObserver || !el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true);
      },
      { root, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, inView, root, rootMargin, sectionInView]);

  return [setEl, sectionInView ?? inView];
}

/** Visibilité d'une section entière, avec une large marge verticale : ses pochettes sont
 *  prêtes AVANT d'arriver à l'écran, et apparaissent donc toutes en même temps. */
export function useSectionInView<T extends Element>(): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null);
  const root = useContext(ScrollRootContext);
  const [inView, setInView] = useState(!supportsIntersectionObserver);

  useEffect(() => {
    if (inView || !supportsIntersectionObserver || !el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true);
      },
      { root, rootMargin: "900px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, inView, root]);

  return [setEl, inView];
}
