export function formatTrackDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatAlbumDuration(
  seconds: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hours > 0) return t("album.durationHoursMinutes", { hours, minutes: mins });
  return t("album.durationMinutes", { minutes: mins });
}
