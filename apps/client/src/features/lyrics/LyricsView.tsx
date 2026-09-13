import { useEffect, useMemo, useRef, useState } from "react";
import { useCachedDominantColor } from "../../hooks/useCachedDominantColor";
import { useCoverArt } from "../../hooks/useCoverArt";
import { getGaplessEngine } from "../../lib/audio/engine/gaplessEngine";
import { useTranslation } from "../../lib/i18n";
import { getCachedLyrics, loadLyrics, type LyricsLine, type ParsedLyrics } from "../../lib/lyrics/lyricsService";
import { DEFAULT_COVER_URL, usePlayerStore } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";

const FALLBACK_BG = "rgb(23, 23, 23)";

/** Luminance perçue max tolérée avant d'assombrir la couleur dominante : au-delà, du texte
 *  blanc par-dessus n'aurait plus assez de contraste (pochettes très claires : blanc, pastel...). */
const MAX_LUMINANCE = 0.45;

function perceivedLuminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Assombrit la couleur dominante (extraite pour les dégradés album/playlist, pensés pour
 *  un fond déjà sombre derrière) pour garantir un bon contraste avec le texte blanc plein
 *  écran de cette page — sans toucher au hook partagé `useDominantColor`. */
function ensureContrastForWhiteText(rgb: string): string {
  const match = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb);
  if (!match) return FALLBACK_BG;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const luminance = perceivedLuminance(r, g, b);
  if (luminance <= MAX_LUMINANCE || luminance === 0) return rgb;
  const scale = MAX_LUMINANCE / luminance;
  return `rgb(${Math.round(r * scale)}, ${Math.round(g * scale)}, ${Math.round(b * scale)})`;
}

/** Index de la dernière ligne dont le timestamp est déjà passé (recherche dichotomique :
 *  les lignes sont triées par `time` croissant). -1 si aucune ligne n'a encore démarré. */
function findActiveLineIndex(lines: LyricsLine[], currentTime: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= currentTime) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

interface ResolvedLyrics {
  trackId: string;
  data: ParsedLyrics | null;
}

/** Durée du scroll auto vers la ligne active — volontairement bien plus courte que le
 *  scroll "smooth" natif du navigateur (souvent 500-800ms), pour un défilement qui suit le
 *  rythme du texte sans traîner derrière la voix. Implémenté à la main (plutôt que
 *  scrollIntoView) pour garder le contrôle total de la durée, et annulable si la ligne
 *  active change à nouveau avant la fin de l'animation en cours. */
const SCROLL_DURATION_MS = 180;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function LyricsView() {
  const { t } = useTranslation();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const activeServerId = useServersStore((s) => s.activeServerId);

  const cachedCoverUrl = useCoverArt(
    activeServerId ?? undefined,
    currentTrack?.coverArtId,
    300,
    currentTrack?.coverUrl,
  );
  const coverUrl = cachedCoverUrl ?? DEFAULT_COVER_URL;
  const trackId = currentTrack?.id;

  // Toujours initialisé depuis le cache mémoire (lecture synchrone au rendu, pas dans un
  // effet) : les paroles sont préchargées dès que la piste devient active/à venir (voir
  // playerStore), donc déjà disponibles la plupart du temps au moment où cette vue s'affiche.
  const [resolvedLyrics, setResolvedLyrics] = useState<ResolvedLyrics | undefined>(() => {
    if (!trackId) return undefined;
    const cached = getCachedLyrics(trackId);
    return cached !== undefined ? { trackId, data: cached } : undefined;
  });

  useEffect(() => {
    if (!currentTrack) return;
    let cancelled = false;
    loadLyrics(currentTrack).then((result) => {
      if (!cancelled) setResolvedLyrics({ trackId: currentTrack.id, data: result });
    });
    return () => {
      cancelled = true;
    };
  }, [currentTrack]);

  // `undefined` = en cours de chargement pour la piste actuelle (soit `resolvedLyrics` ne
  // correspond pas encore à `trackId`, soit il n'y a pas de piste).
  const lyrics = trackId && resolvedLyrics?.trackId === trackId ? resolvedLyrics.data : undefined;

  // Couleur dominante de la pochette — mise en cache mémoire ET disque par coverArtId (voir
  // dominantColorCache), préchargée dès que la piste devient active/à venir (playerStore) :
  // déjà connue la plupart du temps à l'ouverture de cette vue, donc quasi instantanée.
  // Assombrie si besoin pour rester lisible avec le texte blanc de cette page.
  const dominantColor = useCachedDominantColor(
    activeServerId ?? undefined,
    currentTrack?.coverArtId,
    coverUrl !== DEFAULT_COVER_URL ? coverUrl : undefined,
  );
  const bgColor = dominantColor ? ensureContrastForWhiteText(dominantColor) : FALLBACK_BG;

  const lines = useMemo(() => lyrics?.lines ?? [], [lyrics]);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Suit `GaplessEngine.currentTime` directement à chaque frame plutôt que le
  // `currentTime` du store (rafraîchi toutes les 250ms) : ce getter renvoie déjà la
  // position réelle dans la piste corrigée par `_playbackRate` (voir gaplessEngine.ts), donc
  // la synchronisation reste précise quel que soit le pitch/tempo appliqué — à 250ms de
  // tick et un pitch à +16%, l'écart pouvait dépasser 50ms entre deux lignes, perceptible.
  // Le `setState` n'est déclenché que si l'index actif change réellement, pas à chaque frame.
  useEffect(() => {
    // Rien à faire si les paroles ne sont pas synchronisées : l'index actif ne sera pas
    // utilisé côté rendu dans ce cas (voir plus bas), une éventuelle valeur périmée est sans
    // conséquence — inutile de la remettre à -1 ici (setState synchrone dans un effet).
    if (!lyrics?.synced || lines.length === 0) return;
    let rafId: number;
    let lastIndex = -2;
    function tick() {
      const time = getGaplessEngine().currentTime;
      const index = findActiveLineIndex(lines, time);
      if (index !== lastIndex) {
        lastIndex = index;
        setActiveIndex(index);
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [lines, lyrics?.synced]);

  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Avant que le chant ne démarre (`activeIndex === -1`), il n'y a pas encore de ligne
    // "active" à centrer — on cadre quand même la première ligne, mais légèrement SOUS le
    // centre plutôt que pile dessus : un centrage strict fait sentir la vue vide/coupée en
    // haut, alors qu'un léger décalage vers le bas se lit naturellement comme "à venir".
    const isIntro = activeIndex < 0;
    const targetIndex = isIntro ? (lines.length > 0 ? 0 : -1) : activeIndex;
    if (targetIndex < 0) return;

    const container = scrollContainerRef.current;
    const line = lineRefs.current[targetIndex];
    if (!container || !line) return;

    const introBiasPx = isIntro ? container.clientHeight * 0.12 : 0;
    const start = container.scrollTop;
    const target = line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2 + introBiasPx;
    const change = target - start;
    if (Math.abs(change) < 1) return;

    let cancelled = false;
    const startTime = performance.now();
    function step(now: number) {
      if (cancelled || !container) return;
      const progress = Math.min((now - startTime) / SCROLL_DURATION_MS, 1);
      container.scrollTop = start + change * easeOutCubic(progress);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);

    return () => {
      cancelled = true;
    };
  }, [activeIndex, lines.length]);

  if (!currentTrack) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center" style={{ backgroundColor: FALLBACK_BG }}>
        <p className="text-sm text-white/60">{t("lyrics.noTrack")}</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-1 min-h-0 flex-col items-center overflow-hidden transition-colors duration-700"
      style={{ backgroundColor: bgColor }}
    >
      <div
        ref={scrollContainerRef}
        className="lyrics-scrollable w-full max-w-5xl flex-1 min-h-0 overflow-y-auto px-10 py-[35vh] text-center [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_88%,transparent)]"
      >
        {lyrics === undefined ? (
          <p className="text-lg text-white/60">{t("lyrics.loading")}</p>
        ) : lines.length === 0 ? (
          <p className="text-lg text-white/60">{t("lyrics.unavailable")}</p>
        ) : !lyrics?.synced ? (
          <div className="space-y-5">
            {lines.map((line, i) => (
              <p key={i} className="text-2xl font-medium leading-relaxed text-white/90">
                {line.text || " "}
              </p>
            ))}
          </div>
        ) : (
          <div className="space-y-8 py-4">
            {lines.map((line, i) => {
              const isActive = i === activeIndex;
              return (
                <button
                  key={i}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  type="button"
                  onClick={() => setCurrentTime(line.time)}
                  // Taille de police FIXE pour toutes les lignes : l'effet "agrandissement" vient
                  // uniquement de `scale` (transform, compositée par le GPU). Faire varier
                  // `font-size` d'une ligne à l'autre force un reflow/re-mesure du texte à
                  // chaque frame de la transition (largeur des caractères qui change), ce qui
                  // provoquait le glitch visuel signalé — un vrai changement de layout mélangé à
                  // une transformation, jamais fluide.
                  className={`block w-full origin-center text-center text-4xl font-bold transition-[transform,color,opacity] duration-[260ms] ease-out will-change-transform ${
                    isActive ? "scale-[1.1] text-white opacity-100" : "scale-100 text-white/35 opacity-90 hover:text-white/60"
                  }`}
                >
                  {line.text || " "}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
