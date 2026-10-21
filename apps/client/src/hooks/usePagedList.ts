import { useCallback, useEffect, useState } from "react";

interface PagedList {
  key: string | null;
  items: unknown[];
  /** Dernière tranche incomplète reçue : plus rien à charger. */
  done: boolean;
  /** Nombre d'éléments demandés : une tranche se charge tant que `items` n'y est pas. */
  wanted: number;
}

// Dernières listes vues, en mémoire : revenir sur la page (depuis un album...) réaffiche les
// tranches déjà chargées au lieu de repartir de la première.
const MAX_REMEMBERED = 10;
const remembered = new Map<string, PagedList>();

function remember(list: PagedList) {
  if (list.key === null) return;
  remembered.delete(list.key);
  remembered.set(list.key, list);
  if (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.keys().next().value!);
}

function initial(key: string | null, pageSize: number): PagedList {
  return (key !== null && remembered.get(key)) || { key, items: [], done: false, wanted: pageSize };
}

/** Liste chargée par tranches de `pageSize` (pagination par décalage). `key` décrit entièrement
 *  la requête : `fetchPage` n'est relu qu'à son changement. */
export function usePagedList<T>(key: string | null, fetchPage: (offset: number) => Promise<T[]>, pageSize: number) {
  const [list, setList] = useState(() => initial(key, pageSize));
  const [failedKey, setFailedKey] = useState<string | null>(null);
  if (list.key !== key) setList(initial(key, pageSize));

  const current = list.key === key ? list : initial(key, pageSize);
  const failed = key !== null && failedKey === key;
  const loading = key !== null && !failed && !current.done && current.items.length < current.wanted;

  useEffect(() => {
    if (!loading || list.key !== key) return;
    let cancelled = false;
    fetchPage(list.items.length)
      .then((page) => {
        if (cancelled) return;
        const next = { ...list, items: [...list.items, ...page], done: page.length < pageSize };
        remember(next);
        setList(next);
      })
      .catch((err) => {
        console.error(`[pagedList] Échec du chargement (${key})`, err);
        if (!cancelled) setFailedKey(key);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, key, list, pageSize]);

  const loadMore = useCallback(
    () => setList((l) => (l.key === key ? { ...l, wanted: l.items.length + pageSize } : l)),
    [key, pageSize],
  );

  return {
    items: current.items as T[],
    loading,
    hasMore: !current.done && !failed,
    failed,
    loadMore,
    retry: () => setFailedKey(null),
  };
}
