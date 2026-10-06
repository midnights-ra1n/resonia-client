import { useEffect, useState } from "react";
import type { AlbumDetailsDTO, AlbumSummary, ContributorDTO } from "@resonia/api-client";
import { InfoModal, type InfoRow, type InfoSection } from "./InfoModal";
import { useTranslation } from "../lib/i18n/useTranslation";
import { useServersStore } from "../stores/serversStore";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { formatAlbumDuration } from "../lib/format/duration";
import { formatDate, formatFileSize, formatItemDate, groupContributors, joinGenres } from "../lib/format/info";

interface AlbumInfoModalProps {
  album: Pick<AlbumSummary, "id" | "name" | "artist" | "songCount" | "duration" | "year">;
  coverUrl?: string;
  onClose: () => void;
}

export function AlbumInfoModal({ album, coverUrl, onClose }: AlbumInfoModalProps) {
  const { t, locale } = useTranslation();
  const activeServerId = useServersStore((s) => s.activeServerId);
  const servers = useServersStore((s) => s.servers);
  const [details, setDetails] = useState<AlbumDetailsDTO | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const server = servers.find((s) => s.id === activeServerId);
    if (!server) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    getClientForServer(server)
      .getAlbumDetails(album.id)
      .then((result) => {
        if (!cancelled) setDetails(result);
      })
      .catch((err) => {
        console.warn("[info] Fiche de l'album indisponible", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [album.id, activeServerId, servers]);

  const d = details;
  const songs = d?.song ?? [];
  const artist = d?.displayArtist || d?.artist || album.artist;
  const songCount = d?.songCount ?? album.songCount;

  const general: InfoRow[] = [{ label: t("info.artist"), value: artist }];
  const year = d?.year ?? album.year;
  if (year) general.push({ label: t("info.year"), value: String(year) });
  const original = formatItemDate(d?.originalReleaseDate, locale);
  if (original && original !== String(year)) general.push({ label: t("info.originalRelease"), value: original });
  if (d?.releaseTypes?.length) general.push({ label: t("info.releaseType"), value: d.releaseTypes.join(", ") });
  const genres = joinGenres(d?.genres, d?.genre);
  if (genres) general.push({ label: t("info.genre"), value: genres });
  if (d?.recordLabels?.length) general.push({ label: t("info.label"), value: d.recordLabels.map((l) => l.name).join(", ") });
  general.push({
    label: t("info.tracks"),
    value: `${songCount} · ${formatAlbumDuration(d?.duration ?? album.duration, t)}`,
  });
  const discs = songs.reduce((max, s) => Math.max(max, s.discNumber ?? 1), 0);
  if (discs > 1) general.push({ label: t("info.discs"), value: String(discs) });
  if (d?.isCompilation) general.push({ label: t("info.compilation"), value: t("info.yes") });

  // Crédits de l'album : réunion des crédits de chaque titre (compositeurs, producteurs...).
  const allContributors: ContributorDTO[] = songs.flatMap((s) => s.contributors ?? []);
  const credits = groupContributors(allContributors, t);
  if (credits.length === 0) {
    const composers = Array.from(new Set(songs.map((s) => s.displayComposer).filter((c): c is string => !!c)));
    if (composers.length) credits.push({ label: t("info.roleComposer"), value: composers.join(", ") });
  }

  const files: InfoRow[] = [];
  const formats = Array.from(new Set(songs.map((s) => s.suffix?.toUpperCase()).filter((f): f is string => !!f)));
  if (formats.length) files.push({ label: t("info.formats"), value: formats.join(", ") });
  const totalSize = songs.reduce((sum, s) => sum + (s.size ?? 0), 0);
  if (totalSize > 0) files.push({ label: t("info.totalSize"), value: formatFileSize(totalSize, locale, t) });

  const library: InfoRow[] = [];
  if (d?.playCount !== undefined) library.push({ label: t("info.playCount"), value: String(d.playCount) });
  const played = formatDate(d?.played, locale);
  if (played) library.push({ label: t("info.lastPlayed"), value: played });
  const created = formatDate(d?.created, locale);
  if (created) library.push({ label: t("info.added"), value: created });
  if (d?.copyright) library.push({ label: t("info.copyright"), value: d.copyright });

  const sections: InfoSection[] = [{ rows: general }];
  if (d) sections.push({ title: t("info.sectionCredits"), rows: credits, emptyText: t("info.noCredits") });
  sections.push({ title: t("info.sectionFiles"), rows: files });
  sections.push({ title: t("info.sectionLibrary"), rows: library });

  return (
    <InfoModal
      kind={t("info.kindAlbum")}
      title={d?.name ?? album.name}
      subtitle={artist}
      coverUrl={coverUrl}
      badges={formats}
      sections={sections}
      loading={!d && !failed}
      notice={failed ? t("info.detailsUnavailable") : undefined}
      onClose={onClose}
    />
  );
}
