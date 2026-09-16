import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../lib/i18n";
import { isElectron } from "../../lib/platform";
import { storage } from "../../lib/storage";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUpdateStore } from "../../stores/updateStore";

const LAST_CHECK_STORAGE_KEY = "resonia:update:lastCheckedAt";
const DAY_MS = 24 * 60 * 60 * 1000;
// Une vérification par heure suffit à repérer qu'un jour s'est écoulé depuis la dernière
// vérification, y compris après une mise en veille prolongée de la machine, sans pour autant
// solliciter GitHub en continu.
const POLL_INTERVAL_MS = 60 * 60 * 1000;

/** Vérifie et télécharge/installe les mises à jour EN SILENCE en arrière-plan — au lancement,
 *  puis une fois par heure tant que l'app reste ouverte (utilisateurs qui la laissent tourner en
 *  fond de tâche) — quand le réglage correspondant est activé. Aucune boîte de dialogue pendant
 *  le téléchargement, aucun redémarrage forcé : voir `useUpdateStore.checkAndInstall`.
 *
 *  Une fois l'installation terminée sur disque (statut "ready"), affiche une pop-up avec la
 *  version proposée et ses notes (le corps de la release GitHub, voir `update:check` côté
 *  electron/main/index.ts) pour laisser choisir "Installer" (redémarre tout de suite) ou
 *  "Plus tard" — qui referme juste la pop-up sans rien perdre : le bouton discret de la barre
 *  supérieure (UpdateRestartButton) reste disponible pour redémarrer quand l'utilisateur le
 *  souhaite. "Plus tard" mémorise la version reportée (settingsStore.dismissedUpdateVersion)
 *  pour ne pas rouvrir la pop-up à chaque re-render tant qu'aucune version plus récente n'est
 *  sortie. Ne rend rien côté web. */
export function UpdateNotifier() {
  const { t } = useTranslation();
  const hydrated = useSettingsStore((s) => s.hydrated);
  const checkUpdatesOnLaunch = useSettingsStore((s) => s.checkUpdatesOnLaunch);
  const betaUpdatesEnabled = useSettingsStore((s) => s.betaUpdatesEnabled);
  const dismissedUpdateVersion = useSettingsStore((s) => s.dismissedUpdateVersion);
  const setDismissedUpdateVersion = useSettingsStore((s) => s.setDismissedUpdateVersion);

  const status = useUpdateStore((s) => s.status);
  const version = useUpdateStore((s) => s.version);
  const notes = useUpdateStore((s) => s.notes);
  const relaunch = useUpdateStore((s) => s.relaunch);

  // Le hydrate() du settingsStore résout de façon asynchrone : sans cette garde, une vérification
  // se déclencherait une première fois avec les valeurs par défaut avant que le réglage persisté
  // n'ait eu le temps d'être chargé.
  const startedOnLaunch = useRef(false);
  // Distinct de `dismissedUpdateVersion` (persisté, survit à un redémarrage) : referme la
  // pop-up pour la session en cours dès le clic, avant même que l'écriture asynchrone dans
  // settingsStore n'ait eu le temps de se terminer.
  const [dismissedThisSession, setDismissedThisSession] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectron() || !hydrated || !checkUpdatesOnLaunch) return;

    let cancelled = false;

    async function runIfDue(force: boolean) {
      if (cancelled) return;
      // Une mise à jour déjà trouvée/en cours (déclenchée par le bouton manuel des paramètres,
      // par exemple) ne doit jamais être interrompue ou redemandée par ce vérificateur silencieux.
      const current = useUpdateStore.getState().status;
      if (current === "checking" || current === "downloading" || current === "ready") return;

      if (!force) {
        const last = (await storage.get<number>(LAST_CHECK_STORAGE_KEY)) ?? 0;
        if (Date.now() - last < DAY_MS) return;
      }
      if (cancelled) return;

      await storage.set(LAST_CHECK_STORAGE_KEY, Date.now());
      await useUpdateStore.getState().checkAndInstall(betaUpdatesEnabled);
    }

    if (!startedOnLaunch.current) {
      startedOnLaunch.current = true;
      void runIfDue(true);
    }

    const interval = setInterval(() => void runIfDue(false), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hydrated, checkUpdatesOnLaunch, betaUpdatesEnabled]);

  const showPopup =
    status === "ready" &&
    version !== null &&
    version !== dismissedUpdateVersion &&
    version !== dismissedThisSession;

  if (!showPopup) return null;

  function later() {
    if (version) {
      setDismissedThisSession(version);
      void setDismissedUpdateVersion(version);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-neutral-900 p-6 shadow-xl">
        <h2 className="mb-3 text-center text-sm font-semibold text-white">
          {t("update.available", { version: version ?? "" })}
        </h2>
        <div className="mb-4 max-h-64 overflow-y-auto rounded-lg bg-neutral-800/60 p-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            {t("update.notesTitle")}
          </p>
          {/* Texte brut, jamais interprété comme HTML : les notes proviennent du corps de la
              release GitHub (voir CHANGELOG.md racine + workflows de release), pas de raison de
              faire confiance à ce contenu plus qu'à n'importe quel texte externe. */}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
            {notes?.trim() || t("update.noNotes")}
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
            onClick={() => void relaunch()}
            className="flex-1 rounded-full bg-emerald-600 py-2.5 font-semibold text-white transition hover:bg-emerald-500"
          >
            {t("update.install")}
          </button>
        </div>
      </div>
    </div>
  );
}
