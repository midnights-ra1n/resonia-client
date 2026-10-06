import { useEffect, useState } from "react";
import { getCachedCoverUrl, loadAndCacheCover } from "../lib/image/coverCache";

interface ResolvedCover {
  key: string;
  url: string;
}

/** Object URLs de pochettes partagées entre composants, avec compteur de références. Sans
 *  elles, chaque montage relisait l'image depuis le disque (OPFS/IPC) en asynchrone : en
 *  revenant sur une page, toutes ses pochettes repassaient par le placeholder puis le fondu —
 *  l'impression d'un rechargement complet. Ici une pochette encore connue s'affiche dès le
 *  premier rendu. Une URL plus utilisée reste disponible un temps (les MAX_IDLE_URLS plus
 *  récentes), puis est révoquée : la mémoire reste bornée (le Blob d'une pochette lue depuis
 *  le cache est adossé au disque, celui d'une pochette fraîchement téléchargée pèse ~30 Ko). */
interface SharedUrl {
  url: string;
  refs: number;
}

const MAX_IDLE_URLS = 120;
// Délai avant révocation des URLs en trop : laisse à une page qui vient d'afficher une URL
// inutilisée (lue au rendu) le temps de la réserver dans son effet.
const TRIM_DELAY_MS = 1000;
const sharedUrls = new Map<string, SharedUrl>();
let trimTimer: ReturnType<typeof setTimeout> | null = null;

function acquireSharedUrl(key: string): string | undefined {
  const entry = sharedUrls.get(key);
  if (!entry) return undefined;
  entry.refs++;
  // Ré-insertion en fin de Map : l'ordre d'insertion sert d'ordre LRU (voir trimIdleUrls).
  sharedUrls.delete(key);
  sharedUrls.set(key, entry);
  return entry.url;
}

/** Enregistre une URL fraîchement créée ; si un autre composant en a publié une entre-temps
 *  pour la même pochette, la nouvelle est révoquée au profit de celle déjà partagée. */
function adoptSharedUrl(key: string, url: string): string {
  const existing = acquireSharedUrl(key);
  if (existing) {
    URL.revokeObjectURL(url);
    return existing;
  }
  sharedUrls.set(key, { url, refs: 1 });
  return url;
}

function releaseSharedUrl(key: string): void {
  const entry = sharedUrls.get(key);
  if (!entry) return;
  entry.refs--;
  if (entry.refs === 0 && trimTimer === null) trimTimer = setTimeout(trimIdleUrls, TRIM_DELAY_MS);
}

function trimIdleUrls(): void {
  trimTimer = null;
  let idle = 0;
  for (const entry of sharedUrls.values()) if (entry.refs === 0) idle++;
  for (const [key, entry] of sharedUrls) {
    if (idle <= MAX_IDLE_URLS) break;
    if (entry.refs !== 0) continue;
    sharedUrls.delete(key);
    URL.revokeObjectURL(entry.url);
    idle--;
  }
}

/** `inView` à false (carte encore loin de l'écran, voir useInViewport) : seule une pochette déjà
 *  en mémoire est servie — gratuite — mais rien n'est lu sur disque ni téléchargé. Évite qu'en
 *  revenant sur une page, ses cartes affichent une frame de placeholder en attendant la
 *  première réponse de l'IntersectionObserver. */
export function useCoverArt(
  serverId: string | undefined,
  coverArtId: string | undefined,
  size: number,
  liveUrl: string | undefined,
  inView = true,
): string | undefined {
  const [resolved, setResolved] = useState<ResolvedCover | null>(null);

  const cacheKey = serverId && coverArtId ? `${serverId}:${coverArtId}:${size}` : undefined;

  useEffect(() => {
    if (!serverId || !coverArtId || !liveUrl || !cacheKey) return;

    // Déjà affichée ailleurs ou récemment : on la réserve, rien d'autre à faire (elle est
    // renvoyée dès le rendu, voir plus bas).
    if (acquireSharedUrl(cacheKey)) return () => releaseSharedUrl(cacheKey);
    if (!inView) return;

    let cancelled = false;
    let held = false;

    (async () => {
      let url: string;
      try {
        url =
          (await getCachedCoverUrl(serverId, coverArtId, size)) ??
          (await loadAndCacheCover(serverId, coverArtId, size, liveUrl));
      } catch (err) {
        console.error("[coverCache] Échec du cache de pochette", err);
        // Repli terminal uniquement en cas d'échec réel du cache : voir le commentaire sur le
        // rendu plus bas pour la raison de ne JAMAIS exposer `liveUrl` pendant que la
        // résolution est encore en cours.
        if (!cancelled) setResolved({ key: cacheKey, url: liveUrl });
        return;
      }

      if (!url.startsWith("blob:")) {
        if (!cancelled) setResolved({ key: cacheKey, url });
        return;
      }
      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }
      held = true;
      setResolved({ key: cacheKey, url: adoptSharedUrl(cacheKey, url) });
    })();

    return () => {
      cancelled = true;
      if (held) releaseSharedUrl(cacheKey);
    };
  }, [serverId, coverArtId, size, liveUrl, cacheKey, inView]);

  // Dérivé au rendu : tant que rien n'est résolu pour cette clé (cache pas encore lu, ou
  // téléchargement+mise en cache encore en vol), on renvoie `undefined` plutôt que `liveUrl` —
  // les appelants affichent un placeholder dans cet intervalle. Exposer `liveUrl` ici
  // déclencherait un chargement réseau direct via `<img src>` EN PARALLÈLE de celui fait par
  // `loadAndCacheCover` ci-dessus (même image, deux téléchargements), puis un remplacement du
  // `src` une fois le cache prêt — un clignotement visible sur chaque pochette une fois
  // "affichée" (second décodage qui repeint l'image par-dessus la précédente), en plus de la
  // bande passante gaspillée. `resolved.url` n'est posé qu'une seule fois par clé (voir
  // l'effet ci-dessus, `liveUrl` y compris comme repli terminal en cas d'échec), donc `<img
  // src>` ne change plus jamais après son tout premier paint. Une URL partagée déjà connue
  // est la même que celle que l'effet réservera : elle peut être servie dès ce rendu.
  if (resolved && resolved.key === cacheKey) {
    return resolved.url;
  }
  return cacheKey && liveUrl ? sharedUrls.get(cacheKey)?.url : undefined;
}
