import { Download, Info, ListPlus, Pencil, Play, Trash2 } from "lucide-react";
import type { SubsonicClient } from "@resonia/api-client";
import type { MenuItem } from "./ContextMenu";
import type { Track } from "../../stores/playerStore";
import { downloadStore } from "../../lib/downloads/downloadStore";

interface PlaylistLike {
  id: string;
  name: string;
  coverArt?: string;
}

interface BuildPlaylistMenuItemsParams {
  playlist: PlaylistLike;
  client: SubsonicClient;
  t: (key: string, vars?: Record<string, string | number>) => string;
  playFromStart: (queue: Track[]) => void;
  addToQueue: (tracks: Track[], position?: "next" | "end") => void;
  onOpenInfo: () => void;
  onRename: () => void;
  onDelete: () => void;
}

async function fetchPlaylistTracks(client: SubsonicClient, playlist: PlaylistLike): Promise<Track[]> {
  const coverUrl = playlist.coverArt ? client.getCoverArtUrl(playlist.coverArt, 300) : undefined;
  const full = await client.getPlaylist(playlist.id);
  return full.entry.map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    artistId: s.artistId,
    album: s.album,
    albumId: s.albumId,
    duration: s.duration,
    coverUrl: s.coverArt ? client.getCoverArtUrl(s.coverArt, 300) : coverUrl,
    coverArtId: s.coverArt ?? playlist.coverArt,
  }));
}

export function buildPlaylistMenuItems({
  playlist,
  client,
  t,
  playFromStart,
  addToQueue,
  onOpenInfo,
  onRename,
  onDelete,
}: BuildPlaylistMenuItemsParams): MenuItem[] {
  return [
    {
      type: "action",
      label: t("contextMenu.play"),
      icon: Play,
      onClick: async () => {
        const tracks = await fetchPlaylistTracks(client, playlist);
        if (tracks.length > 0) playFromStart(tracks);
      },
    },
    {
      type: "action",
      label: t("contextMenu.addToQueue"),
      icon: ListPlus,
      onClick: async () => {
        const tracks = await fetchPlaylistTracks(client, playlist);
        addToQueue(tracks, "next");
      },
    },
    {
      type: "action",
      label: t("contextMenu.download"),
      icon: Download,
      onClick: async () => {
        const tracks = await fetchPlaylistTracks(client, playlist);
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
    {
      type: "action",
      label: t("contextMenu.rename"),
      icon: Pencil,
      onClick: onRename,
    },
    {
      type: "action",
      label: t("contextMenu.delete"),
      icon: Trash2,
      danger: true,
      onClick: onDelete,
    },
  ];
}
