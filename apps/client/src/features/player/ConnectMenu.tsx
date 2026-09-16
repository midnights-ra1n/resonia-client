import { Check, CircleNotch, SpeakerHigh } from "../../components/icons";
import { usePlayerStore } from "../../stores/playerStore";

/** Menu "Connect" : liste des sorties audio déjà connues du système (enceintes Bluetooth déjà
 *  appairées, AirPlay déjà configuré comme périphérique système...) — voir
 *  lib/audio/outputDevices.ts. Aucune découverte de périphérique non appairé n'est possible
 *  depuis le web : ça reste une action côté OS (Réglages Bluetooth), le menu ne fait que
 *  choisir parmi ce que l'OS expose déjà. */
export function ConnectMenu() {
  const supported = usePlayerStore((s) => s.outputDeviceSelectionSupported);
  const devices = usePlayerStore((s) => s.outputDevices);
  const loading = usePlayerStore((s) => s.outputDevicesLoading);
  const selectedId = usePlayerStore((s) => s.selectedOutputDeviceId);
  const selectOutputDevice = usePlayerStore((s) => s.selectOutputDevice);

  return (
    <div
      className="absolute bottom-full right-0 mb-3 w-64 rounded-lg bg-neutral-800 shadow-xl border border-neutral-700/50 p-3 flex flex-col gap-2 z-50"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="text-xs font-semibold text-neutral-200">Connect</div>

      {!supported ? (
        <div className="text-[11px] text-neutral-400 leading-snug py-1">
          La sélection de la sortie audio n'est pas prise en charge par ce navigateur/moteur de
          rendu. Choisis la sortie depuis les réglages système.
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 text-[11px] text-neutral-400 py-2">
          <CircleNotch size={14} className="animate-spin" />
          Recherche des sorties audio…
        </div>
      ) : devices.length === 0 ? (
        <div className="text-[11px] text-neutral-400 leading-snug py-1">
          Aucune sortie audio détectée. Les enceintes Bluetooth ou AirPlay doivent d'abord être
          appairées dans les réglages système.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
          {devices.map((device) => {
            const isSelected = device.deviceId === selectedId;
            return (
              <li key={device.deviceId}>
                <button
                  onClick={() => void selectOutputDevice(device.deviceId)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[12px] text-left transition-colors ${
                    isSelected ? "bg-neutral-700/70 text-white" : "text-neutral-300 hover:bg-neutral-700/40"
                  }`}
                  title={device.label}
                >
                  <SpeakerHigh size={14} className="shrink-0 text-neutral-400" />
                  <span className="truncate flex-1">{device.label}</span>
                  {isSelected && <Check size={14} className="shrink-0 text-green-400" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="w-full h-px bg-neutral-700/50" />
      <div className="text-[10px] text-neutral-500 leading-tight">
        Enceintes déjà appairées ou déjà configurées côté système uniquement.
      </div>
    </div>
  );
}
