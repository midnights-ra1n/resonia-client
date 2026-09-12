import { Download, Info, ListMusic, ListPlus, User } from "lucide-react";
import type { AlbumSummary, SubsonicClient } from "@resonia/api-client";
import type { NavigateFunction } from "react-router-dom";
import type { MenuItem } from "./ContextMenu";
import type { Track } from "../../stores/playerStore";
import { AddToPlaylistSubmenu } from "./AddToPlaylistSubmenu";
import { downloadStore } from "../../lib/downloads/downloadStore";

interface BuildAlbumMenuItemsParams {
  album: AlbumSummary;
  client: SubsonicClient;
  t: (key: string, vars?: Record<string, string | number>) => string;
  navigate: NavigateFunction;
  addToQueue: (tracks: Track[], position?: "next" | "end") => void;
  onOpenInfo: () => void;
  hideGoToArtist?: boolean;
}

async function fetchAlbumTracks(client: SubsonicClient, album: AlbumSummary): Promise<Track[]> {
  const coverUrl = album.coverArt ? client.getCoverArtUrl(album.coverArt, 300) : undefined;
  const full = await client.getAlbum(album.id);
  return full.song.map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    artistId: s.artistId ?? album.artistId,
    album: s.album,
    albumId: s.albumId ?? album.id,
    duration: s.duration,
    coverUrl: s.coverArt ? client.getCoverArtUrl(s.coverArt, 300) : coverUrl,
    coverArtId: s.coverArt ?? album.coverArt,
  }));
}

export function buildAlbumMenuItems({
  album,
  client,
  t,
  navigate,
  addToQueue,
  onOpenInfo,
  hideGoToArtist,
}: BuildAlbumMenuItemsParams): MenuItem[] {
  const items: MenuItem[] = [
    {
      type: "action",
      label: t("contextMenu.addToQueue"),
      icon: ListPlus,
      onClick: async () => {
        const tracks = await fetchAlbumTracks(client, album);
        addToQueue(tracks, "next");
      },
    },
    {
      type: "submenu",
      label: t("contextMenu.addToPlaylist"),
      icon: ListMusic,
      renderSubmenu: (close) => (
        <AddToPlaylistSubmenu
          client={client}
          getSongIds={async () => (await fetchAlbumTracks(client, album)).map((track) => track.id)}
          close={close}
        />
      ),
    },
    {
      type: "action",
      label: t("contextMenu.download"),
      icon: Download,
      onClick: async () => {
        const tracks = await fetchAlbumTracks(client, album);
        downloadStore.enqueueTracksAuto(tracks);
      },
    },
    { type: "separator" },
    {
      type: "action",
      label: t("contextMenu.getInfo"),
      icon: Info,
      onClick: onOpenInfo,
    },
  ];

  if (!hideGoToArtist && album.artistId) {
    items.push({
      type: "action",
      label: t("contextMenu.goToArtist"),
      icon: User,
      onClick: () => navigate(`/artists/${album.artistId}`),
    });
  }

  return items;
}
