/** Énumère les sorties audio déjà connues du système d'exploitation (enceintes Bluetooth
 *  déjà appairées, AirPlay déjà configuré comme périphérique système, casque filaire, etc.).
 *  Il n'existe aucune API web/Electron cross-plateforme pour scanner ET appairer un
 *  périphérique qui n'est pas encore connu de l'OS — ce module ne fait donc jamais de scan
 *  Bluetooth/AirPlay lui-même, seulement `navigator.mediaDevices.enumerateDevices()`, qui ne
 *  liste que ce que l'OS expose déjà comme sortie audio (voir GaplessEngine.setOutputDevice
 *  pour le routage effectif via `AudioContext.setSinkId`). */

export interface OutputDevice {
  deviceId: string;
  label: string;
}

export function isOutputDeviceListingSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.enumerateDevices;
}

/** Les labels des périphériques ne sont renseignés par le navigateur que si une permission
 *  micro a déjà été accordée à l'origine (protection anti-fingerprinting standard) — sans
 *  quoi `enumerateDevices` renvoie des `deviceId` opaques et des labels vides. On ne demande
 *  cette permission qu'à l'ouverture explicite du menu Connect (jamais au chargement de
 *  l'app), et on tolère un refus : la liste reste alors affichée avec des libellés
 *  génériques plutôt que de bloquer la fonctionnalité. */
async function ensureLabelsPermission(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasLabels = devices.some((d) => d.kind === "audiooutput" && d.label);
    if (hasLabels) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    /* permission refusée ou indisponible — on continue avec des libellés génériques */
  }
}

export async function listOutputDevices(): Promise<OutputDevice[]> {
  if (!isOutputDeviceListingSupported()) return [];
  await ensureLabelsPermission();
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audiooutput")
    .map((d, i) => ({
      deviceId: d.deviceId || "default",
      label: d.label || `Sortie audio ${i + 1}`,
    }));
}
