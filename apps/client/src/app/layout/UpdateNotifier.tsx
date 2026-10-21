import { useEffect, useRef } from "react";
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
// Au-delà, les notes de version sont tronquées : une boîte de dialogue native ne défile pas.
const MAX_NOTES_LENGTH = 1200;

function truncateNotes(notes: string): string {
  if (notes.length <= MAX_NOTES_LENGTH) return notes;
  const cut = notes.lastIndexOf("\n", MAX_NOTES_LENGTH);
  return `${notes.slice(0, cut > 0 ? cut : MAX_NOTES_LENGTH).trimEnd()}\n…`;
}

/** Vérifie et télécharge les mises à jour en arrière-plan — au lancement, puis une fois par
 *  heure tant que l'app reste ouverte (utilisateurs qui la laissent tourner en fond de tâche) —
 *  quand le réglage correspondant est activé. Le téléchargement est signalé discrètement dans la
 *  barre supérieure (UpdateIndicator), sans jamais interrompre l'écoute ; la mise à jour
 *  s'installe ensuite d'elle-même à la prochaine fermeture de l'app.
 *
 *  Une fois le téléchargement terminé (statut "ready"), ouvre une pop-up NATIVE du système
 *  (voir `update:prompt` côté electron/main/updater.ts) avec la version et ses notes, pour
 *  laisser choisir "Redémarrer maintenant" ou "Plus tard" — qui ne perd rien : le bouton de la
 *  barre supérieure reste disponible, et l'installation se fera de toute façon à la fermeture.
 *  "Plus tard" mémorise la version reportée (settingsStore.dismissedUpdateVersion) pour ne pas
 *  rouvrir la pop-up à chaque lancement tant qu'aucune version plus récente n'est sortie. Ne
 *  rend rien. */
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
  // Version pour laquelle la pop-up a déjà été ouverte pendant cette session : une seule
  // ouverture par version, même si le composant se ré-affiche pendant qu'elle est à l'écran.
  const promptedVersion = useRef<string | null>(null);

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
      await useUpdateStore.getState().checkAndInstall(betaUpdatesEnabled, t("update.adminPrompt"));
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
  }, [hydrated, checkUpdatesOnLaunch, betaUpdatesEnabled, t]);

  useEffect(() => {
    if (status !== "ready" || !version || version === dismissedUpdateVersion) return;
    if (promptedVersion.current === version) return;
    promptedVersion.current = version;

    const body = notes?.trim() ? `${t("update.notesTitle")}\n${truncateNotes(notes.trim())}` : t("update.noNotes");
    void window
      .resonia!.update.prompt({
        title: t("update.promptTitle"),
        message: t("update.available", { version }),
        detail: `${body}\n\n${t("update.installOnQuit")}`,
        restart: t("update.restartNow"),
        later: t("update.later"),
      })
      .then((restart) => {
        if (restart) void relaunch();
        else void setDismissedUpdateVersion(version);
      });
  }, [status, version, notes, dismissedUpdateVersion, relaunch, setDismissedUpdateVersion, t]);

  return null;
}
