import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";

const PAUSE_MS = 3000;
// Délai avant le premier défilement au survol (évite de lancer l'animation à chaque simple
// passage de la souris sur une liste).
const HOVER_START_DELAY_MS = 500;
const MIN_SCROLL_DURATION_S = 3;
const MAX_SCROLL_DURATION_S = 15;
const PIXELS_PER_SECOND = 30;
// Tolérance anti-scintillement : évite de considérer le texte comme débordant sur un
// écart de mesure de quelques pixels (sous-pixel/arrondi) plutôt qu'un réel dépassement.
const OVERFLOW_TOLERANCE_PX = 2;
// Largeur du dégradé de fin de texte (masque CSS) quand le texte déborde.
const FADE_PX = 28;

// Mode `auto` : un SEUL IntersectionObserver partagé par toutes les instances. Racine =
// viewport : un ancêtre qui défile découpe l'intersection, ce qui est voulu (seul le texte
// réellement visible anime).
const visibilityCallbacks = new Map<Element, (visible: boolean) => void>();
let sharedObserver: IntersectionObserver | null = null;

function observeVisibility(el: Element, cb: (visible: boolean) => void): () => void {
  if (typeof IntersectionObserver === "undefined") {
    cb(true);
    return () => {};
  }
  sharedObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) visibilityCallbacks.get(entry.target)?.(entry.isIntersecting);
  });
  visibilityCallbacks.set(el, cb);
  sharedObserver.observe(el);
  return () => {
    visibilityCallbacks.delete(el);
    sharedObserver?.unobserve(el);
  };
}

function subscribeDocumentVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

interface MarqueeTextProps {
  text: string;
  /** Défilement automatique (titres importants : en-têtes de page, barre de lecture), tant que
   *  le texte est visible et la fenêtre au premier plan. Sans : défilement au survol seulement
   *  (lignes de listes — des dizaines d'animations permanentes sinon). */
  auto?: boolean;
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

/** Texte coupé par un léger dégradé ; si (et seulement si) il déborde réellement de son
 *  conteneur ET qu'il est survolé (ou en mode `auto`, visible), défile en boucle : court délai, glissement lent vers la gauche jusqu'à
 *  révéler la fin du texte, pause de 3s, puis retour vers la droite jusqu'au début — et ainsi
 *  de suite. La zone cliquable/survolable reste toujours limitée à la largeur réelle du texte
 *  affiché (jamais visuellement coupée), jamais à celle du conteneur parent. */
export function MarqueeText({ text, to, className = "", onClick, draggable, auto = false }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);
  const [scrolledLeft, setScrolledLeft] = useState(false);
  // Le texte est-il revenu à sa position de départ ? Faux dès la fin de l'aller et pendant tout
  // le retour : le dégradé de gauche reste affiché tant que le début du texte est hors cadre.
  const [atOrigin, setAtOrigin] = useState(true);
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Par défaut, défilement au survol seulement : un défilement automatique de CHAQUE titre trop
  // long (des dizaines sur l'accueil) gardait le compositeur actif en permanence — mesuré :
  // ~2-3 points de CPU au repos. Le mode `auto`, réservé à quelques titres importants, ne tourne
  // que si le texte est à l'écran et la fenêtre au premier plan.
  const [hovered, setHovered] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const pageVisible = useSyncExternalStore(subscribeDocumentVisibility, () => !document.hidden, () => true);

  useEffect(() => {
    const el = containerRef.current;
    if (!auto || !el) return;
    return observeVisibility(el, setOnScreen);
  }, [auto]);

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
  const shouldAnimate = overflowing && (hovered || (auto && onScreen && pageVisible));
  const scrollDurationS = Math.min(
    MAX_SCROLL_DURATION_S,
    Math.max(MIN_SCROLL_DURATION_S, overflowDistance / PIXELS_PER_SECOND),
  );

  // Démarre (ou redémarre, si le texte change) le cycle pause -> défilement dès qu'un
  // débordement réel est détecté.
  useEffect(() => {
    setScrolledLeft(false);
    clearTimeout(cycleTimerRef.current);
    if (!shouldAnimate) return;

    cycleTimerRef.current = setTimeout(() => setScrolledLeft(true), auto ? PAUSE_MS : HOVER_START_DELAY_MS);
    return () => clearTimeout(cycleTimerRef.current);
  }, [shouldAnimate, text, auto]);

  function handleTransitionEnd(e: React.TransitionEvent) {
    if (e.propertyName !== "transform") return;
    clearTimeout(cycleTimerRef.current);
    setAtOrigin(!scrolledLeft);
    if (!shouldAnimate) return;
    cycleTimerRef.current = setTimeout(() => setScrolledLeft((prev) => !prev), PAUSE_MS);
  }

  const tagStyle: React.CSSProperties = {
    // FADE_PX de plus : en fin de course, la dernière lettre s'arrête AVANT le dégradé de droite.
    transform: scrolledLeft ? `translateX(-${overflowDistance + FADE_PX}px)` : "translateX(0)",
    transitionProperty: "transform",
    // Retour rapide et doux au début quand le survol cesse, au lieu de refaire tout le trajet
    // à vitesse de lecture.
    transitionDuration: shouldAnimate ? `${scrollDurationS}s` : "300ms",
    transitionTimingFunction: shouldAnimate ? "linear" : "var(--ease-out)",
  };
  // Dégradé (masque, aucun coût par image) : à droite dès que le texte déborde, et aussi au
  // début pendant tout le défilement — aller, pause en fin de course ET retour — tant que le
  // début du texte n'est pas revenu à sa place.
  const mask = !overflowing
    ? undefined
    : scrolledLeft || !atOrigin
      ? `linear-gradient(to right, transparent, #000 ${FADE_PX}px, #000 calc(100% - ${FADE_PX}px), transparent)`
      : `linear-gradient(to right, #000 calc(100% - ${FADE_PX}px), transparent)`;
  const containerStyle: React.CSSProperties | undefined = mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined;

  const tagClassName = `inline-block whitespace-nowrap align-top ${overflowing ? "" : "max-w-full truncate"} ${className}`;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={containerStyle}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* Élément invisible servant uniquement à mesurer la largeur réelle (jamais tronquée) du
          texte — doit reprendre `className` (taille/graisse de police...) sinon la mesure ne
          correspond pas au rendu réel et peut déclencher un défilement à tort. */}
      <span ref={measureRef} className={`invisible absolute whitespace-nowrap ${className}`}>
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
