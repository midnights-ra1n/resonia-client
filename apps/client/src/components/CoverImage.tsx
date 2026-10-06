import type { ImgHTMLAttributes, SyntheticEvent } from "react";

/** `<img>` de pochette qui apparaît en fondu une fois l'image réellement DÉCODÉE, au lieu de
 *  se peindre brutalement (voire par bandes) au fil du défilement. L'état « chargé » est posé
 *  directement sur le DOM (`data-loaded`, voir `.cover-img` dans index.css) : aucun re-render
 *  React, coût nul même sur des grilles de centaines de pochettes. */
/** Image déjà en mémoire (pochette réaffichée en revenant sur une page, voir useCoverArt) :
 *  `complete` est vrai dès l'insertion — on la montre aussitôt, avant le premier paint, plutôt
 *  que de rejouer le fondu qui donnait l'impression d'un rechargement. */
function revealIfReady(img: HTMLImageElement | null) {
  if (img?.complete && img.naturalWidth > 0) img.setAttribute("data-loaded", "");
}

export function CoverImage({ className = "", onLoad, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  function handleLoad(e: SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const reveal = () => img.setAttribute("data-loaded", "");
    // `decode()` attend que l'image soit prête à peindre sans à-coup ; repli immédiat si le
    // moteur ne le supporte pas ou rejette (image déjà décodée, élément détaché).
    if (typeof img.decode === "function") img.decode().then(reveal, reveal);
    else reveal();
    onLoad?.(e);
  }

  return (
    <img {...props} ref={revealIfReady} decoding="async" className={`cover-img ${className}`} onLoad={handleLoad} />
  );
}
