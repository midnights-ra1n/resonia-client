import type { CSSProperties } from "react";
import { RotateCcw } from "lucide-react";
import { usePlayerStore } from "../../stores/playerStore";

const PITCH_MIN = -16;
const PITCH_MAX = 16;
const PITCH_STEP = 0.1;

/** Petit menu façon platine DJ : un fader qui couple vitesse et hauteur (voir le commentaire
 *  sur `pitch` dans playerStore), plus un interrupteur Master Tempo qui préserve réellement
 *  la hauteur — mais seulement en tout début de piste, voir `masterTempo` dans playerStore
 *  et GaplessEngine.setPreservePitch pour la limitation. */
// Remplissage du fader ancré au centre (0%) plutôt qu'au minimum, comme un contrôle de
// balance — la coloration native d'un <input type=range> (accent-color) part toujours du
// minimum, il faut donc la désactiver (-webkit-appearance: none) et reconstruire la piste
// à la main via un gradient calculé, entre 50% (0%) et la position courante.
function trackFillGradient(pitch: number): string {
  const percent = ((pitch - PITCH_MIN) / (PITCH_MAX - PITCH_MIN)) * 100;
  const low = Math.min(50, percent);
  const high = Math.max(50, percent);
  return `linear-gradient(to right, #52525b ${low}%, #4ade80 ${low}%, #4ade80 ${high}%, #52525b ${high}%)`;
}

export function PitchMenu() {
  const pitch = usePlayerStore((s) => s.pitch);
  const setPitch = usePlayerStore((s) => s.setPitch);
  const resetPitch = usePlayerStore((s) => s.resetPitch);
  const masterTempo = usePlayerStore((s) => s.masterTempo);
  const toggleMasterTempo = usePlayerStore((s) => s.toggleMasterTempo);

  return (
    <div
      className="absolute bottom-full right-0 mb-3 w-40 rounded-lg bg-neutral-800 shadow-xl border border-neutral-700/50 p-3 flex flex-col items-center gap-2 z-50"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <style>{`
        input.pitch-fader {
          -webkit-appearance: none;
          appearance: none;
          outline: none;
        }
        /* Capsule façon cap de pitch fader de platine (CDJ/Serato) plutôt qu'un rond : une
           fois l'input tourné à 90deg (voir le transform plus bas), "width" devient l'axe de
           déplacement (fin) et "height" l'axe perpendiculaire (large) — d'où les valeurs
           inversées par rapport à une pilule verticale classique. */
        input.pitch-fader::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 10px;
          height: 26px;
          border-radius: 3px;
          background: #fff;
          cursor: pointer;
          /* Pas de margin-top de centrage ici : le WebKit récent (WKWebView de Tauri
             compris) centre déjà nativement un thumb stylé sur la piste. Le vieil hack
             margin-top = (trackHeight - thumbHeight) / 2, hérité du thumb rond d'origine,
             décalait la capsule hors de l'axe de la piste une fois cumulé au centrage natif. */
        }
        input.pitch-fader::-moz-range-thumb {
          width: 10px;
          height: 26px;
          border-radius: 3px;
          background: #fff;
          border: none;
          cursor: pointer;
        }
        input.pitch-fader::-moz-range-track {
          height: 4px;
          border-radius: 9999px;
          background: var(--fill);
        }
      `}</style>

      <div className="text-xs font-semibold text-neutral-200">Pitch</div>

      <div className="flex items-center gap-3">
        <div className="h-44 flex items-center justify-center" style={{ width: 24 }}>
          <input
            type="range"
            min={PITCH_MIN}
            max={PITCH_MAX}
            step={PITCH_STEP}
            value={pitch}
            onChange={(e) => setPitch(parseFloat(e.target.value))}
            className="pitch-fader cursor-pointer"
            style={{
              width: 176,
              height: 4,
              borderRadius: 9999,
              background: "var(--fill)",
              // Piloté en variable CSS (et pas directement `background`) pour que la même
              // valeur atteigne aussi ::-moz-range-track (Firefox) — voir le <style> ci-dessus.
              "--fill": trackFillGradient(pitch),
              // rotate(90deg), pas -90deg : place le + (accélère) en bas et le - (ralentit)
              // en haut, sens inverse de la rotation trigonométrique par défaut.
              transform: "rotate(90deg)",
              transformOrigin: "center",
            } as CSSProperties & Record<"--fill", string>}
            title="Vitesse et hauteur couplées, comme un pitch fader de platine"
          />
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
            <RotateCcw size={14} />
          </button>
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
