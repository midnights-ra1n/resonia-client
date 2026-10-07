import { RestartAlt } from "../../components/icons";
import { useTranslation } from "../../lib/i18n";
import { useUpdateStore } from "../../stores/updateStore";

const MEGABYTE = 1024 * 1024;

/** Taille en mégaoctets avec l'unité et les séparateurs de la langue de l'app (« 13,63 Mo » en
 *  français, « 13.63 MB » en anglais) — Intl fournit l'unité localisée, rien à traduire. */
function formatMegabytes(bytes: number, locale: string, fractionDigits: number): string {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "megabyte",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(bytes / MEGABYTE);
}

/** Mise à jour dans la barre supérieure : pendant le téléchargement en arrière-plan, un petit
 *  encart avec une barre de progression et la taille téléchargée ; une fois terminé, le bouton
 *  pour redémarrer et installer tout de suite (sinon l'installation se fait à la fermeture de
 *  l'app, voir UpdateNotifier). Rien le reste du temps. */
export function UpdateIndicator() {
  const { t, locale } = useTranslation();
  const status = useUpdateStore((s) => s.status);
  const version = useUpdateStore((s) => s.version);
  const progress = useUpdateStore((s) => s.progress);
  const downloadedBytes = useUpdateStore((s) => s.downloadedBytes);
  const totalBytes = useUpdateStore((s) => s.totalBytes);
  const relaunch = useUpdateStore((s) => s.relaunch);

  if (status === "downloading") {
    return (
      <div
        role="status"
        className="flex h-9 w-60 flex-col justify-center gap-1 rounded-xl border border-white/5 bg-surface-2 px-3 shadow-e1 animate-fade-in"
      >
        <div className="flex items-baseline justify-between gap-2 text-[11px] leading-none">
          <span className="truncate text-neutral-300">{t("update.downloading")}</span>
          {totalBytes > 0 && (
            <span className="shrink-0 tabular-nums text-neutral-500">
              {formatMegabytes(downloadedBytes, locale, 2)} / {formatMegabytes(totalBytes, locale, 0)}
            </span>
          )}
        </div>
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-neutral-800"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  }

  if (status !== "ready") return null;

  return (
    <button
      type="button"
      onClick={() => void relaunch()}
      title={version ? t("update.restartTooltip", { version }) : undefined}
      className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-semibold text-on-accent transition hover:bg-accent-hover animate-fade-in"
    >
      <RestartAlt size={14} />
      {t("update.restartButton")}
    </button>
  );
}
