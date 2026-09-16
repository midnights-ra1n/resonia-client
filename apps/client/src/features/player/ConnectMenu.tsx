import { useState } from "react";
import { Cast, Check, CircleNotch, SpeakerHigh, X } from "../../components/icons";
import { usePlayerStore } from "../../stores/playerStore";

/** Menu "Connect" : liste des sorties audio déjà connues du système (enceintes Bluetooth déjà
 *  appairées, AirPlay déjà configuré comme périphérique système...) — voir
 *  lib/audio/outputDevices.ts. Aucune découverte de périphérique non appairé n'est possible
 *  depuis le web : ça reste une action côté OS (Réglages Bluetooth), le menu ne fait que
 *  choisir parmi ce que l'OS expose déjà.
 *
 *  Section AirPlay séparée, desktop uniquement (voir lib/audio/airplay) : PREUVE DE CONCEPT —
 *  découverte mDNS + envoi RAOP direct depuis Resonia, indépendant de la liste ci-dessus (une
 *  enceinte AirPlay non ajoutée côté système n'apparaît jamais dans `outputDevices`, voir son
 *  commentaire). Non testé en conditions réelles, qualité audio dégradée (ré-échantillonnage
 *  linéaire, voir airplayPcmEncoder.ts), AirPlay 2 "best-effort" côté bibliothèque. */
export function ConnectMenu() {
  const supported = usePlayerStore((s) => s.outputDeviceSelectionSupported);
  const devices = usePlayerStore((s) => s.outputDevices);
  const loading = usePlayerStore((s) => s.outputDevicesLoading);
  const selectedId = usePlayerStore((s) => s.selectedOutputDeviceId);
  const selectOutputDevice = usePlayerStore((s) => s.selectOutputDevice);

  const airplaySupported = usePlayerStore((s) => s.airplaySupported);
  const airplayDevices = usePlayerStore((s) => s.airplayDevices);
  const airplayLoading = usePlayerStore((s) => s.airplayDevicesLoading);
  const airplayConnecting = usePlayerStore((s) => s.airplayConnecting);
  const airplayConnectedId = usePlayerStore((s) => s.airplayConnectedId);
  const refreshAirplayDevices = usePlayerStore((s) => s.refreshAirplayDevices);
  const connectAirplayDevice = usePlayerStore((s) => s.connectAirplayDevice);
  const disconnectAirplayDevice = usePlayerStore((s) => s.disconnectAirplayDevice);

  // Pas de détection protocolaire AirPlay 1 vs 2 dans cette preuve de concept (voir le
  // commentaire de découverte côté electron/main/index.ts) : un interrupteur manuel, à essayer
  // si la connexion échoue avec le réglage par défaut.
  const [airplay2Mode, setAirplay2Mode] = useState(false);

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

      {airplaySupported && (
        <>
          <div className="w-full h-px bg-neutral-700/50" />
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold text-neutral-300">AirPlay (bêta)</div>
            <button
              onClick={() => void refreshAirplayDevices()}
              disabled={airplayLoading}
              className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors disabled:opacity-50"
            >
              {airplayLoading ? "Recherche…" : "Rechercher"}
            </button>
          </div>

          {airplayConnectedId && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-neutral-700/70 text-[12px] text-white">
              <Cast size={14} className="shrink-0 text-green-400" />
              <span className="truncate flex-1">
                {airplayDevices.find((d) => d.id === airplayConnectedId)?.name ?? "Connecté"}
              </span>
              <button
                onClick={() => void disconnectAirplayDevice()}
                className="shrink-0 text-neutral-400 hover:text-white transition-colors"
                title="Déconnecter"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {!airplayConnectedId && airplayDevices.length === 0 && !airplayLoading && (
            <div className="text-[11px] text-neutral-400 leading-snug py-1">
              Aucun récepteur AirPlay trouvé sur le réseau local.
            </div>
          )}

          {!airplayConnectedId && airplayDevices.length > 0 && (
            <ul className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
              {airplayDevices.map((device) => (
                <li key={device.id}>
                  <button
                    onClick={() => void connectAirplayDevice(device.id, airplay2Mode)}
                    disabled={airplayConnecting}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[12px] text-left text-neutral-300 hover:bg-neutral-700/40 transition-colors disabled:opacity-50"
                    title={`${device.host}:${device.port}`}
                  >
                    <Cast size={14} className="shrink-0 text-neutral-400" />
                    <span className="truncate flex-1">{device.name}</span>
                    {airplayConnecting && <CircleNotch size={12} className="shrink-0 animate-spin" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="flex items-center justify-between gap-2 px-1 text-[11px] text-neutral-400">
            <span>Mode AirPlay 2 (HomePod, Apple TV récents)</span>
            <input
              type="checkbox"
              checked={airplay2Mode}
              onChange={(e) => setAirplay2Mode(e.target.checked)}
              className="accent-green-400"
            />
          </label>
        </>
      )}

      <div className="w-full h-px bg-neutral-700/50" />
      <div className="text-[10px] text-neutral-500 leading-tight">
        Enceintes déjà appairées ou déjà configurées côté système uniquement — AirPlay ci-dessus
        est une preuve de concept séparée, non garantie.
      </div>
    </div>
  );
}
