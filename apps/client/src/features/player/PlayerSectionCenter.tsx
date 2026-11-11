import { Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from "../../components/icons";
import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "../../stores/playerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { Ranges, WaveformBar, type PercentRange } from "./WaveformBar";
import { useTrackWaveform } from "./useTrackWaveform";

// 0 est une valeur d'écoulement légitime (tout début de piste, y compris juste après un
// enchaînement gapless) : seule une valeur non finie ou négative signifie "pas de piste".
// Confondre "0 seconde écoulée" avec "durée inconnue" faisait clignoter "--:--" à chaque
// changement de piste (le store remet currentTime à 0), ce qui ressemblait à une coupure.
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PlayerSectionCenter() {
  // Sélecteurs fins plutôt que la déstructuration du store entier : currentTime change
  // jusqu'à 4x/s pendant la lecture (voir tickProgress dans playerStore), et un store
  // entier abonné ici re-rendrait aussi les boutons de contrôle à chaque tick alors
  // qu'eux seuls dépendent d'isPlaying/isShuffle/isRepeat. ProgressBar isole le reste.
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const isRepeat = usePlayerStore((s) => s.isRepeat);
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  // Lecture demandée mais pas encore audible (chargement réseau, attente de données).
  const isLoading = usePlayerStore((s) => s.isPlaying && (s.engineState === "loading" || s.engineState === "buffering"));

  return (
    <div className="flex flex-col items-center gap-2 w-full max-w-2xl">
      {/* Control buttons */}
      <div className="flex items-center gap-6">
        <button
          onClick={toggleShuffle}
          className={`transition-colors ${isShuffle
            ? "text-accent"
            : "text-neutral-400 hover:text-white"
            }`}
          title="Shuffle"
        >
          <Shuffle size={18} />
        </button>

        <button
          onClick={prevTrack}
          className="text-neutral-400 hover:text-white transition-colors"
          title="Previous"
        >
          <SkipBack size={22} fill="currentColor" />
        </button>

        <button
          onClick={togglePlay}
          className="relative w-8 h-8 rounded-full bg-text-1 flex items-center justify-center hover:scale-105 active:scale-95 transition-[transform,translate,scale]"
          title={isPlaying ? "Pause" : "Play"}
          aria-busy={isLoading}
        >
          {isLoading && <span className="loading-ring" aria-hidden />}
          {isPlaying ? (
            <Pause size={16} fill="currentColor" className="text-bg-base" />
          ) : (
              <Play size={16} fill="currentColor" className="text-bg-base ml-0.5" />
            )}
          </button>

          <button
            onClick={nextTrack}
            className="text-neutral-400 hover:text-white transition-colors"
            title="Next"
          >
            <SkipForward size={22} fill="currentColor" />
          </button>

          <button
            onClick={toggleRepeat}
            className={`transition-colors ${isRepeat
              ? "text-accent"
              : "text-neutral-400 hover:text-white"
              }`}
            title="Repeat"
          >
            <Repeat size={18} />
          </button>
        </div>

        <ProgressBar />
      </div>
    );
  }

  // Seul ce composant re-rend au rythme de tickProgress (currentTime) : isolé du reste des
  // contrôles pour que le tick de lecture n'entraîne pas un re-render des boutons ci-dessus.
  function ProgressBar() {
    const currentTrack = usePlayerStore((s) => s.currentTrack);
    const currentTime = usePlayerStore((s) => s.currentTime);
    const engineDuration = usePlayerStore((s) => s.duration);
    const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
    const showTimeRemaining = usePlayerStore((s) => s.showTimeRemaining);
    const toggleTimeDisplay = usePlayerStore((s) => s.toggleTimeDisplay);

    // La métadonnée serveur (`currentTrack.duration`) prime sur `engine.duration` pour
    // L'AFFICHAGE : en streaming natif, tant que le fichier n'est pas encore en cache,
    // `HTMLMediaElement.duration` peut être temporairement `Infinity` (transfert chunked sans
    // Content-Length) ou une estimation grossière qui grandit au fil du téléchargement —
    // utilisée telle quelle, elle faisait osciller/geler la barre de progression (largeur qui
    // dépasse ou stagne près de 100%) et figeait les libellés de temps sur "--:--" (`isFinite`
    // rejette `Infinity`) jusqu'à ce que le buffer complet soit disponible. La métadonnée
    // serveur, elle, est connue dès le chargement de la piste et ne bouge plus.
    // `engine.seek()` clampe déjà lui-même sur SA propre durée réelle (voir gaplessEngine.ts) :
    // scruter/cliquer par rapport à la métadonnée ne risque donc plus de cibler un point que le
    // moteur ne peut pas satisfaire, contrairement à avant ce correctif.
    const trackDuration = currentTrack?.duration ?? 0;
    const duration =
      trackDuration > 0
        ? trackDuration
        : Number.isFinite(engineDuration) && engineDuration > 0
          ? engineDuration
          : 0;

    const [hoverProgress, setHoverProgress] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const barRef = useRef<HTMLDivElement>(null);
    const showWaveform = useSettingsStore((s) => s.showWaveform);
    const waveformStyle = useSettingsStore((s) => s.waveformStyle);
    // Option désactivée : aucune lecture ni calcul de forme d'onde.
    const waveform = useTrackWaveform(showWaveform ? currentTrack?.id : undefined);

    // Native streaming en attente de données (typiquement juste après un seek hors de la zone
    // déjà téléchargée) : la position ne peut réellement pas avancer — on le signale par une
    // pulsation douce plutôt que de laisser croire à un gel de l'interface.
    const isBuffering = usePlayerStore((s) => s.engineState === "buffering" || s.engineState === "loading");

    // Pendant un glisser, la barre ET le temps écoulé suivent le curseur en direct (aperçu de
    // scrub) ; le seek réel n'est envoyé qu'au relâchement.
    const isScrubbing = isDragging && hoverProgress !== null;
    const displayTime = isScrubbing ? hoverProgress : currentTime;
    const toPercent = (t: number) => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);
    const progress = toPercent(displayTime);

    // Trois couches : piste entière (fond), plages chargées (tampon du lecteur + cache, disjointes
    // après un seek) et remplissage. Le remplissage va toujours du début à la position affichée
    // (comme Spotify : un clic le déplace aussitôt), plus les plages déjà écoutées au-delà, qui
    // restent visibles après un retour en arrière.
    const bufferedRanges = usePlayerStore((s) => s.bufferedRanges);
    const playedRanges = usePlayerStore((s) => s.playedRanges);
    const toPercentRange = ([a, b]: readonly [number, number]): PercentRange => [toPercent(a), toPercent(b)];
    const buffered = currentTrack ? bufferedRanges.map(toPercentRange) : [];
    const played: PercentRange[] = currentTrack ? [[0, progress], ...playedRanges.map(toPercentRange)] : [];

    const handleClickBar = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current || !duration) return;
      const rect = barRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setCurrentTime(pct * duration);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current || !duration) return;
      const rect = barRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setHoverProgress(pct * duration);
    };

    // Un vrai geste de scrub (mousedown sur la barre puis glissé) sort très vite du <div> lui-
    // même : sans écouteurs sur window, `onMouseMove`/`onMouseUp` posés sur la barre cessent de
    // se déclencher dès que le curseur en sort, ce qui gelait le seek en plein glissé et pouvait
    // laisser `isDragging` bloqué à `true` si le relâchement se produisait hors de la barre
    // (le clic ne se déclenchant, lui, que si le mouseup retombe sur le même élément).
    useEffect(() => {
      if (!isDragging) return;

      const clampPct = (clientX: number) => {
        if (!barRef.current) return null;
        const rect = barRef.current.getBoundingClientRect();
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      };

      const onMove = (e: MouseEvent) => {
        if (!duration) return;
        const pct = clampPct(e.clientX);
        if (pct !== null) setHoverProgress(pct * duration);
      };
      const onUp = (e: MouseEvent) => {
        setIsDragging(false);
        if (!duration) return;
        const pct = clampPct(e.clientX);
        if (pct !== null) setCurrentTime(pct * duration);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
    }, [isDragging, duration, setCurrentTime]);

    return (
      <div className="flex items-center gap-2 w-full">
        <span className="text-xs text-neutral-400 w-10 text-right tabular-nums select-none">
          {currentTrack ? formatTime(displayTime) : "--:--"}
        </span>

        {waveform ? (
          // Forme d'onde : plus haute que la barre simple, compensée par des marges négatives pour
          // que la barre de lecture garde exactement la même hauteur.
          <div
            ref={barRef}
            className="relative -my-[10px] h-6 flex-1 cursor-pointer group rounded bg-white/5 transition-colors hover:bg-white/10"
            onClick={handleClickBar}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverProgress(null)}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
          >
            <WaveformBar
              waveform={waveform}
              style={waveformStyle}
              played={played}
              buffered={buffered}
              pulsing={isBuffering && Boolean(currentTrack)}
            />
          </div>
        ) : (
        <div
          ref={barRef}
          className="relative flex-1 h-1 bg-neutral-700 hover:bg-neutral-600 transition-colors rounded-full cursor-pointer group"
          onClick={handleClickBar}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverProgress(null)}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
        >
          {/* Plages et pastille déplacées par `transform` uniquement (jamais width/left, voir
              RangeWindow) : le tick de lecture (4×/s) ne déclenche ni layout ni repaint, seulement
              une recomposition GPU. Le conteneur de la pastille fait toute la largeur de la barre :
              un translateX en % de SA largeur équivaut donc à un % de la barre. */}
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <Ranges ranges={buffered}>
              <div className="absolute inset-0 bg-neutral-500" />
            </Ranges>
            <div className={`absolute inset-0 ${isBuffering && currentTrack ? "animate-pulse" : ""}`}>
              <Ranges ranges={played}>
                <div className={`absolute inset-0 transition-colors group-hover:bg-accent ${isDragging ? "bg-accent" : "bg-text-1"}`} />
              </Ranges>
            </div>
          </div>


          <div
            className="pointer-events-none absolute inset-0"
            style={{ transform: `translateX(${progress}%)` }}
          >
            <div className={`absolute top-1/2 -left-1.5 h-3 w-3 -translate-y-1/2 rounded-full bg-text-1 shadow-e1 transition-opacity group-hover:opacity-100 ${isDragging ? "opacity-100" : "opacity-0"}`} />
          </div>
        </div>
      )}

      <span
        className="text-xs text-neutral-400 w-10 tabular-nums select-none cursor-pointer hover:text-white"
        onClick={toggleTimeDisplay}
        title={
          showTimeRemaining ? "Click for total time" : "Click for remaining time"
        }
      >
        {!currentTrack
          ? "--:--"
          : showTimeRemaining
            ? `-${formatTime(Math.max(duration - displayTime, 0))}`
            : formatTime(duration)}
      </span>
    </div>
  );
}
