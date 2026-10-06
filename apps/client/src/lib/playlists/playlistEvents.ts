// Petit bus d'événements pour signaler qu'une playlist a été modifiée (titres ajoutés ou
// retirés) depuis un endroit qui n'a pas connaissance de la page actuellement affichée —
// typiquement AddToPlaylistSubmenu, ouvert depuis n'importe quel menu contextuel. Sans ça,
// PlaylistPage (via usePlaylist) ne voyait la modification qu'après avoir quitté la page
// puis y être revenu (nouveau fetch au montage).
import { invalidateQueries } from "../cache/queryCache";

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

export function emitPlaylistSongsChanged(playlistId: string) {
  listeners.get(playlistId)?.forEach((listener) => listener());
  // Le nombre de titres affiché par les listes de playlists (accueil) a changé aussi.
  emitPlaylistsChanged();
}

/** Playlist créée, renommée ou supprimée : les listes de playlists en cache (accueil, voir
 *  lib/cache/queryCache) sont périmées. */
export function emitPlaylistsChanged() {
  invalidateQueries((key) => key.endsWith(":playlists"));
}

export function subscribePlaylistSongsChanged(playlistId: string, listener: Listener): () => void {
  let set = listeners.get(playlistId);
  if (!set) {
    set = new Set();
    listeners.set(playlistId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(playlistId);
  };
}
