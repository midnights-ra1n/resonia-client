import { ArrowClockwise } from "@phosphor-icons/react";
import { useTranslation } from "../../lib/i18n";
import { useUpdateStore } from "../../stores/updateStore";

/** Bouton de la barre supérieure, visible uniquement une fois qu'une mise à jour a été
 *  téléchargée et installée sur disque en arrière-plan (voir UpdateNotifier et la page
 *  Paramètres) : au clic, relance l'app pour appliquer la mise à jour déjà installée — c'est
 *  l'utilisateur qui choisit le moment, jamais un redémarrage forcé. */
export function UpdateRestartButton() {
  const { t } = useTranslation();
  const status = useUpdateStore((s) => s.status);
  const version = useUpdateStore((s) => s.version);
  const relaunch = useUpdateStore((s) => s.relaunch);

  if (status !== "ready") return null;

  return (
    <button
      type="button"
      onClick={() => void relaunch()}
      title={version ? t("update.restartTooltip", { version }) : undefined}
      className="flex h-9 items-center gap-1.5 rounded-full bg-emerald-500 px-3 text-xs font-semibold text-black transition hover:bg-emerald-400"
    >
      <ArrowClockwise size={14} />
      {t("update.restartButton")}
    </button>
  );
}
