import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const PAUSE_MS = 3000;
const MIN_SCROLL_DURATION_S = 3;
const MAX_SCROLL_DURATION_S = 15;
const PIXELS_PER_SECOND = 30;
// Tolérance anti-scintillement : évite de considérer le texte comme débordant sur un
// écart de mesure de quelques pixels (sous-pixel/arrondi) plutôt qu'un réel dépassement.
const OVERFLOW_TOLERANCE_PX = 2;

interface MarqueeTextProps {
  text: string;
  /** Si fourni, le texte devient un lien de navigation (react-router). */
  to?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** Désactive le drag natif du navigateur sur le lien (les <a> sont draggables par
   *  défaut) — nécessaire quand ce texte vit dans une ligne glissable au drag-and-drop
   *  HTML5 : sans ça, un drag démarré sur ce texte est capté par le navigateur au lieu de
   *  déclencher le onDragStart du conteneur parent. */
  draggable?: boolean;
}

/** Texte tronqué par défaut ; si (et seulement si) il déborde réellement de son conteneur,
 *  défile automatiquement en boucle : pause de 3s, glissement lent vers la gauche jusqu'à
 *  révéler la fin du texte, pause de 3s, puis retour vers la droite jusqu'au début — et ainsi
 *  de suite. La zone cliquable/survolable reste toujours limitée à la largeur réelle du texte
 *  affiché (jamais visuellement coupée), jamais à celle du conteneur parent. */
export function MarqueeText({ text, to, className = "", onClick, draggable }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);
  const [scrolledLeft, setScrolledLeft] = useState(false);
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Mesure le débordement réel (largeur du texte non tronqué - largeur du conteneur).
  useEffect(() => {
    function measure() {
      if (!containerRef.current || !measureRef.current) return;
      const textWidth = measureRef.current.scrollWidth;
      const distance = textWidth - containerRef.current.clientWidth;
      setOverflowDistance(distance > OVERFLOW_TOLERANCE_PX ? distance : 0);
    }

    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [text]);

  const overflowing = overflowDistance > 0;
  const scrollDurationS = Math.min(
    MAX_SCROLL_DURATION_S,
    Math.max(MIN_SCROLL_DURATION_S, overflowDistance / PIXELS_PER_SECOND),
  );

  // Démarre (ou redémarre, si le texte change) le cycle pause -> défilement dès qu'un
  // débordement réel est détecté.
  useEffect(() => {
    setScrolledLeft(false);
    clearTimeout(cycleTimerRef.current);
    if (!overflowing) return;

    cycleTimerRef.current = setTimeout(() => setScrolledLeft(true), PAUSE_MS);
    return () => clearTimeout(cycleTimerRef.current);
  }, [overflowing, text]);

  function handleTransitionEnd(e: React.TransitionEvent) {
    if (e.propertyName !== "transform") return;
    clearTimeout(cycleTimerRef.current);
    cycleTimerRef.current = setTimeout(() => setScrolledLeft((prev) => !prev), PAUSE_MS);
  }

  const tagStyle: React.CSSProperties = {
    transform: scrolledLeft ? `translateX(-${overflowDistance}px)` : "translateX(0)",
    transitionProperty: "transform",
    transitionDuration: `${scrollDurationS}s`,
    transitionTimingFunction: "linear",
  };
  const tagClassName = `inline-block whitespace-nowrap align-top ${overflowing ? "" : "max-w-full truncate"} ${className}`;

  return (
    <div ref={containerRef} className="relative overflow-hidden">
      {/* Élément invisible servant uniquement à mesurer la largeur réelle (jamais tronquée) du texte. */}
      <span ref={measureRef} className="invisible absolute whitespace-nowrap">
        {text}
      </span>

      {to ? (
        <Link
          to={to}
          onClick={onClick}
          onTransitionEnd={handleTransitionEnd}
          className={tagClassName}
          style={tagStyle}
          draggable={draggable}
        >
          {text}
        </Link>
      ) : (
        <span onClick={onClick} onTransitionEnd={handleTransitionEnd} className={tagClassName} style={tagStyle}>
          {text}
        </span>
      )}
    </div>
  );
}
