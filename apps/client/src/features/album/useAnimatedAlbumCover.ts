import { useEffect, useState } from "react";
import {
  searchAnimatedArtwork,
  searchAnimatedArtworkByUrl,
  resolveAppleMusicAlbumUrl,
  DEFAULT_ANIMATED_ARTWORK_BASE_URL,
} from "@resonia/api-client";
import { isTauri } from "../../lib/platform";
import {
  getCachedSearchResult,
  setCachedSearchResult,
  clearAnimatedCoverSearchCache,
} from "../../lib/image/animatedCoverSearchCache";
import { useSettingsStore } from "../../stores/settingsStore";

/** Voir coverCache.ts : le CDN Apple derrière artwork.m8tec.top envoie bien un en-tête CORS
 *  ouvert, mais on passe quand même par le client HTTP natif de Tauri côté bureau pour rester
 *  cohérent avec le reste du cache d'images et robuste à un changement futur de politique CORS
 *  côté serveur. */
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

// Cache purement en mémoire (jamais persisté sur disque, contrairement à searchResultCache) de
// l'URL Apple Music résolue par couple artiste/album via resolveAppleMusicAlbumUrl : ce n'est
// qu'un repli intermédiaire pour la recherche texte m8tec ci-dessous (voir resolveMasterUrl), pas
// la peine de le faire survivre au delà de la session en cours. Indépendant de baseUrl : l'URL
// Apple Music d'un album ne dépend pas de l'instance m8tec interrogée ensuite.
const appleMusicUrlCache = new Map<string, string | null>();

function appleMusicUrlCacheKeyFor(artist: string, album: string): string {
  return `${artist.trim().toLowerCase()}::${album.trim().toLowerCase()}`;
}

/** Repli déclenché quand la recherche texte m8tec (searchAnimatedArtwork) ne trouve rien : elle
 *  scrape une page de résultats de recherche Apple Music et y cherche un lien correspondant au
 *  titre demandé, ce qui échoue régulièrement dès que ce titre contient une apostrophe, des
 *  parenthèses ou d'autres caractères spéciaux — alors même que la pochette animée existe bel et
 *  bien. On résout ici l'URL Apple Music exacte de l'album via l'API de recherche publique
 *  d'Apple (iTunes Search, matching plein texte fiable sur ces caractères), puis on la transmet
 *  telle quelle à l'API m8tec (searchAnimatedArtworkByUrl) : plus aucune recherche texte fragile
 *  n'intervient à ce stade côté serveur. */
async function resolveMasterUrlViaAppleMusicUrl(
  baseUrl: string,
  artist: string,
  album: string,
): Promise<string | null> {
  const cacheKey = appleMusicUrlCacheKeyFor(artist, album);
  let appleMusicUrl = appleMusicUrlCache.get(cacheKey);
  if (appleMusicUrl === undefined) {
    appleMusicUrl = await resolveAppleMusicAlbumUrl(
      artist,
      album,
      platformFetch,
    );
    appleMusicUrlCache.set(cacheKey, appleMusicUrl);
  }
  if (!appleMusicUrl) return null;

  const result = await searchAnimatedArtworkByUrl(
    appleMusicUrl,
    platformFetch,
    baseUrl,
  );
  return result?.squareUrl ?? null;
}

/** Résout l'URL de la playlist HLS "master" de la pochette animée d'un album (ou null si elle
 *  n'existe pas). Cette URL est ensuite donnée telle quelle à un lecteur HLS complet (HLS natif de
 *  WebKit, ou hls.js côté Blink/Gecko — voir AnimatedAlbumCoverVideo.tsx) : contrairement à une
 *  ancienne version de ce fichier, on ne tente plus de choisir nous-mêmes une variante ni de
 *  télécharger un .mp4 "à plat" en un seul fichier — ces flux ont des timestamps internes calés
 *  sur la timeline globale (normal en HLS), ce qu'un vrai lecteur HLS gère très bien mais qu'un
 *  <video src> pointé directement sur un fichier refuse (MEDIA_ERR_SRC_NOT_SUPPORTED). */
async function resolveMasterUrl(
  baseUrl: string,
  artist: string,
  album: string,
): Promise<string | null> {
  const searchKey = searchKeyFor(baseUrl, artist, album);
  const inMemory = searchResultCache.get(searchKey);
  if (inMemory !== undefined) return inMemory;

  const persisted = await getCachedSearchResult(searchKey);
  if (persisted !== undefined) {
    searchResultCache.set(searchKey, persisted);
    return persisted;
  }

  try {
    const result = await searchAnimatedArtwork(
      artist,
      album,
      platformFetch,
      baseUrl,
    );
    let masterUrl = result?.squareUrl ?? null;

    if (!masterUrl) {
      try {
        masterUrl = await resolveMasterUrlViaAppleMusicUrl(
          baseUrl,
          artist,
          album,
        );
      } catch (err) {
        console.warn("[animatedCover] Repli iTunes/URL échoué", err);
      }
    }

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

interface ResolvedAnimatedCover {
  key: string;
  url: string;
}

/** Résout l'URL de la playlist HLS "master" de la pochette animée (mp4/HLS) d'un album, si elle
 *  existe, via artwork.m8tec.top. Renvoie null en l'absence de pochette animée ou en cas d'échec
 *  (silencieux : la pochette statique reste l'affichage de repli, ce n'est jamais une erreur
 *  bloquante). Le rendu effectif (HLS natif vs hls.js) est délégué à AnimatedAlbumCoverVideo. */
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

    (async () => {
      const masterUrl = await resolveMasterUrl(baseUrl, artist, album);
      if (!masterUrl || cancelled) return;
      setResolved({ key: albumKey, url: masterUrl });
    })();

    return () => {
      cancelled = true;
    };
  }, [albumKey, artist, album, baseUrl]);

  // Dérivé au rendu (voir useCoverArt.ts) : si la clé résolue ne correspond plus à l'album
  // affiché, on retombe immédiatement sur "pas de pochette animée" sans passer par un setState
  // de réinitialisation dans l'effet.
  return resolved && resolved.key === albumKey ? resolved.url : null;
}

/** Vide le cache de résolution (recherche du master URL), en mémoire ET sur disque, pour forcer
 *  une nouvelle requête à l'API plutôt que de continuer à servir un résultat déjà connu. Utilisé
 *  par le bouton "Forcer une nouvelle récupération" des réglages. */
export async function clearAnimatedCoverResolutionCache(): Promise<void> {
  searchResultCache.clear();
  appleMusicUrlCache.clear();
  await clearAnimatedCoverSearchCache();
}
