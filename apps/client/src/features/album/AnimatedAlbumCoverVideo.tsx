import { useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import { supportsNativeHls } from "../../lib/platform";

interface AnimatedAlbumCoverVideoProps {
  /** URL de la playlist HLS "master" de la pochette animée (voir useAnimatedAlbumCover). */
  masterUrl: string;
  className: string;
}

/** Lit une pochette animée Apple Music (HLS, CMAF fragmenté, timestamps internes calés sur la
 *  timeline globale du flux plutôt que remis à zéro — normal en HLS) via hls.js (MediaSource
 *  Extensions) sur TOUS les moteurs qui le supportent (Chromium, Gecko, WebView2, WebKit
 *  desktop).
 *
 *  hls.js (~1,4 Mo non minifié) est importé dynamiquement plutôt qu'en tête de fichier : ce
 *  composant ne s'affiche que sur les pages album possédant une pochette animée, mais un
 *  `import` statique aurait forcé le bundler à l'inclure dans le chunk principal — donc à le
 *  parser/exécuter à CHAQUE démarrage de l'app, y compris pour un utilisateur qui ne consulte
 *  jamais d'album avec pochette animée. Le module est mis en cache par le navigateur/bundler
 *  après le premier chargement, donc le coût ne revient plus ensuite.
 *
 *  On pourrait s'attendre à préférer le HLS natif de Safari (<video src="....m3u8">) plutôt que
 *  d'embarquer hls.js pour lui aussi : en pratique AVFoundation refuse ces flux précis avec
 *  MEDIA_ERR_SRC_NOT_SUPPORTED (constaté en conditions réelles), probablement à cause du
 *  découpage "trick-play" particulier qu'Apple utilise pour ses pochettes animées — assez
 *  différent d'un HLS "classique" pour que même l'outil de référence de cette intégration
 *  (github.com/m8tec/apple-music-animated-artworks, dont le lecteur web utilise hls.js "in any
 *  browser (not just Safari)") ne fasse pas confiance au moteur natif. hls.js/MSE gère ces flux
 *  sans problème partout où il est disponible (voir Hls.isSupported()).
 *
 *  Le HLS natif (<video src="...m3u8">, via supportsNativeHls) ne reste qu'un ultime repli, pour
 *  les moteurs sans MediaSource Extensions (Hls.isSupported() === false, ex. Safari iOS) mais qui
 *  savent lire du HLS nativement.
 *
 *  Boucle : PAS l'attribut `loop` natif. La cause réelle du "flash vers la pochette statique" a
 *  été identifiée en comparant le flux brut récupéré directement depuis l'API à ce qui s'affichait
 *  dans l'app : le fichier lui-même démarre par quelques images quasi figées, très proches
 *  visuellement de la pochette statique, avant que l'animation ne démarre vraiment. Ce n'est donc
 *  ni un bug de rendu propre à un moteur, ni un problème de `poster` — n'importe quelle technique
 *  de boucle qui revient pile à `currentTime = 0` (attribut `loop` natif compris) réaffiche
 *  fidèlement ce prologue à CHAQUE tour, d'où l'impression de "coupure" vers la pochette statique.
 *  On redémarre donc manuellement un peu après 0 (voir LOOP_RESTART_OFFSET_SECONDS) pour sauter ce
 *  prologue — mais uniquement lors des boucles suivantes : le tout premier affichage, lui, s'en
 *  accommode très bien (la pochette statique est déjà affichée juste en dessous à ce moment-là,
 *  voir AlbumPage.tsx, donc rien ne "tranche" avec ces toutes premières images). */
// Faut-il ajuster cette valeur ? Écoute une boucle et augmente-la si le prologue quasi figé est
// encore visible, ou diminue-la si le redémarrage saute une portion de l'animation elle-même.
const LOOP_RESTART_OFFSET_SECONDS = 0.5;
export function AnimatedAlbumCoverVideo({
  masterUrl,
  className,
}: AnimatedAlbumCoverVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Piste de l'URL en échec plutôt qu'un simple booléen : dérivé au rendu (comme
  // `resolved.key === albumKey` dans useAnimatedAlbumCover), pas de useEffect dédié pour le
  // réinitialiser — dès que `masterUrl` change, `erroredUrl` ne correspond plus, donc `hasError`
  // retombe à false sans action explicite.
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);
  // Contrairement à la version avec import statique, on ne peut plus savoir de façon synchrone
  // si l'environnement est supporté (Hls.isSupported() vit dans le module chargé à la volée) :
  // le <video> est donc monté de façon optimiste, et l'effet ci-dessous bascule sur `erroredUrl`
  // dès que le chargement du module révèle un environnement non supporté.
  const hasError = erroredUrl === masterUrl;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || hasError) return;

    let cancelled = false;
    let hls: Hls | null = null;

    const onEnded = () => {
      const offset = Number.isFinite(video.duration)
        ? Math.min(LOOP_RESTART_OFFSET_SECONDS, video.duration / 4)
        : LOOP_RESTART_OFFSET_SECONDS;
      video.currentTime = offset;
      void video.play();
    };
    video.addEventListener("ended", onEnded);

    // Fenêtre/onglet masqué·e (minimisée sur bureau) : coupe le décodage vidéo en continu
    // (coût CPU/GPU réel, contrairement à l'audio qui reste géré indépendamment par le
    // moteur gapless) plutôt que de le laisser tourner pour un rendu que personne ne voit.
    // Reprend automatiquement au retour au premier plan.
    const onVisibilityChange = () => {
      if (document.hidden) video.pause();
      else if (!video.ended) void video.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    import("hls.js").then(({ default: HlsCtor }) => {
      if (cancelled || !videoRef.current) return;

      if (!HlsCtor.isSupported()) {
        if (!supportsNativeHls()) {
          setErroredUrl(masterUrl);
          return;
        }
        video.src = masterUrl;
        video.play().catch(() => setErroredUrl(masterUrl));
        return;
      }

      hls = new HlsCtor();

      hls.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (!data.fatal || !hls) return;
        // hls.js sait récupérer la plupart des erreurs fatales sans tout reconstruire : un souci
        // réseau (timeout, requête échouée...) se résout en relançant le chargement, une corruption
        // du SourceBuffer en recréant le media-buffer sous-jacent. On ne retombe sur la pochette
        // statique que pour tout le reste (MUX_ERROR, OTHER_ERROR — véritablement irrécupérable).
        switch (data.type) {
          case HlsCtor.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            return;
          case HlsCtor.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            return;
          default:
            console.warn(
              "[animatedCover] Erreur hls.js fatale et non récupérable, repli sur la pochette statique",
              data,
            );
            if (!cancelled) setErroredUrl(masterUrl);
        }
      });

      hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        if (cancelled || !videoRef.current) return;
        videoRef.current.play().catch(() => {
          if (!cancelled) setErroredUrl(masterUrl);
        });
      });

      hls.loadSource(masterUrl);
      hls.attachMedia(video);
    });

    return () => {
      cancelled = true;
      video.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      hls?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [masterUrl, hasError]);

  if (hasError) return null;

  return (
    <video
      // Clé = source : force React à démonter/remonter plutôt que de réutiliser le nœud DOM
      // existant en ne changeant que `src`.
      key={masterUrl}
      ref={videoRef}
      className={className}
      muted
      autoPlay
      playsInline
      aria-hidden="true"
      onError={() => setErroredUrl(masterUrl)}
    />
  );
}
