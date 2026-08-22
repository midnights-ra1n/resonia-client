import { Disc, Info, ListMusic, ListPlus, User } from "lucide-react";
import type { SubsonicClient } from "@resonia/api-client";
import type { NavigateFunction } from "react-router-dom";
import type { MenuItem } from "./ContextMenu";
import type { Track } from "../../stores/playerStore";
import { AddToPlaylistSubmenu } from "./AddToPlaylistSubmenu";

interface BuildTrackMenuItemsParams {
  track: Track;
  client: SubsonicClient;
  t: (key: string, vars?: Record<string, string | number>) => string;
  navigate: NavigateFunction;
  addToQueue: (track: Track, position?: "next" | "end") => void;
  onOpenInfo: () => void;
  /** Masque "Aller à l'album"/"Aller à l'artiste" quand on est déjà sur cette page. */
  hideGoToAlbum?: boolean;
  hideGoToArtist?: boolean;
}

export function buildTrackMenuItems({
  track,
  client,
  t,
  navigate,
  addToQueue,
  onOpenInfo,
  hideGoToAlbum,
  hideGoToArtist,
}: BuildTrackMenuItemsParams): MenuItem[] {
  const items: MenuItem[] = [
    {
      type: "action",
      label: t("contextMenu.addToQueue"),
      icon: ListPlus,
      onClick: () => addToQueue(track, "next"),
    },
    {
      type: "submenu",
      label: t("contextMenu.addToPlaylist"),
      icon: ListMusic,
      renderSubmenu: (close) => (
        <AddToPlaylistSubmenu client={client} getSongIds={async () => [track.id]} close={close} />
      ),
    },
    { type: "separator" },
    {
      type: "action",
      label: t("contextMenu.getInfo"),
      icon: Info,
      onClick: onOpenInfo,
    },
  ];

  if (!hideGoToAlbum && track.albumId) {
    items.push({
      type: "action",
      label: t("contextMenu.goToAlbum"),
      icon: Disc,
      onClick: () => navigate(`/albums/${track.albumId}`),
    });
  }

  if (!hideGoToArtist && track.artistId) {
    items.push({
      type: "action",
      label: t("contextMenu.goToArtist"),
      icon: User,
      onClick: () => navigate(`/artists/${track.artistId}`),
    });
  }

  return items;
}
