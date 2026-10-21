import type { GenreDTO } from "@resonia/api-client";
import { useCachedQuery } from "../../lib/cache/queryCache";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useServersStore } from "../../stores/serversStore";

// Ne change qu'au scan de la bibliothèque : une heure avant rafraîchissement en arrière-plan.
const GENRES_STALE_MS = 60 * 60_000;
const NO_GENRES: GenreDTO[] = [];

/** Partagé par la liste et la page d'un genre : ouvrir un genre affiche ses compteurs sans requête. */
export function useGenres() {
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const { data, loading } = useCachedQuery(
    server ? `${server.id}:genres` : null,
    () => getClientForServer(server!).getGenres(),
    GENRES_STALE_MS,
  );
  return { genres: data ?? NO_GENRES, loading };
}

/** Teinte stable par genre (même genre = même couleur partout), dérivée de son nom. */
export function genreHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

/** Même rendu que les en-têtes à couleur dominante (thèmes clairs : atténuée via `--dominant-strength`). */
export function genreBackground(name: string): string {
  return `color-mix(in srgb, hsl(${genreHue(name)} 55% 38%) var(--dominant-strength, 100%), var(--color-neutral-900))`;
}
