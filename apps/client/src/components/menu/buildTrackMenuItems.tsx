import { Disc, Download, Info, ListMusic, ListPlus, User } from "lucide-react";
import type { SubsonicClient } from "@resonia/api-client";
import type { NavigateFunction } from "react-router-dom";
import type { MenuItem } from "./ContextMenu";
import type { Track } from "../../stores/playerStore";
import { AddToPlaylistSubmenu } from "./AddToPlaylistSubmenu";
import { downloadStore } from "../../lib/downloads/downloadStore";

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
  /**
   * Ids de tous les titres actuellement sélectionnés dans la liste (sélection multiple).
   * Si elle contient `track.id` et au moins 2 entrées, les actions groupées (ajout à une
   * playlist, etc.) s'appliquent à toute la sélection plutôt qu'au seul titre cliqué.
   */
  selectedTrackIds?: string[];
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
  selectedTrackIds,
}: BuildTrackMenuItemsParams): MenuItem[] {
  const targetIds =
    selectedTrackIds &&
    selectedTrackIds.length > 1 &&
    selectedTrackIds.includes(track.id)
      ? selectedTrackIds
      : [track.id];
  const isMultiple = targetIds.length > 1;

  const items: MenuItem[] = [
    {
      type: "action",
      label: t("contextMenu.addToQueue"),
      icon: ListPlus,
      onClick: () => addToQueue(track, "next"),
    },
    {
      type: "submenu",
      label: isMultiple
        ? t("contextMenu.addToPlaylistCount", { count: targetIds.length })
        : t("contextMenu.addToPlaylist"),
      icon: ListMusic,
      renderSubmenu: (close) => (
        <AddToPlaylistSubmenu
          client={client}
          getSongIds={async () => targetIds}
          close={close}
        />
      ),
    },
    {
      type: "action",
      label: t("contextMenu.download"),
      icon: Download,
      onClick: () => downloadStore.enqueueTrackAuto(track),
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
