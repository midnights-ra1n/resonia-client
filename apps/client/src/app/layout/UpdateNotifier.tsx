import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../lib/i18n";
import { isElectron } from "../../lib/platform";
import { useSettingsStore } from "../../stores/settingsStore";
import { checkForUpdate, relaunchApp, type AppUpdate } from "../../lib/update/updateService";

type Status = "available" | "downloading" | "installed" | "error";

/** Vérifie une seule fois, au lancement de l'app de bureau (si le réglage correspondant est
 *  activé), si une mise à jour est disponible sur le canal choisi (stable ou beta, voir
 *  updateService.ts). Contrairement à l'ancien comportement (installation automatique et
 *  silencieuse), affiche maintenant la version proposée et ses notes (le corps de la release
 *  GitHub, voir `update:check` côté electron/main/index.ts) et laisse l'utilisateur choisir
 *  d'installer tout de suite ou de reporter — "Plus tard" mémorise la version reportée
 *  (settingsStore.dismissedUpdateVersion) pour ne plus la re-proposer aux lancements suivants
 *  tant qu'aucune version plus récente n'est sortie. Ne rend rien côté web. */
export function UpdateNotifier() {
  const { t } = useTranslation();
  const hydrated = useSettingsStore((s) => s.hydrated);
  const checkUpdatesOnLaunch = useSettingsStore((s) => s.checkUpdatesOnLaunch);
  const betaUpdatesEnabled = useSettingsStore((s) => s.betaUpdatesEnabled);
  const dismissedUpdateVersion = useSettingsStore((s) => s.dismissedUpdateVersion);
  const setDismissedUpdateVersion = useSettingsStore((s) => s.setDismissedUpdateVersion);
  const [status, setStatus] = useState<Status | null>(null);
  const [progress, setProgress] = useState(0);
  const [pendingUpdate, setPendingUpdate] = useState<AppUpdate | null>(null);
  // Le hydrate() du settingsStore résout de façon asynchrone : sans cette garde, une vérification
  // se déclencherait une première fois avec les valeurs par défaut avant que le réglage persisté
  // n'ait eu le temps d'être chargé.
  const started = useRef(false);

  useEffect(() => {
    if (!isElectron() || !hydrated || started.current) return;
    if (!checkUpdatesOnLaunch) return;
    started.current = true;

    let cancelled = false;
    checkForUpdate(betaUpdatesEnabled)
      .then((update) => {
        if (cancelled || !update) return;
        if (update.version === dismissedUpdateVersion) return;
        setPendingUpdate(update);
        setStatus("available");
      })
      .catch((err) => console.warn("[update] Échec de la vérification de mise à jour", err));

    return () => {
      cancelled = true;
    };
    // `dismissedUpdateVersion` volontairement absent des dépendances : ne doit influencer que
    // la vérification déclenchée UNE FOIS au lancement (voir `started`), jamais en redéclencher
    // une nouvelle si l'utilisateur reporte une mise à jour en cours de session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, checkUpdatesOnLaunch, betaUpdatesEnabled]);

  async function install() {
    if (!pendingUpdate) return;
    setStatus("downloading");
    try {
      await pendingUpdate.downloadAndInstall((percent) => setProgress(percent));
      setStatus("installed");
      await relaunchApp();
    } catch (err) {
      console.error("[update] Échec du téléchargement/installation", err);
      setStatus("error");
    }
  }

  function later() {
    if (pendingUpdate) void setDismissedUpdateVersion(pendingUpdate.version);
    setStatus(null);
    setPendingUpdate(null);
  }

  if (!status) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-neutral-900 p-6 shadow-xl">
        {status === "error" ? (
          <>
            <p className="mb-4 text-center text-sm text-red-400">{t("update.error")}</p>
            <button
              type="button"
              onClick={() => setStatus(null)}
              className="w-full rounded-full bg-neutral-800 py-2.5 font-semibold text-white transition hover:bg-neutral-700"
            >
              {t("common.confirm")}
            </button>
          </>
        ) : status === "installed" ? (
          <p className="text-center text-sm text-neutral-300">{t("update.restarting")}</p>
        ) : status === "available" ? (
          <>
            <h2 className="mb-3 text-center text-sm font-semibold text-white">
              {t("update.available", { version: pendingUpdate?.version ?? "" })}
            </h2>
            <div className="mb-4 max-h-64 overflow-y-auto rounded-lg bg-neutral-800/60 p-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                {t("update.notesTitle")}
              </p>
              {/* Texte brut, jamais interprété comme HTML : les notes proviennent du corps de la
                  release GitHub (voir CHANGELOG.md racine + workflows de release), pas de raison
                  de faire confiance à ce contenu plus qu'à n'importe quel texte externe. */}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
                {pendingUpdate?.notes?.trim() || t("update.noNotes")}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={later}
                className="flex-1 rounded-full bg-neutral-800 py-2.5 font-semibold text-white transition hover:bg-neutral-700"
              >
                {t("update.later")}
              </button>
              <button
                type="button"
                onClick={() => void install()}
                className="flex-1 rounded-full bg-emerald-600 py-2.5 font-semibold text-white transition hover:bg-emerald-500"
              >
                {t("update.install")}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-4 text-center text-sm font-semibold text-white">
              {t("update.installing", { version: pendingUpdate?.version ?? "" })}
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
            <p className="mt-2 text-center text-xs text-neutral-500">{progress}%</p>
          </>
        )}
      </div>
    </div>
  );
}
