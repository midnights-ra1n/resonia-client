import { useEffect } from "react";

/** Signale sur le PARENT d'un conteneur défilant s'il est calé au début / à la fin de son
 *  défilement (attributs `data-at-start` / `data-at-end`), pour n'afficher les dégradés de bord
 *  (`.edge-fade-start` / `.edge-fade-end`, voir index.css) que du côté où du contenu est
 *  réellement coupé. Ex : aucun fondu à gauche d'un carrousel tant qu'il n'a pas défilé, aucun en
 *  haut de page tant qu'on n'a pas scrollé.
 *
 *  Attributs posés directement sur le DOM : aucun re-render React. Une seule lecture de layout par
 *  frame au plus (requestAnimationFrame), et le DOM n'est touché que si l'état change réellement. */
export function useScrollEdges(el: HTMLElement | null, axis: "x" | "y"): void {
  useEffect(() => {
    const host = el?.parentElement;
    if (!el || !host) return;

    let frame: number | null = null;
    let atStart: boolean | null = null;
    let atEnd: boolean | null = null;

    const measure = () => {
      frame = null;
      const pos = axis === "x" ? el.scrollLeft : el.scrollTop;
      const max = axis === "x" ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
      // 1 px de tolérance : positions fractionnaires (zoom, écrans HiDPI).
      const start = pos <= 1;
      const end = pos >= max - 1;
      if (start !== atStart) {
        atStart = start;
        host.toggleAttribute("data-at-start", start);
      }
      if (end !== atEnd) {
        atEnd = end;
        host.toggleAttribute("data-at-end", end);
      }
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(measure);
    };

    measure();
    el.addEventListener("scroll", schedule, { passive: true });
    // Taille du conteneur ou de son contenu modifiée (fenêtre redimensionnée, données arrivées).
    const resize = new ResizeObserver(schedule);
    resize.observe(el);
    const mutations = new MutationObserver(schedule);
    mutations.observe(el, { childList: true });

    return () => {
      el.removeEventListener("scroll", schedule);
      resize.disconnect();
      mutations.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      host.removeAttribute("data-at-start");
      host.removeAttribute("data-at-end");
    };
  }, [el, axis]);
}
