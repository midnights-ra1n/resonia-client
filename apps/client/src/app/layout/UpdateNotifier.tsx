import { useEffect, useRef } from "react";
import { isTauri } from "../../lib/platform";
import { storage } from "../../lib/storage";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUpdateStore } from "../../stores/updateStore";

const LAST_CHECK_STORAGE_KEY = "resonia:update:lastCheckedAt";
const DAY_MS = 24 * 60 * 60 * 1000;
// Une vérification par heure suffit à repérer qu'un jour s'est écoulé depuis la dernière
// vérification, y compris après une mise en veille prolongée de la machine, sans pour autant
// solliciter GitHub en continu.
const POLL_INTERVAL_MS = 60 * 60 * 1000;

/** Ne rend rien : gère uniquement la vérification et l'installation automatiques et silencieuses
 *  des mises à jour en arrière-plan — au lancement, puis une fois par jour tant que l'app reste
 *  ouverte (utilisateurs qui la laissent tourner en fond de tâche) — quand le réglage
 *  correspondant est activé. Aucune boîte de dialogue, aucun redémarrage forcé : une fois
 *  l'installation terminée sur disque, le store updateStore passe en statut "ready" et c'est le
 *  bouton "Redémarrer pour installer la mise à jour" de la barre supérieure (UpdateRestartButton)
 *  qui prend le relais pour laisser l'utilisateur choisir quand redémarrer. */
export function UpdateNotifier() {
  const hydrated = useSettingsStore((s) => s.hydrated);
  const checkUpdatesOnLaunch = useSettingsStore((s) => s.checkUpdatesOnLaunch);
  const betaUpdatesEnabled = useSettingsStore((s) => s.betaUpdatesEnabled);
  // Le hydrate() du settingsStore résout de façon asynchrone : sans cette garde, une vérification
  // se déclencherait une première fois avec les valeurs par défaut avant que le réglage persisté
  // n'ait eu le temps d'être chargé.
  const startedOnLaunch = useRef(false);

  useEffect(() => {
    if (!isTauri() || !hydrated || !checkUpdatesOnLaunch) return;

    let cancelled = false;

    async function runIfDue(force: boolean) {
      if (cancelled) return;
      // Une mise à jour déjà trouvée/en cours (déclenchée par le bouton manuel des paramètres,
      // par exemple) ne doit jamais être interrompue ou redemandée par ce vérificateur silencieux.
      const status = useUpdateStore.getState().status;
      if (
        status === "checking" ||
        status === "downloading" ||
        status === "ready"
      )
        return;

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

  return null;
}
