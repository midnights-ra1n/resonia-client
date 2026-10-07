import { useEffect, useRef } from "react";
import type { Waveform } from "../../lib/audio/waveform/waveform";

// Largeur d'une colonne et espace entre deux, en pixels CSS : rendu « barres » des vues
// d'ensemble DJ, lisible même sur une barre étroite.
const BAR_WIDTH = 2;
const BAR_GAP = 1;

/** Dessine la forme d'onde symétrique, en trois couches superposées d'opacité croissante :
 *  amplitude totale, puis médiums + aigus, puis aigus — même lecture que l'aperçu 3 bandes des
 *  logiciels DJ, dans une seule teinte (celle du thème). */
function draw(canvas: HTMLCanvasElement, waveform: Waveform, color: string) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;

  const columns = Math.max(1, Math.floor(width / (BAR_WIDTH + BAR_GAP)));
  const middle = height / 2;
  const layers: Array<{ alpha: number; value: (i: number) => number }> = [
    { alpha: 0.35, value: (i) => Math.max(waveform.low[i], waveform.mid[i], waveform.high[i]) },
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
  ctx.globalAlpha = 1;
}

function WaveformCanvas({ waveform, colorVar }: { waveform: Waveform; colorVar: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Redessinée uniquement quand la forme d'onde, la taille ou le thème changent — jamais au fil
  // de la lecture (la progression est un simple découpage, voir WaveformBar).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const redraw = () => draw(canvas, waveform, getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim() || "#888");
    redraw();
    const resize = new ResizeObserver(redraw);
    resize.observe(canvas);
    const theme = new MutationObserver(redraw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      resize.disconnect();
      theme.disconnect();
    };
  }, [waveform, colorVar]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

/** Copie de la forme d'onde visible de 0 à `percent` % : fenêtre qui glisse et contenu immobile,
 *  par deux `transform` opposés — le tick de lecture ne provoque ni redessin ni mise en page,
 *  seulement une recomposition GPU. */
function ClippedWaveform({ waveform, colorVar, percent }: { waveform: Waveform; colorVar: string; percent: number }) {
  const offset = 100 - percent;
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ transform: `translateX(-${offset}%)` }}>
      <div className="absolute inset-0" style={{ transform: `translateX(${offset}%)` }}>
        <WaveformCanvas waveform={waveform} colorVar={colorVar} />
      </div>
    </div>
  );
}

/** Barre de progression en forme d'onde, en trois teintes comme la barre de YouTube : partie non
 *  chargée (sombre), partie chargée (gris clair), partie jouée (accent). */
export function WaveformBar({
  waveform,
  progress,
  buffered,
  pulsing,
}: {
  waveform: Waveform;
  progress: number;
  buffered: number;
  pulsing: boolean;
}) {
  return (
    <div className={`absolute inset-0 ${pulsing ? "animate-pulse" : ""}`}>
      <WaveformCanvas waveform={waveform} colorVar="--color-neutral-700" />
      <ClippedWaveform waveform={waveform} colorVar="--color-neutral-500" percent={buffered} />
      <ClippedWaveform waveform={waveform} colorVar="--color-accent" percent={progress} />
    </div>
  );
}
