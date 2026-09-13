import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "../../lib/i18n";
import { isTauri } from "../../lib/platform";
import {
  checkForUpdate,
  relaunchApp,
  type AppUpdate,
} from "../../lib/update/updateService";

type Status = "idle" | "downloading" | "installed" | "error";

/** Vérifie une seule fois, au lancement de l'app de bureau, si une mise à jour est disponible
 *  (voir tauri.conf.json / tauri.beta.conf.json pour les endpoints par canal) et propose de
 *  l'installer. Ne rend rien côté web ni tant qu'aucune mise à jour n'est trouvée. */
export function UpdateNotifier() {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    checkForUpdate()
      .then((found) => {
        if (!cancelled && found) setUpdate(found);
      })
      .catch((err) => console.warn("[update] Échec de la vérification de mise à jour", err));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update || dismissed) return null;

  const handleInstall = async () => {
    setStatus("downloading");
    try {
      await update.downloadAndInstall(setProgress);
      setStatus("installed");
    } catch (err) {
      console.error("[update] Échec du téléchargement/installation", err);
      setStatus("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={() => status === "idle" && setDismissed(true)}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-neutral-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {t("update.title", { version: update.version })}
          </h2>
          {status === "idle" && (
            <button
              onClick={() => setDismissed(true)}
              className="text-neutral-400 hover:text-white"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <p className="mb-3 text-sm text-neutral-400">
          {t("update.currentVersion", { version: update.currentVersion })}
        </p>

        {update.notes && (
          <div className="mb-4 max-h-48 overflow-y-auto rounded-lg bg-neutral-800 p-3 text-sm text-neutral-300 whitespace-pre-wrap">
            {update.notes}
          </div>
        )}

        {status === "error" && (
          <p className="mb-3 text-sm text-red-500">{t("update.error")}</p>
        )}

        {status === "installed" ? (
          <button
            type="button"
            onClick={() => relaunchApp()}
            className="w-full rounded-full bg-emerald-500 py-2.5 font-semibold text-black transition hover:bg-emerald-400"
          >
            {t("update.restart")}
          </button>
        ) : (
          <div className="flex gap-3">
            {status === "idle" && (
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="flex-1 rounded-full bg-neutral-800 py-2.5 font-semibold text-white transition hover:bg-neutral-700"
              >
                {t("update.later")}
              </button>
            )}
            <button
              type="button"
              onClick={handleInstall}
              disabled={status === "downloading"}
              className="flex-1 rounded-full bg-emerald-500 py-2.5 font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {status === "downloading"
                ? t("update.downloading", { percent: progress })
                : t("update.install")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
