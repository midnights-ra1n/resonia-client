import { useCallback, useRef } from "react";
import { ClockCounterClockwise } from "../../components/icons";
import { PITCH_RANGE_OPTIONS, usePlayerStore } from "../../stores/playerStore";

const PITCH_STEP = 0.1;

/** Petit menu façon platine DJ : un fader qui couple vitesse et hauteur (voir le commentaire
 *  sur `pitch` dans playerStore), plus un interrupteur Master Tempo qui préserve réellement
 *  la hauteur — mais seulement en tout début de piste, voir `masterTempo` dans playerStore
 *  et GaplessEngine.setPreservePitch pour la limitation. */
// Remplissage du fader ancré au centre (0%) plutôt qu'au minimum, comme un contrôle de
// balance.
function trackFillGradient(pitch: number, pitchRange: number): string {
  const percent = ((pitch - -pitchRange) / (pitchRange - -pitchRange)) * 100;
  const low = Math.min(50, percent);
  const high = Math.max(50, percent);
  return `linear-gradient(to right, #52525b ${low}%, #4ade80 ${low}%, #4ade80 ${high}%, #52525b ${high}%)`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

const FADER_TRACK_HEIGHT = 176;
const FADER_TRACK_WIDTH = 4;
const FADER_THUMB_WIDTH = 26;
const FADER_THUMB_HEIGHT = 10;

interface PitchFaderProps {
  pitch: number;
  pitchRange: number;
  onChange: (pitch: number) => void;
}

/** Fader vertical entièrement piloté en pointer events, plutôt qu'un `<input type=range>`
 *  natif tourné à 90deg en CSS (`transform: rotate(90deg)`) comme précédemment. Ce dernier
 *  s'est avéré totalement inerte sous WebKitGTK (webview Linux de l'app de bureau) : le
 *  hit-testing pointeur→valeur d'un range transformé y est nettement moins abouti que sur
 *  WebKit macOS/Chromium (implémentation native de `<input type=range>` historiquement moins
 *  mature sous GTK), au point que le curseur ne répondait à aucun glissé. Calculer nous-mêmes
 *  la position à partir de `pointermove`/`getBoundingClientRect` élimine ce point de variance
 *  entre moteurs de rendu : le comportement ne dépend plus que de l'API Pointer Events,
 *  implémentée de façon uniforme partout où Tauri tourne. */
function PitchFader({ pitch, pitchRange, onChange }: PitchFaderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  // + (accélère) en bas, - (ralentit) en haut : le haut du rail correspond à -pitchRange, le
  // bas à +pitchRange — voir le commentaire historique conservé sur ce choix dans PitchMenu.
  const valueFromClientY = useCallback(
    (clientY: number): number => {
      const track = trackRef.current;
      if (!track) return pitch;
      const rect = track.getBoundingClientRect();
      const ratio = clamp((clientY - rect.top) / rect.height, 0, 1);
      const raw = -pitchRange + ratio * (2 * pitchRange);
      return clamp(roundToStep(raw, PITCH_STEP), -pitchRange, pitchRange);
    },
    [pitch, pitchRange],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      onChange(valueFromClientY(e.clientY));
    },
    [onChange, valueFromClientY],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      onChange(valueFromClientY(e.clientY));
    },
    [onChange, valueFromClientY],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          onChange(clamp(roundToStep(pitch + PITCH_STEP, PITCH_STEP), -pitchRange, pitchRange));
          break;
        case "ArrowDown":
          e.preventDefault();
          onChange(clamp(roundToStep(pitch - PITCH_STEP, PITCH_STEP), -pitchRange, pitchRange));
          break;
        case "Home":
          e.preventDefault();
          onChange(pitchRange);
          break;
        case "End":
          e.preventDefault();
          onChange(-pitchRange);
          break;
      }
    },
    [onChange, pitch, pitchRange],
  );

  const percent = ((pitch - -pitchRange) / (pitchRange - -pitchRange)) * 100;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Pitch"
      aria-orientation="vertical"
      aria-valuemin={-pitchRange}
      aria-valuemax={pitchRange}
      aria-valuenow={pitch}
      aria-valuetext={`${pitch > 0 ? "+" : ""}${pitch.toFixed(1)}%`}
      title="Vitesse et hauteur couplées, comme un pitch fader de platine"
      className="relative cursor-pointer touch-none outline-none"
      style={{ width: FADER_THUMB_WIDTH, height: FADER_TRACK_HEIGHT }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full"
        style={{
          width: FADER_TRACK_WIDTH,
          height: FADER_TRACK_HEIGHT,
          background: trackFillGradient(pitch, pitchRange).replace("to right", "to bottom"),
        }}
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-white"
        style={{
          width: FADER_THUMB_WIDTH,
          height: FADER_THUMB_HEIGHT,
          top: `${percent}%`,
        }}
      />
    </div>
  );
}

export function PitchMenu() {
  const pitch = usePlayerStore((s) => s.pitch);
  const setPitch = usePlayerStore((s) => s.setPitch);
  const resetPitch = usePlayerStore((s) => s.resetPitch);
  const pitchRange = usePlayerStore((s) => s.pitchRange);
  const setPitchRange = usePlayerStore((s) => s.setPitchRange);
  const masterTempo = usePlayerStore((s) => s.masterTempo);
  const toggleMasterTempo = usePlayerStore((s) => s.toggleMasterTempo);

  return (
    <div
      className="absolute bottom-full right-0 mb-3 w-40 rounded-lg bg-neutral-800 shadow-xl border border-neutral-700/50 p-3 flex flex-col items-center gap-2 z-50"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="text-xs font-semibold text-neutral-200">Pitch</div>

      <div className="flex items-center gap-3">
        <div className="h-44 flex items-center justify-center" style={{ width: 24 }}>
          <PitchFader pitch={pitch} pitchRange={pitchRange} onChange={setPitch} />
        </div>

        <div className="flex flex-col items-center gap-1 text-neutral-300 text-[11px]">
          <span className="tabular-nums w-12 text-center">
            {pitch === 0 ? "0%" : `${pitch > 0 ? "+" : ""}${pitch.toFixed(1)}%`}
          </span>
          <button
            onClick={resetPitch}
            className="text-neutral-400 hover:text-white transition-colors"
            title="Réinitialiser (1x)"
          >
            <ClockCounterClockwise size={14} />
          </button>
        </div>
      </div>

      <div className="w-full h-px bg-neutral-700/50" />

      <div className="w-full flex flex-col items-center gap-1">
        <span className="text-[11px] text-neutral-300 self-start">Plage</span>
        <div className="w-full grid grid-cols-4 gap-1">
          {PITCH_RANGE_OPTIONS.map((range) => (
            <button
              key={range}
              onClick={() => setPitchRange(range)}
              className={`rounded px-1 py-0.5 text-[11px] tabular-nums transition-colors ${
                pitchRange === range
                  ? "bg-green-400 text-neutral-900 font-semibold"
                  : "bg-neutral-700/50 text-neutral-300 hover:bg-neutral-700"
              }`}
              title={`Plage de pitch ±${range}%`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full h-px bg-neutral-700/50" />

      <button
        onClick={toggleMasterTempo}
        className="w-full flex items-center justify-between gap-2"
        title="Master Tempo — préserve la hauteur en tout début de piste (streaming), pas encore une fois la piste en lecture gapless"
      >
        <span className="text-[11px] text-neutral-300">Master Tempo</span>
        <span
          className={`relative inline-block shrink-0 w-8 h-4 rounded-full transition-colors ${masterTempo ? "bg-green-400" : "bg-neutral-600"
            }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${masterTempo ? "translate-x-4" : "translate-x-0"
              }`}
          />
        </span>
      </button>

      <div className="text-[10px] text-neutral-500 text-center leading-tight">
        Vitesse ± hauteur, comme sur une platine
      </div>
    </div>
  );
}
