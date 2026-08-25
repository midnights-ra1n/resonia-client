import { useEffect } from "react";

const SCROLLING_CLASS = "is-scrolling";
const SETTLE_MS = 150;

/** WebKit ré-évalue `:hover` en continu pendant un scroll : le curseur reste immobile à
 *  l'écran mais le contenu défile dessous, donc chaque carte (album, playlist, piste...) qui
 *  passe sous le pointeur déclenche un mouseenter/mouseleave — et donc sa transition CSS
 *  (fond, opacité, transform), soit un repaint/recomposite par carte traversée. C'est ce qui
 *  fait grimper le CPU pendant le scroll sur n'importe quelle page à grille/liste, même courte.
 *
 *  Le correctif standard : couper `pointer-events` sur le conteneur pendant le scroll (donc
 *  plus aucun hover ne peut matcher sur ses enfants, `pointer-events` étant hérité) et le
 *  restaurer ~150ms après la fin du scroll. Le coût du listener de scroll lui-même (juste un
 *  toggle de classe + reset d'un minuteur, sans lecture de layout) est très inférieur à la
 *  tempête de transitions qu'il évite. */
export function useScrollingClass(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    function handleScroll() {
      if (!el) return;
      if (settleTimer === null) el.classList.add(SCROLLING_CLASS);
      else clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        el?.classList.remove(SCROLLING_CLASS);
        settleTimer = null;
      }, SETTLE_MS);
    }

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (settleTimer !== null) clearTimeout(settleTimer);
      el.classList.remove(SCROLLING_CLASS);
    };
  }, [ref]);
}
