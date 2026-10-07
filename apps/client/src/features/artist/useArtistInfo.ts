import type { ArtistInfo2DTO } from "@resonia/api-client";
import { useCachedQuery } from "../../lib/cache/queryCache";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useServersStore } from "../../stores/serversStore";

// Biographie et artistes similaires changent rarement : une journée avant rafraîchissement en
// arrière-plan évite de réinterroger le serveur (qui lui-même interroge Last.fm) à chaque visite.
const ARTIST_INFO_STALE_MS = 24 * 60 * 60_000;
const SIMILAR_ARTISTS_COUNT = 12;

/** Infos complémentaires (`getArtistInfo2`) : un échec est silencieux, la page reste complète
 *  sans biographie ni artistes similaires. */
export function useArtistInfo(artistId: string | undefined): ArtistInfo2DTO | undefined {
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const key = server && artistId ? `${server.id}:artistInfo:${artistId}` : null;

  const { data } = useCachedQuery(
    key,
    () => getClientForServer(server!).getArtistInfo2(artistId!, SIMILAR_ARTISTS_COUNT),
    ARTIST_INFO_STALE_MS,
  );
  return data;
}

/** Les biographies Last.fm relayées par Navidrome contiennent du HTML (lien « Read more on
 *  Last.fm ») : rendu en texte brut, jamais via innerHTML (contenu distant). */
export function biographyToText(html: string | undefined): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("a").forEach((a) => {
    if (/last\.fm/i.test(a.getAttribute("href") ?? "")) a.remove();
  });
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}
