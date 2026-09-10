import { useEffect, useState } from "react";

const cache = new Map<string, string | null>();

interface ResolvedColor {
  key: string;
  color: string | null;
}

/** Échantillonne la pochette sur un petit canevas pour en extraire une couleur moyenne
 *  représentative, utilisée comme haut de dégradé sur les pages album/playlist (façon
 *  Spotify). `crossOrigin="anonymous"` est nécessaire pour lire les pixels sans "tainted
 *  canvas" ; si le serveur ne renvoie pas les bons en-têtes CORS, on échoue silencieusement
 *  et le dégradé neutre par défaut reste affiché. */
export function useDominantColor(imageUrl: string | undefined): string | null {
  const [resolved, setResolved] = useState<ResolvedColor | null>(null);

  useEffect(() => {
    if (!imageUrl) return;

    let cancelled = false;

    const cached = cache.get(imageUrl);
    if (cached !== undefined) {
      Promise.resolve().then(() => {
        if (!cancelled) setResolved({ key: imageUrl, color: cached });
      });
      return () => {
        cancelled = true;
      };
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      if (cancelled) return;
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2d context unavailable");
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);

        const result = `rgb(${r}, ${g}, ${b})`;
        cache.set(imageUrl, result);
        setResolved({ key: imageUrl, color: result });
      } catch (err) {
        console.warn("[useDominantColor] Extraction impossible", err);
        cache.set(imageUrl, null);
        setResolved({ key: imageUrl, color: null });
      }
    };

    img.onerror = () => {
      if (cancelled) return;
      cache.set(imageUrl, null);
      setResolved({ key: imageUrl, color: null });
    };

    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Dérivé au rendu (pattern de useCoverArt) : si la clé résolue ne correspond plus à
  // l'image demandée (changée entre-temps), on retombe immédiatement sur `null` sans passer
  // par un setState de "reset" déclenché depuis l'effet.
  if (imageUrl && resolved && resolved.key === imageUrl) {
    return resolved.color;
  }
  return null;
}
