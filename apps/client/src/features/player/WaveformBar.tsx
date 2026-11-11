import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { Waveform } from "../../lib/audio/waveform/waveform";
import type { WaveformStyle } from "../../stores/settingsStore";

// Largeur d'une colonne et espace entre deux, en pixels CSS : rendu « barres » des vues
// d'ensemble DJ, lisible même sur une barre étroite.
const BAR_WIDTH = 2;
const BAR_GAP = 1;

/** Plage de la barre [début, fin], en % de sa largeur. */
export type PercentRange = [from: number, to: number];

/** Dessine la forme d'onde symétrique en blanc, en trois couches d'opacité croissante : amplitude
 *  totale, puis médiums + aigus, puis aigus — même lecture que l'aperçu 3 bandes des logiciels DJ.
 *  Sert de masque : la teinte vient de la couleur de fond de chaque couche (voir WaveformBar). */
function draw(canvas: HTMLCanvasElement, waveform: Waveform, style: WaveformStyle, width: number, height: number): boolean {
  if (width === 0 || height === 0) return false;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#fff";

  const columns = Math.max(1, Math.floor(width / (BAR_WIDTH + BAR_GAP)));
  const middle = height / 2;
  const full = (i: number) => Math.max(waveform.low[i], waveform.mid[i], waveform.high[i]);
  const layers: Array<{ alpha: number; value: (i: number) => number }> =
    style === "simple"
      ? [{ alpha: 1, value: full }]
      : [
          { alpha: 0.35, value: full },
          { alpha: 0.65, value: (i) => Math.max(waveform.mid[i], waveform.high[i]) },
          { alpha: 1, value: (i) => waveform.high[i] },
        ];
  for (const layer of layers) {
    ctx.globalAlpha = layer.alpha;
    for (let c = 0; c < columns; c++) {
      // Crête sur la plage de colonnes de la forme d'onde couverte par cette barre.
      const from = Math.floor((c * waveform.bins) / columns);
      const to = Math.max(from + 1, Math.floor(((c + 1) * waveform.bins) / columns));
      let peak = 0;
      for (let i = from; i < to; i++) peak = Math.max(peak, layer.value(i));
      const half = Math.max(0.5, (peak / 255) * middle);
      ctx.fillRect(c * (BAR_WIDTH + BAR_GAP), middle - half, BAR_WIDTH, half * 2);
    }
  }
  return true;
}

/** Fenêtre [from, to] (%) sur un contenu pleine largeur, par trois `transform` imbriqués : bord
 *  gauche coupé à `from`, bord droit à `to`, contenu ramené à sa place. Déplacer la fenêtre (tick de
 *  lecture, tampon qui grandit) ne provoque ni mise en page ni redessin, seulement une recomposition. */
export function RangeWindow({ from, to, children }: { from: number; to: number; children: ReactNode }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ transform: `translateX(${from}%)` }}>
      <div className="absolute inset-0 overflow-hidden" style={{ transform: `translateX(${to - 100 - from}%)` }}>
        <div className="absolute inset-0" style={{ transform: `translateX(${100 - to}%)` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Une fenêtre par plage, sur le même contenu. */
export function Ranges({ ranges, children }: { ranges: readonly PercentRange[]; children: ReactNode }) {
  return ranges.map(([from, to], i) => (
    <RangeWindow key={i} from={from} to={to}>
      {children}
    </RangeWindow>
  ));
}

// Repli transparent : rien ne s'affiche avant le premier dessin (sinon des rectangles pleins).
const MASK = "var(--waveform, linear-gradient(transparent, transparent))";
const MASK_STYLE: CSSProperties = {
  maskImage: MASK,
  WebkitMaskImage: MASK,
  maskSize: "100% 100%",
  WebkitMaskSize: "100% 100%",
};

/** Barre de progression en forme d'onde, en trois teintes comme la barre de YouTube : piste entière
 *  (sombre), plages chargées (gris clair), plages écoutées (blanc, accent au survol de la barre, comme Spotify). La forme d'onde n'est dessinée
 *  qu'une fois (et au redimensionnement) en image de masque partagée par toutes les couches : ni la
 *  lecture, ni le tampon, ni un changement de thème ne la redessinent. */
export function WaveformBar({
  waveform,
  style,
  played,
  buffered,
  pulsing,
}: {
  waveform: Waveform;
  style: WaveformStyle;
  played: readonly PercentRange[];
  buffered: readonly PercentRange[];
  pulsing: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const canvas = document.createElement("canvas");
    const redraw = () => {
      if (draw(canvas, waveform, style, root.clientWidth, root.clientHeight)) {
        root.style.setProperty("--waveform", `url(${canvas.toDataURL()})`);
      }
    };
    redraw();
    const resize = new ResizeObserver(redraw);
    resize.observe(root);
    return () => resize.disconnect();
  }, [waveform, style]);

  return (
    <div ref={rootRef} className={`absolute inset-0 ${pulsing ? "animate-pulse" : ""}`}>
      <div className="absolute inset-0 bg-neutral-700" style={MASK_STYLE} />
      <Ranges ranges={buffered}>
        <div className="absolute inset-0 bg-neutral-500" style={MASK_STYLE} />
      </Ranges>
      <Ranges ranges={played}>
        <div className="absolute inset-0 bg-text-1 transition-colors group-hover:bg-accent" style={MASK_STYLE} />
      </Ranges>
    </div>
  );
}
