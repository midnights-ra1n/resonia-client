import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../lib/i18n";
import { isTauri } from "../../lib/platform";
import { useSettingsStore } from "../../stores/settingsStore";
import { checkForUpdate, relaunchApp } from "../../lib/update/updateService";

type Status = "downloading" | "installed" | "error";

/** Vérifie une seule fois, au lancement de l'app de bureau (si le réglage correspondant est
 *  activé), si une mise à jour est disponible sur le canal choisi (stable ou beta, voir
 *  updateService.ts) et l'installe automatiquement en arrière-plan — aucune confirmation, aucun
 *  lien vers la page GitHub : seule une boîte de dialogue d'avancement s'affiche pendant le
 *  téléchargement/installation, puis disparaît et relance l'app dans sa nouvelle version dès que
 *  c'est terminé. Ne rend rien côté web ni tant qu'aucune mise à jour n'est en cours d'installation. */
export function UpdateNotifier() {
  const { t } = useTranslation();
  const hydrated = useSettingsStore((s) => s.hydrated);
  const checkUpdatesOnLaunch = useSettingsStore((s) => s.checkUpdatesOnLaunch);
  const betaUpdatesEnabled = useSettingsStore((s) => s.betaUpdatesEnabled);
  const [status, setStatus] = useState<Status | null>(null);
  const [progress, setProgress] = useState(0);
  const [targetVersion, setTargetVersion] = useState<string | null>(null);
  // Le hydrate() du settingsStore résout de façon asynchrone : sans cette garde, une vérification
  // se déclencherait une première fois avec les valeurs par défaut avant que le réglage persisté
  // n'ait eu le temps d'être chargé.
  const started = useRef(false);

  useEffect(() => {
    if (!isTauri() || !hydrated || started.current) return;
    if (!checkUpdatesOnLaunch) return;
    started.current = true;

    let cancelled = false;
    checkForUpdate(betaUpdatesEnabled)
      .then(async (update) => {
        if (cancelled || !update) return;
        setTargetVersion(update.version);
        setStatus("downloading");
        try {
          await update.downloadAndInstall((percent) => {
            if (!cancelled) setProgress(percent);
          });
          if (cancelled) return;
          setStatus("installed");
          await relaunchApp();
        } catch (err) {
          console.error("[update] Échec du téléchargement/installation", err);
          if (!cancelled) setStatus("error");
        }
      })
      .catch((err) => console.warn("[update] Échec de la vérification de mise à jour", err));

    return () => {
      cancelled = true;
    };
  }, [hydrated, checkUpdatesOnLaunch, betaUpdatesEnabled]);

  if (!status) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-neutral-900 p-6 text-center shadow-xl">
        {status === "error" ? (
          <>
            <p className="mb-4 text-sm text-red-400">{t("update.error")}</p>
            <button
              type="button"
              onClick={() => setStatus(null)}
              className="w-full rounded-full bg-neutral-800 py-2.5 font-semibold text-white transition hover:bg-neutral-700"
            >
              {t("common.confirm")}
            </button>
          </>
        ) : status === "installed" ? (
          <p className="text-sm text-neutral-300">{t("update.restarting")}</p>
        ) : (
          <>
            <h2 className="mb-4 text-sm font-semibold text-white">
              {t("update.installing", { version: targetVersion ?? "" })}
            </h2>
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 w-full overflow-hidden rounded-full bg-neutral-800"
            >
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-neutral-500">{progress}%</p>
          </>
        )}
      </div>
    </div>
  );
}
