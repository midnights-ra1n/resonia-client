import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { MarqueeText } from "../../components/MarqueeText";
import { downloadStore, type DownloadProgressInfo } from "../../lib/downloads/downloadStore";
import { formatDownloadSize } from "../../lib/downloads/formatDownloadSize";
import { useTranslation } from "../../lib/i18n";
import type { Track } from "../../stores/playerStore";

export interface PendingDownloadItem {
  key: string;
  track: Track;
  qualityId: string;
}

const EMPTY_PROGRESS: DownloadProgressInfo = { bytesDownloaded: 0, totalBytes: -1, bytesPerSecond: 0 };

/** Une ligne de piste "en cours de téléchargement" (en cours ou en file d'attente) — réutilisée
 *  par la page Téléchargements et le menu de l'indicateur global (voir DownloadsIndicator). */
export function DownloadProgressRow({ item }: { item: PendingDownloadItem }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<DownloadProgressInfo>(EMPTY_PROGRESS);
  const [status, setStatus] = useState<"queued" | "downloading" | "error">("queued");

  useEffect(() => {
    return downloadStore.onStatusChange(item.track.id, item.qualityId, (s, p) => {
      if (s === "queued" || s === "downloading" || s === "error") setStatus(s);
      setProgress(p);
    });
    // `item.key` (clé de la ligne dans la liste appelante) force déjà un remount complet du
    // composant quand la piste concernée change, réinitialisant `progress`/`status` — inutile
    // de le faire ici en plus.
  }, [item.track.id, item.qualityId]);

  const unitKb = t("downloads.unitKb");
  const unitMb = t("downloads.unitMb");
  const percent = progress.totalBytes > 0 ? Math.min(100, (progress.bytesDownloaded / progress.totalBytes) * 100) : 0;

  const detail =
    status === "queued"
      ? t("downloads.statusQueued")
      : status === "error"
        ? t("downloads.statusError")
        : progress.totalBytes > 0
          ? `${formatDownloadSize(progress.bytesDownloaded, unitKb, unitMb)} / ${formatDownloadSize(progress.totalBytes, unitKb, unitMb)}` +
            (progress.bytesPerSecond > 0 ? ` · ${formatDownloadSize(progress.bytesPerSecond, unitKb, unitMb)}/s` : "")
          : t("downloads.statusDownloading");

  return (
    <div className="grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-md px-2 py-3">
      <div className="flex items-center justify-center text-neutral-400">
        {status === "downloading" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      </div>
      <div className="min-w-0">
        <MarqueeText text={item.track.title} className="text-sm text-white" />
        <MarqueeText text={item.track.artist} className="text-xs text-neutral-400" />
        {status === "downloading" && progress.totalBytes > 0 && (
          <div className="mt-1.5 h-1 w-full max-w-xs overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
      <div className="text-right text-xs text-neutral-400 tabular-nums whitespace-nowrap">{detail}</div>
    </div>
  );
}
