import { useEffect, useState } from "react";
import {
  searchAnimatedArtwork,
  resolveAnimatedArtworkSources,
  DEFAULT_ANIMATED_ARTWORK_BASE_URL,
} from "@resonia/api-client";
import { isTauri, supportsNativeHls } from "../../lib/platform";
import { getCachedAnimatedCoverUrl, loadAndCacheAnimatedCover } from "../../lib/image/animatedCoverCache";
import {
  getCachedSearchResult,
  setCachedSearchResult,
  getCachedResolvedSources,
  setCachedResolvedSources,
  clearAnimatedCoverSearchCache,
} from "../../lib/image/animatedCoverSearchCache";
import { useSettingsStore } from "../../stores/settingsStore";

/** Voir coverCache.ts / animatedCoverCache.ts : le CDN Apple derrière artwork.m8tec.top envoie
 *  bien un en-tête CORS ouvert, mais on passe quand même par le client HTTP natif de Tauri côté
 *  bureau pour rester cohérent avec le reste du cache d'images et robuste à un changement futur
 *  de politique CORS côté serveur. */
const platformFetch: typeof fetch = async (input, init) => {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(input as string, init);
  }
  return fetch(input, init);
};

// Négatif comme positif : évite de rappeler l'API de recherche à chaque montage de AlbumPage
// pour un album déjà su sans pochette animée (cas le plus fréquent) durant la session en cours.
// Adossé à animatedCoverSearchCache (persisté sur disque) pour éviter de refaire cet appel
// réseau à chaque redémarrage de l'app / rechargement de page pour toute la bibliothèque.
const searchResultCache = new Map<string, string | null>();

// L'URL de base fait partie de la clé : un même couple artiste/album peut donner des résultats
// différents (ou un simple aléa réseau) selon l'instance interrogée (voir DEFAULT_ANIMATED_ARTWORK_BASE_URL
// et le réglage utilisateur), on ne veut donc jamais mélanger les caches des deux.
function searchKeyFor(baseUrl: string, artist: string, album: string): string {
  return `${baseUrl}::${artist.trim().toLowerCase()}::${album.trim().toLowerCase()}`;
}

async function resolveMasterUrl(baseUrl: string, artist: string, album: string): Promise<string | null> {
  const searchKey = searchKeyFor(baseUrl, artist, album);
  const inMemory = searchResultCache.get(searchKey);
  if (inMemory !== undefined) return inMemory;

  const persisted = await getCachedSearchResult(searchKey);
  if (persisted !== undefined) {
    searchResultCache.set(searchKey, persisted);
    return persisted;
  }

  try {
    const result = await searchAnimatedArtwork(artist, album, platformFetch, baseUrl);
    const masterUrl = result?.squareUrl ?? null;
    // Uniquement ici (réponse effectivement obtenue, cover absente ou trouvée) le résultat est
    // digne d'être mis en cache, y compris sur disque : c'est une réponse confirmée de l'API.
    searchResultCache.set(searchKey, masterUrl);
    void setCachedSearchResult(searchKey, masterUrl);
    return masterUrl;
  } catch (err) {
    console.warn("[animatedCover] Recherche m8tec échouée", err);
    // Une erreur (réseau, rate-limit, timeout...) ne veut pas dire "pas de pochette animée" : ne
    // JAMAIS la mettre en cache (ni en mémoire, ni sur disque), sous peine de figer un album pour
    // 30 jours à cause d'un simple aléa réseau au chargement. On retentera au prochain montage.
    return null;
  }
}

/** Enveloppe resolveAnimatedArtworkSources avec un cache persisté par masterUrl : sur le chemin
 *  WebKit (voir plus bas), aucun binaire n'est mis en cache disque, donc sans ce cache on
 *  re-téléchargerait les playlists m3u8 master + média à chaque montage de AlbumPage. */
async function resolveSourcesCached(
  masterUrl: string,
): Promise<{ hlsUrl: string; mp4Url: string } | null> {
  const cached = await getCachedResolvedSources(masterUrl);
  if (cached) return cached;

  const sources = await resolveAnimatedArtworkSources(masterUrl, platformFetch);
  if (sources) void setCachedResolvedSources(masterUrl, sources);
  return sources;
}

interface ResolvedAnimatedCover {
  key: string;
  url: string;
}

/** Résout la pochette animée (mp4) d'un album via artwork.m8tec.top, si elle existe. Renvoie null
 *  en l'absence de pochette animée ou en cas d'échec (silencieux : la pochette statique reste
 *  l'affichage de repli, ce n'est jamais une erreur bloquante).
 *
 *  Deux chemins de lecture selon le moteur de rendu (voir supportsNativeHls) :
 *  - WebKit (Safari, webview macOS de l'app de bureau) : lit le HLS nativement, y compris le
 *    CMAF fragmenté utilisé ici, mais uniquement depuis une vraie URL http(s) — son moteur HLS
 *    (AVFoundation) ne sait pas charger un flux depuis un blob: local, donc pas de mise en cache
 *    disque possible sur ce chemin, on laisse le cache HTTP du système faire son travail.
 *  - Blink/Gecko (Chrome, Firefox, WebView2...) : pas de support HLS natif, mais lisent très bien
 *    en <video src> le fichier .mp4 fragmenté unique une fois téléchargé — c'est ce fichier qu'on
 *    télécharge et met en cache disque (voir animatedCoverCache.ts). */
export function useAnimatedAlbumCover(
  albumKey: string | undefined,
  artist: string | undefined,
  album: string | undefined,
): string | null {
  const [resolved, setResolved] = useState<ResolvedAnimatedCover | null>(null);
  const customBaseUrl = useSettingsStore((s) => s.animatedArtworkBaseUrl);
  const baseUrl = customBaseUrl || DEFAULT_ANIMATED_ARTWORK_BASE_URL;

  useEffect(() => {
    if (!albumKey || !artist || !album) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      if (supportsNativeHls()) {
        const masterUrl = await resolveMasterUrl(baseUrl, artist, album);
        if (!masterUrl || cancelled) return;

        try {
          const sources = await resolveSourcesCached(masterUrl);
          if (!sources || cancelled) return;
          setResolved({ key: albumKey, url: sources.hlsUrl });
        } catch (err) {
          console.warn("[animatedCover] Résolution HLS échouée", err);
        }
        return;
      }

      const cachedLocally = await getCachedAnimatedCoverUrl(albumKey);
      if (cachedLocally) {
        if (cancelled) {
          URL.revokeObjectURL(cachedLocally);
          return;
        }
        objectUrl = cachedLocally;
        setResolved({ key: albumKey, url: cachedLocally });
        return;
      }

      const masterUrl = await resolveMasterUrl(baseUrl, artist, album);
      if (!masterUrl || cancelled) return;

      try {
        const sources = await resolveSourcesCached(masterUrl);
        if (!sources || cancelled) return;

        const cached = await loadAndCacheAnimatedCover(albumKey, sources.mp4Url);
        if (cancelled) {
          URL.revokeObjectURL(cached);
          return;
        }
        objectUrl = cached;
        setResolved({ key: albumKey, url: cached });
      } catch (err) {
        console.warn("[animatedCover] Résolution/cache de la pochette animée échoués", err);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [albumKey, artist, album, baseUrl]);

  // Dérivé au rendu (voir useCoverArt.ts) : si la clé résolue ne correspond plus à l'album
  // affiché, on retombe immédiatement sur "pas de pochette animée" sans passer par un setState
  // de réinitialisation dans l'effet.
  return resolved && resolved.key === albumKey ? resolved.url : null;
}

/** Vide le cache de résolution (recherche + sources HLS/mp4), en mémoire ET sur disque, pour
 *  forcer une nouvelle requête à l'API plutôt que de continuer à servir un résultat déjà connu —
 *  ne touche pas au cache des vidéos déjà téléchargées (voir animatedCoverCache.clearAnimatedCoverCache
 *  pour ça). Utilisé par le bouton "Forcer une nouvelle récupération" des réglages. */
export async function clearAnimatedCoverResolutionCache(): Promise<void> {
  searchResultCache.clear();
  await clearAnimatedCoverSearchCache();
}
