import { useEffect, useState } from "react";
import type { PlaylistWithSongsDTO } from "@resonia/api-client";
import { InfoModal, type InfoRow, type InfoSection } from "./InfoModal";
import { useTranslation } from "../lib/i18n/useTranslation";
import { useServersStore } from "../stores/serversStore";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { formatAlbumDuration } from "../lib/format/duration";
import { formatDate } from "../lib/format/info";

interface PlaylistInfoModalProps {
  playlist: { id: string; name: string; songCount: number };
  coverUrl?: string;
  onClose: () => void;
}

export function PlaylistInfoModal({ playlist, coverUrl, onClose }: PlaylistInfoModalProps) {
  const { t, locale } = useTranslation();
  const activeServerId = useServersStore((s) => s.activeServerId);
  const servers = useServersStore((s) => s.servers);
  const [details, setDetails] = useState<PlaylistWithSongsDTO | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const server = servers.find((s) => s.id === activeServerId);
    if (!server) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    getClientForServer(server)
      .getPlaylist(playlist.id)
      .then((result) => {
        if (!cancelled) setDetails(result);
      })
      .catch((err) => {
        console.warn("[info] Fiche de la playlist indisponible", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [playlist.id, activeServerId, servers]);

  const d = details;
  const songCount = d?.songCount ?? playlist.songCount;

  const general: InfoRow[] = [];
  if (d?.owner) general.push({ label: t("info.owner"), value: d.owner });
  general.push({
    label: t("info.tracks"),
    value: d ? `${songCount} · ${formatAlbumDuration(d.duration, t)}` : String(songCount),
  });
  if (d?.public !== undefined) general.push({ label: t("info.visibility"), value: d.public ? t("info.public") : t("info.private") });
  const created = formatDate(d?.created, locale);
  if (created) general.push({ label: t("info.created"), value: created });
  const updated = formatDate(d?.changed, locale);
  if (updated) general.push({ label: t("info.updated"), value: updated });
  if (d?.comment) general.push({ label: t("info.description"), value: d.comment });

  // Artistes les plus présents : donne une idée du contenu sans ouvrir la playlist.
  const artistCounts = new Map<string, number>();
  for (const song of d?.entry ?? []) artistCounts.set(song.artist, (artistCounts.get(song.artist) ?? 0) + 1);
  const topArtists = Array.from(artistCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
  if (topArtists.length > 0) general.push({ label: t("info.topArtists"), value: topArtists.join(", ") });

  const sections: InfoSection[] = [{ rows: general }];

  return (
    <InfoModal
      kind={t("info.kindPlaylist")}
      title={d?.name ?? playlist.name}
      subtitle={d?.owner}
      coverUrl={coverUrl}
      sections={sections}
      loading={!d && !failed}
      notice={failed ? t("info.detailsUnavailable") : undefined}
      onClose={onClose}
    />
  );
}
