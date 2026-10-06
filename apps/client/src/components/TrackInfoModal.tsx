import { useEffect, useState } from "react";
import type { SongDetailsDTO } from "@resonia/api-client";
import { InfoModal, type InfoRow, type InfoSection } from "./InfoModal";
import { useTranslation } from "../lib/i18n/useTranslation";
import { useServersStore } from "../stores/serversStore";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { formatTrackDuration } from "../lib/format/duration";
import {
  formatChannels,
  formatDate,
  formatFileSize,
  formatGain,
  formatSampleRate,
  groupContributors,
  joinGenres,
} from "../lib/format/info";

interface TrackInfoModalProps {
  songId: string;
  /** Infos déjà connues de l'appelant : affichées immédiatement, puis complétées par la fiche
   *  serveur (`getSong`) — et seules affichées si elle est indisponible (hors ligne...). */
  fallback: { title: string; artist: string; album: string; duration: number; suffix?: string; bitRate?: number };
  coverUrl?: string;
  onClose: () => void;
}

export function TrackInfoModal({ songId, fallback, coverUrl, onClose }: TrackInfoModalProps) {
  const { t, locale } = useTranslation();
  const activeServerId = useServersStore((s) => s.activeServerId);
  const servers = useServersStore((s) => s.servers);
  const [details, setDetails] = useState<SongDetailsDTO | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const server = servers.find((s) => s.id === activeServerId);
    if (!server) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    getClientForServer(server)
      .getSong(songId)
      .then((song) => {
        if (!cancelled) setDetails(song);
      })
      .catch((err) => {
        console.warn("[info] Fiche du titre indisponible", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [songId, activeServerId, servers]);

  const d = details;
  const title = d?.title ?? fallback.title;
  const artist = d?.artists?.length ? d.artists.map((a) => a.name).join(", ") : d?.displayArtist || d?.artist || fallback.artist;
  const albumArtist = d?.albumArtists?.length ? d.albumArtists.map((a) => a.name).join(", ") : d?.displayAlbumArtist;
  const suffix = d?.suffix ?? fallback.suffix;
  const bitRate = d?.bitRate ?? fallback.bitRate;

  const general: InfoRow[] = [
    { label: t("info.artist"), value: artist },
    { label: t("info.album"), value: d?.album ?? fallback.album },
  ];
  if (albumArtist && albumArtist !== artist) general.push({ label: t("info.albumArtist"), value: albumArtist });
  if (d?.track) {
    general.push({
      label: t("info.trackNumber"),
      value: d.discNumber ? t("info.trackOnDisc", { track: d.track, disc: d.discNumber }) : String(d.track),
    });
  }
  if (d?.year) general.push({ label: t("info.year"), value: String(d.year) });
  const genres = joinGenres(d?.genres, d?.genre);
  if (genres) general.push({ label: t("info.genre"), value: genres });
  general.push({ label: t("info.duration"), value: formatTrackDuration(d?.duration ?? fallback.duration) });
  if (d?.bpm) general.push({ label: t("info.bpm"), value: String(d.bpm) });

  // Crédits : `contributors` (OpenSubsonic, Navidrome ≥ 0.55) en priorité ; sinon le seul champ
  // compositeur exposé par l'API Subsonic classique.
  const credits: InfoRow[] = d ? groupContributors(d.contributors, t) : [];
  if (d && credits.length === 0 && d.displayComposer) credits.push({ label: t("info.roleComposer"), value: d.displayComposer });

  const file: InfoRow[] = [];
  if (suffix) file.push({ label: t("info.format"), value: suffix.toUpperCase() + (d?.contentType ? ` · ${d.contentType}` : "") });
  if (bitRate) file.push({ label: t("info.bitrate"), value: t("info.bitrateValue", { value: bitRate }) });
  if (d?.samplingRate) file.push({ label: t("info.sampleRate"), value: formatSampleRate(d.samplingRate, locale, t) });
  if (d?.bitDepth) file.push({ label: t("info.bitDepth"), value: t("info.bitDepthValue", { value: d.bitDepth }) });
  if (d?.channelCount) file.push({ label: t("info.channels"), value: formatChannels(d.channelCount, t) });
  if (d?.size) file.push({ label: t("info.size"), value: formatFileSize(d.size, locale, t) });
  if (d?.replayGain?.trackGain !== undefined) {
    file.push({ label: t("info.replayGain"), value: formatGain(d.replayGain.trackGain, locale) });
  }
  if (d?.isrc?.length) file.push({ label: t("info.isrc"), value: d.isrc.join(", "), mono: true });
  if (d?.path) file.push({ label: t("info.path"), value: d.path, mono: true });

  const library: InfoRow[] = [];
  if (d?.playCount !== undefined) library.push({ label: t("info.playCount"), value: String(d.playCount) });
  const played = formatDate(d?.played, locale);
  if (played) library.push({ label: t("info.lastPlayed"), value: played });
  const created = formatDate(d?.created, locale);
  if (created) library.push({ label: t("info.added"), value: created });
  if (d?.userRating) library.push({ label: t("info.rating"), value: "★".repeat(d.userRating) + "☆".repeat(5 - d.userRating) });
  if (d?.comment) library.push({ label: t("info.comment"), value: d.comment });

  const sections: InfoSection[] = [{ rows: general }];
  if (d) sections.push({ title: t("info.sectionCredits"), rows: credits, emptyText: t("info.noCredits") });
  sections.push({ title: t("info.sectionFile"), rows: file });
  sections.push({ title: t("info.sectionLibrary"), rows: library });

  const badges: string[] = [];
  if (suffix) badges.push(suffix.toUpperCase());
  if (d?.bitDepth && d.samplingRate) badges.push(`${d.bitDepth} bit · ${formatSampleRate(d.samplingRate, locale, t)}`);
  else if (bitRate) badges.push(t("info.bitrateValue", { value: bitRate }));
  if (d?.explicitStatus === "explicit") badges.push(t("info.explicit"));

  return (
    <InfoModal
      kind={t("info.kindTrack")}
      title={title}
      subtitle={artist}
      coverUrl={coverUrl}
      badges={badges}
      sections={sections}
      loading={!d && !failed}
      notice={failed ? t("info.detailsUnavailable") : undefined}
      onClose={onClose}
    />
  );
}
