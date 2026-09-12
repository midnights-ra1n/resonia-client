import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { downloadStore, type DownloadBatchStats } from "../../lib/downloads/downloadStore";
import { formatDownloadSize } from "../../lib/downloads/formatDownloadSize";
import { useTranslation } from "../../lib/i18n";
import { DownloadProgressRow, type PendingDownloadItem } from "./DownloadProgressRow";

const VISIBLE_ITEMS = 3;

/** Icône globale (barre supérieure) visible uniquement pendant qu'une campagne de
 *  téléchargement est active — au clic, un panneau récapitule la progression d'ensemble
 *  (pistes, taille, débit) et les 3 prochains téléchargements (celui en cours + 2 suivants). */
export function DownloadsIndicator() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DownloadBatchStats | null>(() => downloadStore.getBatchStats());
  const [pending, setPending] = useState<PendingDownloadItem[]>(() => downloadStore.getPendingItems());
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubBatch = downloadStore.onBatchChange((next) => {
      setStats(next);
      // Campagne terminée : referme aussi le panneau, plutôt que de le laisser rouvert vide
      // au prochain démarrage d'un téléchargement.
      if (!next) setOpen(false);
    });
    const unsubQueue = downloadStore.onQueueChange(() => setPending(downloadStore.getPendingItems()));
    return () => {
      unsubBatch();
      unsubQueue();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!stats) return null;

  const unitKb = t("downloads.unitKb");
  const unitMb = t("downloads.unitMb");
  const percent = stats.totalBytes > 0 ? Math.min(100, (stats.downloadedBytes / stats.totalBytes) * 100) : 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
        title={t("downloads.indicatorHeading")}
      >
        <Download size={18} />
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-500" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-white/10 bg-neutral-900/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <h3 className="text-sm font-semibold text-white">{t("downloads.indicatorHeading")}</h3>

          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${percent}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-neutral-400">
              <span>{t("downloads.indicatorTracks", { done: stats.completedTracks, total: stats.totalTracks })}</span>
              <span className="tabular-nums">
                {formatDownloadSize(stats.downloadedBytes, unitKb, unitMb)} / {formatDownloadSize(stats.totalBytes, unitKb, unitMb)}
              </span>
            </div>
            {stats.bytesPerSecond > 0 && (
              <div className="mt-0.5 text-right text-xs text-neutral-500 tabular-nums">
                {formatDownloadSize(stats.bytesPerSecond, unitKb, unitMb)}/s
              </div>
            )}
          </div>

          <div className="mt-3 divide-y divide-white/5 border-t border-white/5">
            {pending.slice(0, VISIBLE_ITEMS).map((item) => (
              <DownloadProgressRow key={item.key} item={item} />
            ))}
          </div>

          <Link
            to="/downloads"
            onClick={() => setOpen(false)}
            className="mt-3 block rounded-md px-2 py-1.5 text-center text-xs font-medium text-neutral-400 transition hover:bg-white/10 hover:text-white"
          >
            {t("downloads.viewAll")}
          </Link>
        </div>
      )}
    </div>
  );
}
