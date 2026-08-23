import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { supportsNativeHls } from "../../lib/platform";

interface AnimatedAlbumCoverVideoProps {
  /** URL de la playlist HLS "master" de la pochette animée (voir useAnimatedAlbumCover). */
  masterUrl: string;
  poster?: string;
  className: string;
  /** Appelé quand la lecture échoue réellement : le parent doit alors retomber sur la pochette
   *  statique plutôt que de laisser un cadre vide à l'écran. */
  onFatalError: () => void;
}

/** Lit une pochette animée Apple Music (HLS, CMAF fragmenté, timestamps internes calés sur la
 *  timeline globale du flux plutôt que remis à zéro — normal en HLS) via hls.js (MediaSource
 *  Extensions) sur TOUS les moteurs, y compris WebKit/Safari.
 *
 *  On pourrait s'attendre à préférer le HLS natif de Safari (<video src="....m3u8">) plutôt que
 *  d'embarquer hls.js pour lui aussi : en pratique AVFoundation refuse ces flux précis avec
 *  MEDIA_ERR_SRC_NOT_SUPPORTED (constaté en conditions réelles), probablement à cause du
 *  découpage "trick-play" particulier qu'Apple utilise pour ses pochettes animées — assez
 *  différent d'un HLS "classique" pour que même l'outil de référence de cette intégration
 *  (github.com/m8tec/apple-music-animated-artworks, dont le lecteur web utilise hls.js "in any
 *  browser (not just Safari)") ne fasse pas confiance au moteur natif. hls.js/MSE en revanche
 *  gère ces flux sans problème partout où il est disponible.
 *
 *  Le HLS natif ne reste qu'un ultime repli, pour les moteurs sans MediaSource Extensions
 *  (Hls.isSupported() === false, ex. Safari iOS) mais qui savent lire du HLS nativement. */
export function AnimatedAlbumCoverVideo({
  masterUrl,
  poster,
  className,
  onFatalError,
}: AnimatedAlbumCoverVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const useHlsJs = Hls.isSupported();

  useEffect(() => {
    if (!useHlsJs) {
      if (!supportsNativeHls()) onFatalError();
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const hls = new Hls();
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      console.warn(
        "[animatedCover] Erreur hls.js fatale, repli sur la pochette statique",
        data,
      );
      onFatalError();
    });
    hls.loadSource(masterUrl);
    hls.attachMedia(video);

    return () => hls.destroy();
    // onFatalError volontairement omis : identité stable non garantie côté appelant, et on ne
    // veut relancer hls.js que lorsque la source (ou la disponibilité de MSE) change réellement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterUrl, useHlsJs]);

  if (!useHlsJs) {
    return (
      <video
        // Clé = source : force React à démonter/remonter l'élément plutôt que de réutiliser le
        // nœud DOM existant en ne changeant que `src` (voir AlbumPage.tsx pour le même souci côté
        // pochette statique/vidéo).
        key={masterUrl}
        src={masterUrl}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        className={className}
        onError={(e) => {
          console.warn(
            "[animatedCover] Lecture HLS native impossible, repli sur la pochette statique",
            e.currentTarget.error,
          );
          onFatalError();
        }}
      />
    );
  }

  return (
    <video
      key={masterUrl}
      ref={videoRef}
      poster={poster}
      autoPlay
      loop
      muted
      playsInline
      className={className}
    />
  );
}
