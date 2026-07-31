/**
 * Modèle Album côté client, dérivé de la réponse OpenSubsonic `getAlbumList2`.
 * On ne garde que ce dont l'UI a besoin ; le mapping brut -> Album se fait
 * dans le hook (voir useMostPlayedAlbums.ts) pour isoler le reste de l'app
 * du format exact renvoyé par le serveur.
 */
export interface Album {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  /** URL déjà résolue vers le endpoint getCoverArt (avec token/salt si requis) */
  coverArtUrl?: string;
  playCount: number;
  year?: number;
  durationSeconds?: number;
  songCount?: number;
}
