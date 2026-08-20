import { useEffect, useState } from "react";
import {
  getAppleMusicFallbackArtwork,
  scrapeAppleMusicArtistArtwork,
  searchAppleMusicArtistByScraping,
} from "@resonia/api-client";
import { isTauri } from "../../lib/platform";

// Évite de re-résoudre le même artiste à chaque montage de page.
const photoCache = new Map<string, string | null>();

function probeImageLoads(url: string, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

/** Photo d'artiste haute résolution, entièrement via le scraping de music.apple.com (recherche
 *  puis page artiste) — aucune clé ni compte requis, et on évite ainsi la limite de débit de
 *  l'API iTunes Search (~20 req/min par IP). music.apple.com ne renvoie pas d'en-tête CORS pour
 *  notre origine : ces requêtes ne peuvent donc passer que via le client HTTP natif de Tauri,
 *  qui n'est pas soumis à la politique CORS du navigateur — d'où l'usage exclusif sur le bureau. */
async function resolveDesktopArtwork(artistName: string): Promise<string | undefined> {
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");

  const match = await searchAppleMusicArtistByScraping(artistName, tauriFetch);
  if (!match) return undefined;

  const artwork = await scrapeAppleMusicArtistArtwork(match.url, tauriFetch);
  if (!artwork) return undefined;
  if (await probeImageLoads(artwork.bannerUrl)) return artwork.bannerUrl;
  if (await probeImageLoads(artwork.squareUrl)) return artwork.squareUrl;
  return undefined;
}

/** Résout une photo d'artiste via Apple Music : sur le client bureau, la vraie photo d'identité
 *  de l'artiste (scraping de music.apple.com, cf. resolveDesktopArtwork) ; sur le web, une
 *  pochette d'album en repli via l'API iTunes Search (ouverte au CORS, sans clé). Dans les deux
 *  cas, le nom retourné par Apple est comparé (insensible à la casse/aux accents) au nom demandé
 *  avant utilisation : on préfère `fallbackUrl` (pochette Navidrome de l'artiste) plutôt que de
 *  risquer d'afficher la photo d'un homonyme. */
export function useArtistPhoto(artistName: string | undefined, fallbackUrl: string | undefined): string | undefined {
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(fallbackUrl);

  useEffect(() => {
    setPhotoUrl(fallbackUrl);
    if (!artistName) return;

    let cancelled = false;
    const nameKey = artistName.toLowerCase();

    (async () => {
      try {
        const cached = photoCache.get(nameKey);
        if (cached !== undefined) {
          if (cached && !cancelled) setPhotoUrl(cached);
          return;
        }

        let resolvedUrl: string | undefined;
        if (isTauri()) {
          resolvedUrl = await resolveDesktopArtwork(artistName);
        }
        if (!resolvedUrl && !cancelled) {
          resolvedUrl = (await getAppleMusicFallbackArtwork(artistName)) ?? undefined;
        }

        photoCache.set(nameKey, resolvedUrl ?? null);
        if (resolvedUrl && !cancelled) setPhotoUrl(resolvedUrl);
      } catch (err) {
        console.error("[artist] Échec de la récupération de la photo Apple Music", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artistName, fallbackUrl]);

  return photoUrl;
}
