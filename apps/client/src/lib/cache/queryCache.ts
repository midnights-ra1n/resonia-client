import { useEffect, useReducer } from "react";

/** Cache mémoire des réponses serveur affichées par les pages (listes d'albums, playlists...).
 *  En revenant sur une page, ses données s'affichent immédiatement depuis ce cache au lieu de
 *  repasser par un squelette et des requêtes : au-delà de `staleMs`, elles restent affichées et
 *  sont rafraîchies en arrière-plan (stale-while-revalidate). Mémoire seule, jamais persisté :
 *  quelques dizaines d'entrées de métadonnées, bornées par MAX_ENTRIES. */

interface Entry {
  data?: unknown;
  fetchedAt: number;
  failed?: boolean;
  promise?: Promise<void>;
}

const DEFAULT_STALE_MS = 5 * 60_000;
const MAX_ENTRIES = 50;
const entries = new Map<string, Entry>();
// Hooks montés, par clé : prévenus quand leur entrée est invalidée pour se rafraîchir sur place.
const invalidationListeners = new Map<string, Set<() => void>>();

function touch(key: string, entry: Entry) {
  // Map = ordre d'insertion : ré-insérer en fin fait de la première entrée la moins récente.
  entries.delete(key);
  entries.set(key, entry);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

function load(key: string, fetcher: () => Promise<unknown>): Promise<void> {
  const existing = entries.get(key);
  if (existing?.promise) return existing.promise;

  const entry: Entry = existing ?? { fetchedAt: 0 };
  entry.promise = fetcher()
    .then((data) => {
      entry.data = data;
      entry.fetchedAt = Date.now();
      entry.failed = false;
    })
    .catch((err) => {
      console.error(`[queryCache] Échec du chargement (${key})`, err);
      entry.failed = true;
    })
    .finally(() => {
      entry.promise = undefined;
    });
  touch(key, entry);
  return entry.promise;
}

/** Marque comme périmées les entrées dont la clé correspond (données modifiées côté serveur
 *  depuis l'app) : les pages montées se rafraîchissent aussitôt, les autres au prochain
 *  affichage — en gardant les anciennes données à l'écran le temps de la requête. */
export function invalidateQueries(match: (key: string) => boolean): void {
  // Clés copiées d'abord : le rafraîchissement ré-ordonne la Map (voir touch).
  for (const key of [...entries.keys()].filter(match)) {
    entries.get(key)!.fetchedAt = 0;
    invalidationListeners.get(key)?.forEach((listener) => listener());
  }
}

/** Données en cache pour `key` (rafraîchies si périmées). `key` nul = rien à charger (pas de
 *  serveur actif). Le `fetcher` n'est lu qu'au changement de clé : la clé doit donc décrire
 *  entièrement la requête (serveur, type, taille...). */
export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  staleMs = DEFAULT_STALE_MS,
): { data: T | undefined; loading: boolean } {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const entry = key ? entries.get(key) : undefined;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const refresh = () => {
      load(key, fetcher).then(() => {
        if (!cancelled) rerender();
      });
    };

    const current = entries.get(key);
    if (!current || current.data === undefined || Date.now() - current.fetchedAt >= staleMs) refresh();

    let listeners = invalidationListeners.get(key);
    if (!listeners) invalidationListeners.set(key, (listeners = new Set()));
    listeners.add(refresh);
    return () => {
      cancelled = true;
      listeners.delete(refresh);
      if (listeners.size === 0) invalidationListeners.delete(key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, staleMs]);

  const data = entry?.data as T | undefined;
  return { data, loading: key !== null && data === undefined && !entry?.failed };
}
