/** Petit égaliseur animé, repère du morceau en cours de lecture. L'animation ne touche que
 *  `transform` (voir `.eq-bar` dans index.css) : recomposition GPU, pas de mise en page. */
export function PlayingBars({ size = 14, className = "text-accent" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor" aria-hidden="true" className={className}>
      {[1, 5.5, 10].map((x, i) => (
        <rect key={x} className="eq-bar" x={x} y={0} width={3} height={14} rx={1} style={{ animationDelay: `${-i * 0.35}s` }} />
      ))}
    </svg>
  );
}
