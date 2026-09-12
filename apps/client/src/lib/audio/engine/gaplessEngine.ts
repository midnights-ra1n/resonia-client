import { detectEdgeSilence, logicalDuration, type SilenceTrim } from "./silenceTrim";
import type { EngineError, EngineState, EngineStateListener } from "./types";
import { debugLog } from "../debug/audioDebugLogger";

// Fondu très court, uniquement pour masquer le point de jonction entre deux sources
// (natif→buffer, ou deux AudioBufferSourceNode consécutifs) — pas pour compenser un
// écart de timing : la planification elle-même est sample-accurate. Porté de 8ms à 25ms
// car WebKit (donc l'app de bureau compilée) peut démarrer un AudioBufferSourceNode
// planifié avec un jitter de quelques millisecondes par rapport à l'instant demandé —
// avec une fenêtre trop courte, ce jitter suffisait à laisser passer un blanc audible
// entre la fin du fondu sortant et le début réel du fondu entrant.
const SWAP_FADE_SECONDS = 0.025;

// Avance de démarrage "silencieuse" de la piste suivante avant le début réel du fondu (voir
// `trySchedulePending`) : absorbe le jitter de démarrage d'un AudioBufferSourceNode planifié
// à l'avance sous WebKit, indépendamment de la largeur du fondu lui-même.
const PRESTART_MARGIN_SECONDS = 0.15;

// Fondu d'entrée appliqué à tout démarrage "à froid" d'un AudioBufferSourceNode
// (loadAndPlay depuis le cache décodé, resume(), seek()) — distinct de SWAP_FADE_SECONDS
// qui ne concerne que les jonctions entre deux sources déjà en cours de lecture. Un
// graphe Web Audio qui démarre à plein volume instantanément sur un thread audio inactif
// expose un artefact de démarrage connu sur WebKit (rattrapage du thread audio au réveil,
// perçu comme une accélération/pitch-up très brève) — masqué par un fondu, jamais par une
// planification différée qui romprait la réactivité au clic.
const COLD_START_FADE_SECONDS = 0.015;

// WAV silencieux (0,05s, 8-bit/4kHz mono) utilisé uniquement pour ancrer la session Now
// Playing du système — voir le commentaire sur `sessionAnchor` ci-dessous.
const SILENT_LOOP_DATA_URI =
  "data:audio/wav;base64,UklGRuwAAABXQVZFZm10IBAAAAABAAEAoA8AAKAPAAABAAgAZGF0YcgAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA==";

function describeMediaError(error: MediaError | null): string {
  if (!error) return "Lecture audio impossible (erreur inconnue)";
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "Lecture interrompue";
    case MediaError.MEDIA_ERR_NETWORK:
      return "Échec réseau pendant le chargement du flux audio";
    case MediaError.MEDIA_ERR_DECODE:
      return "Flux audio corrompu ou impossible à décoder";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "Format ou source audio non supporté par ce navigateur";
    default:
      return `Lecture audio impossible (code ${error.code})`;
  }
}

export interface DecodedTrack {
  buffer: AudioBuffer;
  trim: SilenceTrim;
}

interface ActiveNative {
  mode: "native";
  contextStartTime: number;
  pauseOffset: number;
  isPaused: boolean;
}

interface BufferPlayback {
  source: AudioBufferSourceNode;
  gain: GainNode;
  scheduledStartContextTime: number;
  startOffsetInTrim: number;
}

interface ActiveBuffer {
  mode: "buffer";
  buffer: AudioBuffer;
  trim: SilenceTrim;
  isPaused: boolean;
  pauseOffset: number; // valide uniquement quand isPaused
  playback: BufferPlayback | null; // null quand en pause (aucune source active)
}

type TrackState = ActiveNative | ActiveBuffer;

interface PendingNext {
  buffer: AudioBuffer;
  trim: SilenceTrim;
  onSwap: () => void;
  scheduled: boolean;
  scheduledSource?: AudioBufferSourceNode;
  scheduledGain?: GainNode;
}

/**
 * Moteur de lecture gapless : démarre chaque piste en streaming natif pour une réponse
 * instantanée au clic, puis la fait basculer vers un AudioBufferSourceNode dès qu'elle
 * est intégralement décodée (voir attachDecodedActive). Une fois en mode buffer, la
 * durée exacte (silence de bord rogné) est connue : la piste suivante est alors
 * PLANIFIÉE sur l'horloge de l'AudioContext (source.start à l'instant de fin calculé),
 * jamais déclenchée en réaction à un événement — c'est ce qui élimine toute coupure de
 * façon déterministe, sans heuristique de détection de silence en temps réel.
 */
export class GaplessEngine {
  context: AudioContext;
  private masterGain: GainNode;
  private nativeAudio: HTMLAudioElement;
  private nativeGain: GainNode;

  /** Sur WebKit (Safari et la webview macOS de l'app de bureau — WKWebView), l'intégration Now
   *  Playing (MPNowPlayingInfoCenter/MPRemoteCommandCenter) ne reste active que tant qu'un vrai
   *  élément <audio>/<video> est dans l'état "playing" — `navigator.mediaSession.playbackState`
   *  fixé manuellement ne suffit pas. Or dès qu'une piste bascule en mode buffer (voir
   *  `attachDecodedActive`), `nativeAudio` est mis en pause : plus aucun élément média ne joue
   *  réellement, WebKit gèle alors le widget système sur "lecture" et ignore les commandes
   *  distantes. Cet élément silencieux, indépendant du graphe audio, reste actif exactement en
   *  même temps que la lecture logique pour maintenir cette session vivante — nécessaire aussi
   *  bien en navigateur que sur desktop, puisque les deux s'appuient désormais uniquement sur
   *  `navigator.mediaSession` (voir `nowPlaying.ts`). */
  private sessionAnchor: HTMLAudioElement;

  private trackState: TrackState | null = null;
  private pendingNext: PendingNext | null = null;
  private onEndedCallback: (() => void) | null = null;

  /** Vitesse de lecture façon "pitch fader" de platine DJ : couple systématiquement vitesse
   *  et hauteur (aucun pitch-shifting indépendant — Web Audio n'offre pas de time-stretching
   *  natif). S'applique à `nativeAudio.playbackRate` en streaming, et à
   *  `AudioBufferSourceNode.playbackRate` une fois en mode buffer — voir `setPlaybackRate`
   *  pour le ré-ancrage de position et la replanification que ce second cas exige. */
  private _playbackRate = 1;

  /** "Master Tempo" : demande au navigateur de préserver la hauteur pendant que la vitesse
   *  change, via l'algorithme natif de l'élément <audio> (`preservesPitch`) — réel, mais
   *  seulement pour la brève phase de streaming natif en début de piste (voir
   *  `applyRateToNativeAudio`). Web Audio n'a pas d'équivalent pour
   *  AudioBufferSourceNode (mode buffer, l'essentiel de la lecture une fois la piste
   *  décodée) : la hauteur y redérive avec la vitesse, sans base technique pour l'en
   *  empêcher — limitation connue et acceptée, pas un bug. */
  private _preservePitch = false;

  // Contexte du dernier appel loadAndPlay en streaming natif, uniquement pour permettre au
  // handler "error" de retenter un démarrage progressif via MediaSource (voir
  // startNativeViaMediaSource) sans que l'appelant ait à rejouer loadAndPlay lui-même.
  private pendingStreamUrl: string | null = null;
  private pendingMimeType: string | null = null;
  private nativeFallbackAttempted = false;

  private _state: EngineState = "idle";
  private _error: EngineError | null = null;
  private stateListeners = new Set<EngineStateListener>();

  /** Prévient l'appelant quand la lecture native (piste active) atteint réellement
   *  l'état "playing" — le bon moment pour démarrer les tâches de fond (cache, décodage,
   *  préchargement) sans concurrencer le tout début de la lecture au clic. */
  onNativePlaying: (() => void) | null = null;

  /** Prévient l'appelant que le streaming natif est structurellement injouable pour cette
   *  piste (ex: Safari refuse tout flux dont le serveur répond `Accept-Ranges: none` à sa
   *  sonde `Range` initiale — comportement WebKit propre, indépendant d'un vrai problème
   *  réseau/codec). L'appelant est responsable de relancer la lecture via un chemin qui ne
   *  dépend pas des ranges HTTP (fetch complet + decodeAudioData, déjà utilisé pour le
   *  préchargement gapless) en repassant par `loadAndPlay(url, offset, decoded)`. */
  onNativePlaybackUnsupported: ((offset: number) => void) | null = null;

  /** Prévient l'appelant d'une pression réseau (stall/seek en cours) pour qu'il suspende
   *  son propre préchargement en tâche de fond, et de son relâchement pour le reprendre.
   *  Délibérément découplé du cache : ce moteur ne connaît aucun module de cache. */
  onNetworkPressure: ((active: boolean) => void) | null = null;

  constructor() {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);

    this.nativeAudio = this.createNativeAudioElement();
    const mediaSource = this.context.createMediaElementSource(this.nativeAudio);
    this.nativeGain = this.context.createGain();
    mediaSource.connect(this.nativeGain);
    this.nativeGain.connect(this.masterGain);
    this.applyRateToNativeAudio();

    this.sessionAnchor = new Audio(SILENT_LOOP_DATA_URI);
    this.sessionAnchor.loop = true;
    // Ni `muted` ni `volume` ne sont nécessaires pour garantir le silence : le WAV
    // lui-même ne contient que du silence numérique (PCM au point médian). Les deux ont
    // pourtant été évités : `volume = 0` d'abord (voir historique), et `muted = true` s'est
    // révélé avoir le même défaut à l'usage — WebKit semble exclure un élément
    // muet/à volume nul de son heuristique "y a-t-il vraiment un flux audio actif", ce qui
    // dégrade le contrôle interactif du widget Now Playing système : le bouton play/pause
    // reste figé (non cliquable) après un enchaînement gapless vers la piste suivante, alors
    // que la piste réelle (elle, jouée via le graphe Web Audio) continue normalement.
    // Un volume non nul et non muet — mais imperceptible — contourne les deux heuristiques.
    this.sessionAnchor.muted = false;
    this.sessionAnchor.volume = 0.01;
    this.sessionAnchor.preload = "auto";

    this.installAutoplayUnlock();
    this.installOutputDeviceChangeHandler();
  }

  /** Crée un élément <audio> "natif" fraîchement câblé avec tous les listeners dont dépend le
   *  streaming progressif (voir le constructeur pour le détail de chacun). Extrait du
   *  constructeur pour pouvoir en recréer un à l'identique dans `rebuildAudioGraph` — un
   *  HTMLMediaElement ne peut être passé qu'une seule fois à `createMediaElementSource` sur
   *  toute sa durée de vie, il faut donc systématiquement un nouvel élément avec un nouvel
   *  AudioContext. */
  private createNativeAudioElement(): HTMLAudioElement {
    const audio = new Audio();
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";

    audio.addEventListener("waiting", () => {
      if (this.trackState?.mode === "native") {
        this.setState("buffering");
        this.onNetworkPressure?.(true);
      }
    });
    audio.addEventListener("seeking", () => {
      if (this.trackState?.mode === "native") this.onNetworkPressure?.(true);
    });
    audio.addEventListener("canplay", () => {
      if (this.trackState?.mode === "native") {
        this.onNetworkPressure?.(false);
        if (this._state === "loading" || this._state === "buffering") this.setState("ready");
      }
    });
    audio.addEventListener("playing", () => {
      if (this.trackState?.mode === "native") {
        this.onNetworkPressure?.(false);
        this.setState("playing");
        this.onNativePlaying?.();
        // Sur Safari, l'élément <audio> peut atteindre "playing" (currentTime avance, aucune
        // erreur) alors que l'AudioContext est resté suspendu — puisque tout l'audio passe
        // par le graphe WebAudio (createMediaElementSource), le résultat est un silence total
        // sans aucun signal d'échec. On revérifie donc ici, avec réessais, indépendamment de
        // l'unlock au premier geste.
        this.resumeContextWithRetry();
      }
    });
    audio.addEventListener("ended", () => this.handleNativeEnded());
    // Sans ce listener, un échec de chargement (CORS refusé, codec non supporté par
    // WebKit/Safari — ex: Opus — flux réseau invalide) laisse l'élément <audio> planté
    // silencieusement en l'état "loading" : aucune erreur ne remonte nulle part ailleurs.
    audio.addEventListener("error", () => {
      if (this.trackState?.mode !== "native" || audio !== this.nativeAudio) return;
      const mediaError = audio.error;
      const offset = this.trackState.pauseOffset;

      if (mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        // Priorité au streaming progressif via MediaSource : évite d'attendre le
        // téléchargement complet du fichier avant de démarrer. Limité au démarrage à froid
        // (offset 0) — un reprise/seek après échec retombe directement sur le repli complet,
        // plus simple à positionner précisément dans un buffer déjà entièrement décodé.
        if (
          !this.nativeFallbackAttempted &&
          offset === 0 &&
          this.pendingStreamUrl &&
          this.pendingMimeType &&
          typeof MediaSource !== "undefined" &&
          MediaSource.isTypeSupported(this.pendingMimeType)
        ) {
          this.nativeFallbackAttempted = true;
          this.startNativeViaMediaSource(this.pendingStreamUrl, this.pendingMimeType);
          return;
        }
        if (this.onNativePlaybackUnsupported) {
          this.onNativePlaybackUnsupported(offset);
          return;
        }
      }
      this.reportError(describeMediaError(mediaError), mediaError);
    });

    return audio;
  }

  /** `AudioContext.destination` reste lié au périphérique de sortie par défaut tel qu'il était
   *  AU MOMENT de la création du contexte — sur WebKit/WKWebView (donc l'app de bureau
   *  compilée), il ne suit PAS automatiquement un changement de périphérique par défaut (ex:
   *  débranchement d'un casque après l'avoir sélectionné comme sortie) : la lecture continue
   *  d'écrire silencieusement vers un périphérique disparu. La seule parade fiable est de
   *  reconstruire entièrement le graphe (nouvel AudioContext, donc nouvelle `destination`
   *  liée au nouveau périphérique par défaut) dès que le système signale un changement. */
  private installOutputDeviceChangeHandler() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    let debounce: ReturnType<typeof window.setTimeout> | null = null;
    navigator.mediaDevices.addEventListener("devicechange", () => {
      // `devicechange` peut se déclencher plusieurs fois de suite pour un seul branchement/
      // débranchement physique (énumération des entrées ET sorties) : on ne reconstruit qu'une
      // fois l'événement retombé.
      if (debounce !== null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        this.rebuildAudioGraph();
      }, 300);
    });
  }

  /** Reconstruit entièrement le graphe Web Audio (nouveau AudioContext + noeuds de gain +
   *  élément <audio> natif) tout en préservant la lecture en cours (piste, position, état
   *  pause/lecture, piste suivante déjà planifiée). Provoque une coupure très brève,
   *  inévitable ici (l'ancien graphe écrit vers un périphérique disparu, il n'y a rien à
   *  faire fondre en douceur) — très largement préférable à un silence complet jusqu'à la
   *  prochaine action de l'utilisateur. */
  private rebuildAudioGraph() {
    if (!this.trackState) return; // rien ne joue : le prochain loadAndPlay/resume repartira sur un graphe déjà à jour

    const oldContext = this.context;
    const oldNativeAudio = this.nativeAudio;
    const volume = this.masterGain.gain.value;

    // Capturé AVANT toute bascule : this.currentTime dépend encore de l'ancien trackState/
    // contexte à ce stade.
    const mode = this.trackState.mode;
    const wasPaused = this.isTrackStatePaused(this.trackState);
    const position = this.currentTime;
    const bufferState =
      this.trackState.mode === "buffer"
        ? { buffer: this.trackState.buffer, trim: this.trackState.trim }
        : null;
    const nativeUrl = mode === "native" ? oldNativeAudio.src : null;

    // La piste déjà planifiée référence des noeuds liés à l'ancien contexte : on les détache
    // sans perdre buffer/trim/onSwap, pour la replanifier une fois le nouveau graphe en place.
    const savedPending = this.pendingNext
      ? { buffer: this.pendingNext.buffer, trim: this.pendingNext.trim, onSwap: this.pendingNext.onSwap }
      : null;
    this.discardPending();
    this.stopCurrentBufferPlayback();
    oldNativeAudio.pause();

    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.setValueAtTime(volume, this.context.currentTime);
    this.masterGain.connect(this.context.destination);

    this.nativeAudio = this.createNativeAudioElement();
    const mediaSource = this.context.createMediaElementSource(this.nativeAudio);
    this.nativeGain = this.context.createGain();
    mediaSource.connect(this.nativeGain);
    this.nativeGain.connect(this.masterGain);
    this.applyRateToNativeAudio();

    this.trackState = null;

    if (mode === "native" && nativeUrl) {
      this.nativeAudio.src = nativeUrl;
      this.nativeAudio.currentTime = position;
      // Certains moteurs (WebKit en tête) réinitialisent playbackRate/preservesPitch au
      // moment où `src` est réassigné (l'algorithme de "chargement de ressource média" du
      // spec HTML remet certains attributs à leur valeur par défaut) — on les réapplique
      // donc systématiquement APRÈS toute assignation de `src`, jamais seulement avant.
      this.applyRateToNativeAudio();
      this.trackState = {
        mode: "native",
        contextStartTime: this.context.currentTime - position,
        pauseOffset: position,
        isPaused: wasPaused,
      };
      if (wasPaused) {
        this.setState("paused");
      } else {
        this.nativeAudio
          .play()
          .catch((err) =>
            this.reportError("Reprise de lecture impossible après changement de périphérique audio", err),
          );
      }
    } else if (bufferState) {
      this.startBufferAt(bufferState.buffer, bufferState.trim, position, wasPaused);
    }

    if (savedPending) {
      this.pendingNext = { ...savedPending, scheduled: false };
      this.trySchedulePending();
    }

    oldNativeAudio.removeAttribute("src");
    oldNativeAudio.load();
    void oldContext.close().catch(() => {});
  }

  /** Relance context.resume() avec réessais (délais croissants) tant que le contexte reste
   *  "suspended" — nécessaire sur Safari où une seule tentative "fire-and-forget" peut ne
   *  jamais aboutir (ex: activation du geste jugée insuffisante par WebKit) sans qu'aucune
   *  erreur ne soit levée nulle part. Ne fait rien si le contexte tourne déjà. */
  private resumeContextWithRetry(attempt = 0) {
    if (this.context.state !== "suspended") return;
    const delays = [0, 150, 500, 1500];
    const delay = delays[attempt] ?? delays[delays.length - 1];
    window.setTimeout(() => {
      if (this.context.state !== "suspended") return;
      this.context
        .resume()
        .then(() => {
          if (this.context.state === "suspended" && attempt < delays.length - 1) {
            this.resumeContextWithRetry(attempt + 1);
          }
        })
        .catch(() => {
          if (attempt < delays.length - 1) this.resumeContextWithRetry(attempt + 1);
        });
    }, delay);
  }

  private installAutoplayUnlock() {
    if (typeof window === "undefined") return;
    const unlock = () => {
      if (this.context.state === "suspended") this.context.resume().catch(() => {});
      try {
        const buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
        const src = this.context.createBufferSource();
        src.buffer = buffer;
        src.connect(this.context.destination);
        src.start(0);
      } catch {
        /* noop */
      }
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    const handler = () => {
      unlock();
      events.forEach((e) => window.removeEventListener(e, handler));
    };
    events.forEach((e) => window.addEventListener(e, handler, { once: true, passive: true }));
  }

  // ---- état exposé ----

  get state(): EngineState {
    return this._state;
  }

  get error(): EngineError | null {
    return this._error;
  }

  onStateChange(cb: EngineStateListener): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  private setState(state: EngineState, error: EngineError | null = null) {
    debugLog("engine:setState", { from: this._state, to: state });
    this._state = state;
    this._error = error;
    // L'ancre reste active tant qu'une piste est chargée, pause comprise : la couper en
    // pause fait perdre à l'app son statut de cible valide pour les commandes distantes
    // système (macOS/Windows/Linux), et le bouton play du widget Now Playing cesse alors de
    // répondre — seul un retour à `idle` (rien de chargé) doit vraiment l'arrêter.
    if (state === "playing" || state === "paused") this.startSessionAnchor();
    else if (state === "idle") this.stopSessionAnchor();
    this.stateListeners.forEach((cb) => cb(state, error));
  }

  /** File d'attente sérialisée pour les transitions play()/pause() de `sessionAnchor` : des
   *  changements d'état rapprochés (double-appui sur une touche média, espace + touche média
   *  quasi simultanés...) peuvent sinon appeler `.pause()` pendant qu'un `.play()` précédent
   *  est encore en vol — WebKit lève alors une AbortError qui laisse l'élément réellement en
   *  lecture ou en pause à l'insu du code appelant, désynchronisant silencieusement l'ancrage
   *  Now Playing sans qu'aucune erreur ne remonte nulle part. Chaque demande attend la
   *  précédente et abandonne si une demande plus récente l'a déjà emporté entre-temps. */
  private anchorQueue: Promise<void> = Promise.resolve();
  private anchorDesiredPlaying = false;

  private setSessionAnchorPlaying(playing: boolean) {
    this.anchorDesiredPlaying = playing;
    debugLog("sessionAnchor:request", { playing, engineState: this._state });
    this.anchorQueue = this.anchorQueue.then(async () => {
      if (this.anchorDesiredPlaying !== playing) {
        debugLog("sessionAnchor:superseded", { requested: playing, current: this.anchorDesiredPlaying });
        return; // supplanté entre-temps
      }
      if (playing) {
        try {
          await this.sessionAnchor.play();
          debugLog("sessionAnchor:played", { paused: this.sessionAnchor.paused });
        } catch (err) {
          debugLog("sessionAnchor:play-rejected", { error: String(err) });
          /* noop — un rejet ici n'affecte pas la lecture réelle, seule l'intégration système en pâtit */
        }
      } else {
        this.sessionAnchor.pause();
        debugLog("sessionAnchor:paused", { paused: this.sessionAnchor.paused, nativeAudioPaused: this.nativeAudio.paused });
      }
    });
  }

  private startSessionAnchor() {
    this.setSessionAnchorPlaying(true);
  }

  private stopSessionAnchor() {
    this.setSessionAnchorPlaying(false);
  }

  reportError(message: string, cause?: unknown) {
    console.error(`[audio] ${message}`, cause);
    this.setState("error", { message, cause });
  }

  onEnded(cb: () => void) {
    this.onEndedCallback = cb;
  }

  setVolume(v: number) {
    const clamped = Math.min(1, Math.max(0, v));
    const now = this.context.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(clamped, now);
    // WebKit n'applique pas l'automation d'un GainNode situé en aval d'un
    // MediaElementAudioSourceNode : tant que la piste est en streaming natif (<audio>), le
    // graphe ci-dessus est donc inopérant sur Safari — le son reste à son niveau d'origine
    // quelle que soit la valeur de masterGain, sauf au strict minimum où WebKit rend bien un
    // vrai silence. On pilote donc en plus le volume natif de l'élément lui-même, qui lui est
    // toujours respecté par WebKit ; sur les navigateurs conformes (Chrome/Firefox), le volume
    // de l'élément est ignoré une fois routé vers Web Audio, donc ceci n'a aucun effet double.
    this.nativeAudio.volume = clamped;
    this.nativeAudio.muted = clamped <= 0;
  }

  get playbackRate(): number {
    return this._playbackRate;
  }

  private applyRateToNativeAudio() {
    this.nativeAudio.playbackRate = this._playbackRate;
    // `false` par défaut (pitch fader "platine DJ" : vitesse et hauteur couplées) ; `true`
    // quand Master Tempo est actif, voir le commentaire sur `_preservePitch`.
    this.nativeAudio.preservesPitch = this._preservePitch;
    (this.nativeAudio as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = this._preservePitch;
    (this.nativeAudio as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = this._preservePitch;
  }

  /** Voir le commentaire sur `_preservePitch`. N'affecte que la phase de streaming natif —
   *  n'a aucun effet une fois la piste basculée en mode buffer (attachDecodedActive). */
  setPreservePitch(preserve: boolean) {
    if (preserve === this._preservePitch) return;
    this._preservePitch = preserve;
    this.applyRateToNativeAudio();
  }

  /** Change vitesse ET hauteur ensemble (façon pitch fader de platine DJ) — voir le
   *  commentaire sur `_playbackRate`. En mode buffer, la source active est ré-ancrée
   *  (nouveau couple temps-contexte/position-piste à la vitesse précédente) avant que sa
   *  propre vitesse ne change, sans quoi `currentTime` deviendrait faux instantanément ;
   *  la piste suivante déjà planifiée (`trySchedulePending`) l'a été sur la base de
   *  l'ancienne vitesse, elle est donc annulée puis replanifiée. */
  setPlaybackRate(rate: number) {
    const clamped = Math.min(2, Math.max(0.5, rate));
    if (clamped === this._playbackRate) return;

    if (this.trackState?.mode === "buffer" && this.trackState.playback && !this.trackState.isPaused) {
      const { buffer, trim, playback } = this.trackState;
      const position = this.currentTime;
      const now = this.context.currentTime;
      playback.scheduledStartContextTime = now;
      playback.startOffsetInTrim = position;
      playback.source.playbackRate.setValueAtTime(clamped, now);

      // `startBufferAt`/`trySchedulePending` avaient programmé un `stop()` dur à un instant
      // de contexte absolu calculé sous l'ancienne vitesse. Sans le replanifier ici, ralentir
      // la lecture (rate < ancienne valeur) laisse cet ancien arrêt tomber AVANT que la piste
      // n'ait réellement fini de jouer à la nouvelle vitesse : la source est coupée en plein
      // milieu, son `onended` se déclenche, et le moteur croit la piste terminée — coupure
      // brutale suivie d'un passage à la piste suivante sans aucune action de l'utilisateur.
      // `trySchedulePending` ci-dessous ne corrige ce cas que si une piste suivante est déjà
      // prête (`pendingNext` non nul) ; on réancre donc systématiquement ce `stop()` ici,
      // indépendamment de l'état du préchargement.
      const remaining = Math.max(logicalDuration(buffer, trim) - position, 0);
      try {
        playback.source.stop(now + remaining / clamped);
      } catch {
        /* noop */
      }
    }

    this._playbackRate = clamped;
    this.applyRateToNativeAudio();

    if (this.trackState?.mode === "buffer" && !this.trackState.isPaused) {
      if (this.pendingNext?.scheduled) this.unschedulePending();
      this.trySchedulePending();
    }
  }

  // ---- décodage ----

  /** `decodeAudioData` détache le buffer qu'on lui passe (transfert de propriété) : on ne
   *  le recopie plus défensivement avant l'appel — tous les appelants (voir
   *  `decodeAndTrim`) passent un buffer fraîchement lu/téléchargé, jamais réutilisé
   *  ensuite, donc rien ne dépend de son intégrité après ce point. Un memcpy synchrone de
   *  plusieurs Mo à chaque transition de piste était une cause de micro-freeze de l'UI. */
  async decode(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return this.context.decodeAudioData(arrayBuffer);
  }

  async decodeAndTrim(arrayBuffer: ArrayBuffer): Promise<DecodedTrack> {
    // Capturé avant l'appel : `decodeAudioData` détache/transfère `arrayBuffer`, sa
    // `byteLength` redevient 0 une fois la promesse résolue.
    const bytes = arrayBuffer.byteLength;
    const decodeStart = performance.now();
    const buffer = await this.decode(arrayBuffer);
    const durationMs = performance.now() - decodeStart;
    const trim = detectEdgeSilence(buffer);
    debugLog("decode:trim", { durationSec: buffer.duration, trimStartSec: trim.start, trimEndSec: trim.end });
    // Débit de décodage ("ffmpeg-like") consommé par l'historique 60s du panneau développeur —
    // voir `getBandwidthHistory` dans audioDebugLogger.ts.
    debugLog("decode:throughput", { bytes, durationMs });
    return { buffer, trim };
  }

  // ---- lecture ----

  /** Démarre la lecture d'une piste. Si `decoded` est fourni (piste déjà préparée, ex:
   *  retour arrière sur une piste déjà décodée), démarre directement en mode buffer,
   *  sample-accurate dès la première image. Sinon démarre en streaming natif pour une
   *  réponse instantanée au clic. `mimeType`, si fourni, permet un repli en streaming
   *  progressif (MediaSource) si ce streaming natif échoue (voir handler "error" ci-dessus)
   *  — sans lui, l'appelant ne peut recevoir que le repli `onNativePlaybackUnsupported`. */
  loadAndPlay(url: string, offset = 0, decoded?: DecodedTrack, mimeType?: string) {
    if (this.context.state === "suspended") this.resumeContextWithRetry();
    this.discardPending();
    this.teardownCurrent();
    this.setState("loading");
    this.nativeFallbackAttempted = false;
    this.pendingStreamUrl = url;
    this.pendingMimeType = mimeType ?? null;

    if (decoded) {
      this.startBufferAt(decoded.buffer, decoded.trim, offset);
      return;
    }

    // Ne jamais placer d'`await` avant `.play()` : sur Safari, un `await` avant cet appel
    // peut faire perdre l'activation utilisateur du geste en cours (rejet NotAllowedError).
    this.nativeAudio.pause();
    const now = this.context.currentTime;
    this.nativeGain.gain.cancelScheduledValues(now);
    this.nativeGain.gain.setValueAtTime(1, now);

    this.nativeAudio.src = url;
    this.nativeAudio.currentTime = offset;
    // Voir le commentaire équivalent dans rebuildAudioGraph : à réappliquer après CHAQUE
    // changement de `src`, pas seulement à la création de l'élément — sans quoi un
    // changement rapide de piste peut silencieusement retomber sur une vitesse/hauteur
    // par défaut malgré un pitch fader ou un Master Tempo actifs.
    this.applyRateToNativeAudio();
    this.nativeAudio.play().catch((err) => {
      this.context
        .resume()
        .then(() => this.nativeAudio.play().catch((e) => this.reportError("Lecture impossible après reprise du contexte audio", e)))
        .catch(() => this.reportError("Lecture instantanée impossible", err));
    });

    this.trackState = { mode: "native", contextStartTime: now, pauseOffset: offset, isPaused: false };
  }

  /** Repli quand le streaming natif direct échoue avec MEDIA_ERR_SRC_NOT_SUPPORTED (typ.
   *  Safari + serveur `Accept-Ranges: none` sur un flux transcodé à la volée) : au lieu
   *  d'attendre le téléchargement intégral du fichier avant de pouvoir jouer quoi que ce
   *  soit, on alimente un SourceBuffer au fil de l'eau depuis un fetch() classique — qui,
   *  lui, ne dépend d'aucun support de Range côté serveur. `.play()` est appelé de façon
   *  synchrone juste après l'assignation du src (comme dans loadAndPlay), donc dans le même
   *  contexte d'activation que l'appel initial ; seule l'alimentation du buffer est async. */
  private startNativeViaMediaSource(url: string, mimeType: string) {
    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener(
      "sourceopen",
      () => {
        URL.revokeObjectURL(objectUrl);
        let sourceBuffer: SourceBuffer;
        try {
          sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        } catch (err) {
          this.reportError("Flux progressif non supporté par ce navigateur", err);
          return;
        }

        fetch(url)
          .then((res) => {
            if (!res.ok || !res.body) throw new Error(`Échec du téléchargement (${res.status})`);
            const reader = res.body.getReader();

            const appendChunk = (chunk: Uint8Array): Promise<void> =>
              new Promise((resolve, reject) => {
                const onUpdateEnd = () => {
                  sourceBuffer.removeEventListener("updateend", onUpdateEnd);
                  resolve();
                };
                sourceBuffer.addEventListener("updateend", onUpdateEnd);
                try {
                  sourceBuffer.appendBuffer(chunk as BufferSource);
                } catch (err) {
                  sourceBuffer.removeEventListener("updateend", onUpdateEnd);
                  reject(err);
                }
              });

            const pump = (): Promise<void> =>
              reader.read().then(({ done, value }) => {
                if (done) {
                  if (mediaSource.readyState === "open") mediaSource.endOfStream();
                  return;
                }
                return appendChunk(value).then(pump);
              });

            return pump();
          })
          .catch((err) => this.reportError("Flux progressif interrompu", err));
      },
      { once: true },
    );

    this.nativeAudio.pause();
    const now = this.context.currentTime;
    this.nativeGain.gain.cancelScheduledValues(now);
    this.nativeGain.gain.setValueAtTime(1, now);

    this.nativeAudio.src = objectUrl;
    this.nativeAudio.currentTime = 0;
    this.applyRateToNativeAudio();
    this.nativeAudio.play().catch((err) => {
      this.context
        .resume()
        .then(() => this.nativeAudio.play().catch((e) => this.reportError("Lecture progressive impossible après reprise du contexte audio", e)))
        .catch(() => this.reportError("Lecture progressive impossible", err));
    });

    this.trackState = { mode: "native", contextStartTime: now, pauseOffset: 0, isPaused: false };
  }

  /** Bascule la piste active du streaming natif vers un AudioBufferSourceNode dès que son
   *  décodage complet est prêt : à partir de là, la durée exacte de la piste est connue,
   *  et la transition vers la piste suivante devient planifiable au sample près. */
  attachDecodedActive(decoded: DecodedTrack) {
    if (!this.trackState || this.trackState.mode !== "native") return;
    const wasPaused = this.trackState.isPaused;
    // `this.currentTime` en mode natif renvoie la position BRUTE dans le fichier (silence de
    // tête inclus, l'élément <audio> ne sait rien du rognage) alors que `startBufferAt` attend
    // un décalage LOGIQUE (déjà relatif à `trim.start`, comme tout le reste du moteur une fois
    // en mode buffer) et lui ajoute lui-même `trim.start`. Sans cette conversion, le rognage
    // était compté deux fois lors du basculement streaming→buffer, provoquant un saut en avant
    // audible égal à la durée du silence de tête (typiquement quelques centaines de ms à ~1s).
    const position = Math.max(0, this.currentTime - decoded.trim.start);

    const nativeAudioRef = this.nativeAudio;
    const now = this.context.currentTime;
    this.nativeGain.gain.cancelScheduledValues(now);
    this.nativeGain.gain.setValueAtTime(this.nativeGain.gain.value, now);
    this.nativeGain.gain.linearRampToValueAtTime(0, now + SWAP_FADE_SECONDS);
    this.nativeGain.gain.setValueAtTime(1, now + SWAP_FADE_SECONDS + 0.02);
    window.setTimeout(() => {
      if (nativeAudioRef === this.nativeAudio) nativeAudioRef.pause();
    }, SWAP_FADE_SECONDS * 1000 + 20);

    this.startBufferAt(decoded.buffer, decoded.trim, position, wasPaused);
  }

  pause() {
    if (!this.trackState) return;
    if (this.trackState.mode === "native") {
      if (this.trackState.isPaused) return;
      this.trackState.pauseOffset = this.currentTime;
      this.trackState.isPaused = true;
      this.nativeAudio.pause();
    } else {
      if (this.trackState.isPaused) return;
      const offset = this.currentTime;
      this.unschedulePending();
      this.stopCurrentBufferPlayback();
      this.trackState = { mode: "buffer", buffer: this.trackState.buffer, trim: this.trackState.trim, isPaused: true, pauseOffset: offset, playback: null };
    }
    this.setState("paused");
    // Un AudioContext "running" continue de tourner son graphe de rendu (thread audio actif,
    // callbacks réguliers) même sans aucune source active — coût CPU permanent et inutile en
    // pause. `resume()`/`loadAndPlay()` relancent déjà le contexte au besoin (voir
    // `resumeContextWithRetry`), donc rien ne dépend de le laisser "running" ici.
    // `decodeAudioData` (préchargement pendant la pause) n'a besoin d'aucun contexte actif.
    this.context.suspend().catch(() => {});
  }

  resume() {
    if (!this.trackState || !this.isTrackStatePaused(this.trackState)) return;
    if (this.context.state === "suspended") this.resumeContextWithRetry();
    if (this.trackState.mode === "native") {
      this.trackState.isPaused = false;
      this.nativeAudio.play().catch((err) => this.reportError("Reprise de lecture impossible", err));
      this.trackState.contextStartTime = this.context.currentTime - this.nativeAudio.currentTime;
      this.setState("playing");
    } else {
      this.startBufferAt(this.trackState.buffer, this.trackState.trim, this.trackState.pauseOffset);
    }
  }

  seek(time: number) {
    if (!this.trackState) return;
    const clamped = Math.max(0, Math.min(time, this.duration));

    if (this.trackState.mode === "native") {
      this.nativeAudio.currentTime = clamped;
      this.trackState.pauseOffset = clamped;
      this.trackState.contextStartTime = this.context.currentTime - clamped;
      return;
    }

    if (this.trackState.isPaused) {
      this.trackState.pauseOffset = clamped;
      return;
    }

    this.unschedulePending();
    this.startBufferAt(this.trackState.buffer, this.trackState.trim, clamped);
  }

  /** Planifie la piste suivante : dès que la piste active est en mode buffer et joue,
   *  programme immédiatement le démarrage exact du prochain AudioBufferSourceNode sur
   *  l'horloge — sinon, reste en attente jusqu'à ce que la piste active bascule en mode
   *  buffer (voir attachDecodedActive) ou reprenne après une pause/un seek. */
  scheduleNext(buffer: AudioBuffer, trim: SilenceTrim, onSwap: () => void) {
    this.discardPending();
    this.pendingNext = { buffer, trim, onSwap, scheduled: false };
    this.trySchedulePending();
  }

  stop() {
    this.discardPending();
    this.teardownCurrent();
    this.trackState = null;
    this.setState("idle");
    // Voir le commentaire équivalent dans pause() : aucune raison de laisser le graphe de
    // rendu tourner une fois la file vidée.
    this.context.suspend().catch(() => {});
  }

  get currentTime(): number {
    if (!this.trackState) return 0;
    if (this.trackState.mode === "native") {
      return this.trackState.isPaused ? this.trackState.pauseOffset : this.nativeAudio.currentTime;
    }
    if (this.trackState.isPaused || !this.trackState.playback) return this.trackState.pauseOffset;
    const { scheduledStartContextTime, startOffsetInTrim } = this.trackState.playback;
    return startOffsetInTrim + (this.context.currentTime - scheduledStartContextTime) * this._playbackRate;
  }

  get duration(): number {
    if (!this.trackState) return 0;
    if (this.trackState.mode === "native") return this.nativeAudio.duration || 0;
    return logicalDuration(this.trackState.buffer, this.trackState.trim);
  }

  // ---- internes ----

  private isTrackStatePaused(state: TrackState): boolean {
    return state.isPaused;
  }

  private startBufferAt(buffer: AudioBuffer, trim: SilenceTrim, offsetRaw: number, startPaused = false) {
    this.stopCurrentBufferPlayback();

    // `offsetRaw` peut dépasser la durée logique (ex: `attachDecodedActive` le dérive de la
    // position BRUTE de l'élément <audio> natif, qui peut avoir déjà avancé dans le silence de
    // fin — jusqu'à `trim.end`, borné à MAX_TRIM_SECONDS — que le mode buffer, lui, rogne). Sans
    // ce clamp, `remaining` ci-dessous tombe à 0 et la source démarrée à l'instant est stoppée
    // quasi immédiatement : son `onended` se déclenche aussitôt, déclenchant soit la coupure
    // prématurée de la piste (si aucune suivante prête), soit un crossfade vers la piste
    // suivante bien avant la fin réelle perçue — coupure/saccade au moment précis de la bascule
    // streaming natif → buffer, plus probable quand le pitch fader raccourcit la fenêtre réelle
    // de lecture restante (rate > 1).
    const offset = Math.min(Math.max(0, offsetRaw), logicalDuration(buffer, trim));

    if (startPaused) {
      this.trackState = { mode: "buffer", buffer, trim, isPaused: true, pauseOffset: offset, playback: null };
      this.setState("paused");
      return;
    }

    const now = this.context.currentTime;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + COLD_START_FADE_SECONDS);
    gain.connect(this.masterGain);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(this._playbackRate, now);
    source.connect(gain);
    debugLog("buffer:start", { offset, trimStartSec: trim.start, bufferPositionSec: trim.start + offset });
    source.start(now, trim.start + offset);

    const remaining = Math.max(logicalDuration(buffer, trim) - offset, 0);
    try {
      source.stop(now + remaining / this._playbackRate);
    } catch {
      /* noop */
    }
    source.onended = () => this.handleBufferSourceEnded(source);

    this.trackState = {
      mode: "buffer",
      buffer,
      trim,
      isPaused: false,
      pauseOffset: 0,
      playback: { source, gain, scheduledStartContextTime: now, startOffsetInTrim: offset },
    };
    this.setState("playing");
    this.trySchedulePending();
  }

  private stopCurrentBufferPlayback() {
    if (this.trackState?.mode === "buffer" && this.trackState.playback) {
      const { source, gain } = this.trackState.playback;
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* noop */
      }
      try {
        gain.disconnect();
      } catch {
        /* noop */
      }
    }
  }

  /** Programme, sur l'horloge de l'AudioContext, le démarrage de la piste en attente
   *  autour de l'instant de fin calculé de la piste courante — aucune attente d'événement,
   *  aucune heuristique : purement déterministe. No-op si la piste courante n'est pas
   *  actuellement en train de jouer en mode buffer, ou si déjà planifié.
   *
   *  La jonction elle-même est un micro-crossfade symétrique (piste courante 1→0, piste
   *  suivante 0→1, sur la même fenêtre de SWAP_FADE_SECONDS se terminant à `endTime`) plutôt
   *  qu'un raccord bord-à-bord (arrêt sec + fade-in seul après coup). Sur Chromium, deux
   *  AudioBufferSourceNode démarré/arrêté au même instant s'enchaînent déjà sample-accurate ;
   *  WebKit (moteur de l'app desktop compilée) est en pratique moins fiable sur cet
   *  alignement pile-à-pile et peut laisser un micro-gap au raccord — un vrai chevauchement
   *  audible absorbe cette imprécision des deux côtés. `endTime` reste la référence logique
   *  (position 0 de la piste suivante, bascule d'état) : le début physique de `nextSource`
   *  est avancé de PRESTART_MARGIN_SECONDS + SWAP_FADE_SECONDS pour ce chevauchement — voir
   *  le commentaire sur `prerollMargin` ci-dessous pour la raison des deux marges distinctes. */
  private trySchedulePending() {
    if (!this.pendingNext || this.pendingNext.scheduled) return;
    if (!this.trackState || this.trackState.mode !== "buffer" || this.trackState.isPaused || !this.trackState.playback) return;

    const { buffer: curBuffer, trim: curTrim, playback } = this.trackState;
    const { source: curSource, gain: curGain, scheduledStartContextTime, startOffsetInTrim } = playback;
    const rate = this._playbackRate;
    // Temps-piste et temps-contexte divergent dès que `rate !== 1` : la source consomme
    // `logicalDuration - startOffsetInTrim` secondes de piste en
    // `(logicalDuration - startOffsetInTrim) / rate` secondes réelles.
    const naturalEndTime = scheduledStartContextTime + (logicalDuration(curBuffer, curTrim) - startOffsetInTrim) / rate;
    const now = this.context.currentTime;
    // Si la piste suivante n'a fini d'être préparée (téléchargement + décodage) qu'après le
    // début de fenêtre de fondu prévue — voire après la fin naturelle de la piste courante —
    // planifier le fondu sur `naturalEndTime` produirait des instants d'automation déjà dans
    // le passé : Web Audio les applique alors instantanément, ce qui écrase le fondu en une
    // coupure sèche (le défaut même qu'on cherche à masquer). On ancre donc systématiquement
    // la fenêtre de fondu à un instant futur garanti, quitte à raccourcir le chevauchement.
    const endTime = Math.max(naturalEndTime, now + SWAP_FADE_SECONDS);
    const crossfadeStart = Math.max(endTime - SWAP_FADE_SECONDS, now);

    if (endTime > naturalEndTime) {
      // `startBufferAt` avait déjà programmé l'arrêt de `curSource` à `naturalEndTime` (fin
      // exacte, silence de bord compris) : repousser cet arrêt pour qu'il ne coupe pas le son
      // avant la fin du fondu qu'on vient d'étendre au-delà de cette échéance d'origine.
      try {
        curSource.stop(endTime);
      } catch {
        /* noop */
      }
    }

    // Cette fonction est ré-invoquée à chaque changement de vitesse (voir setPlaybackRate) —
    // potentiellement des dizaines de fois par seconde pendant qu'on glisse le pitch fader.
    // Sans `cancelScheduledValues`, chaque appel EMPILE un nouveau couple
    // setValueAtTime/linearRampToValueAtTime sur la timeline d'automation de `curGain` par
    // dessus les précédents (jamais nettoyés) : plusieurs rampes concurrentes vers des
    // échéances légèrement différentes se chevauchent alors, et le volume réellement rendu
    // devient imprévisible (creux audibles qui reviennent aussitôt) au lieu de suivre la
    // dernière rampe demandée. On repart donc toujours d'une timeline propre, ancrée sur la
    // valeur réelle au temps présent.
    curGain.gain.cancelScheduledValues(now);
    curGain.gain.setValueAtTime(curGain.gain.value, now);
    curGain.gain.setValueAtTime(curGain.gain.value, crossfadeStart);
    curGain.gain.linearRampToValueAtTime(0, endTime);

    const { buffer: nextBuffer, trim: nextTrim } = this.pendingNext;

    // `start(t)` planifié loin à l'avance reste sample-accurate sur l'horloge audio, mais
    // WebKit peut avoir plusieurs ms de jitter entre l'instant demandé et l'instant où le
    // noeud commence RÉELLEMENT à émettre des échantillons (constaté empiriquement : élargir
    // SWAP_FADE_SECONDS réduisait le trou sans l'éliminer). On démarre donc `nextSource` en
    // avance sur `crossfadeStart` — à gain nul, donc inaudible — pour que ce démarrage ait le
    // temps de "se stabiliser" avant que la rampe de volume ne débute ; la position lue dans
    // le buffer est décalée d'autant pour que la piste soit toujours exactement à `trim.start`
    // au moment où `crossfadeStart` (donc la rampe) arrive réellement.
    // `prerollMargin` est un délai réel (temps-contexte) ; la quantité de piste qu'il
    // consomme avant `crossfadeStart` est `prerollMargin * rate` (voir `naturalEndTime`
    // ci-dessus) — la borne sur `nextTrim.start` doit donc elle aussi passer en temps réel.
    const prerollMargin = Math.max(0, Math.min(PRESTART_MARGIN_SECONDS, nextTrim.start / rate, crossfadeStart - now));
    const physicalStart = crossfadeStart - prerollMargin;

    const nextGain = this.context.createGain();
    nextGain.gain.setValueAtTime(0, physicalStart);
    nextGain.gain.setValueAtTime(0, crossfadeStart);
    nextGain.gain.linearRampToValueAtTime(1, endTime);
    nextGain.connect(this.masterGain);

    const nextSource = this.context.createBufferSource();
    nextSource.buffer = nextBuffer;
    nextSource.playbackRate.setValueAtTime(rate, physicalStart);
    nextSource.connect(nextGain);
    nextSource.start(physicalStart, nextTrim.start - prerollMargin * rate);
    try {
      nextSource.stop(endTime + logicalDuration(nextBuffer, nextTrim) / rate);
    } catch {
      /* noop */
    }
    nextSource.onended = () => this.handleBufferSourceEnded(nextSource);

    curSource.onended = () => this.commitPendingSwap(nextSource, nextGain, endTime);

    this.pendingNext.scheduled = true;
    this.pendingNext.scheduledSource = nextSource;
    this.pendingNext.scheduledGain = nextGain;
  }

  private commitPendingSwap(source: AudioBufferSourceNode, gain: GainNode, startTime: number) {
    if (!this.pendingNext) return;
    const { buffer, trim, onSwap } = this.pendingNext;
    this.pendingNext = null;
    this.trackState = {
      mode: "buffer",
      buffer,
      trim,
      isPaused: false,
      pauseOffset: 0,
      playback: { source, gain, scheduledStartContextTime: startTime, startOffsetInTrim: 0 },
    };
    this.setState("playing");
    onSwap();
    this.trySchedulePending(); // au cas où une piste suivante-suivante attendait déjà
  }

  private handleBufferSourceEnded(source: AudioBufferSourceNode) {
    if (this.trackState?.mode !== "buffer" || this.trackState.playback?.source !== source) return;
    this.setState("ended");
    console.warn("[audio] Aucune piste suivante prête à la fin de la piste — repli, coupure possible");
    this.onEndedCallback?.();
  }

  private handleNativeEnded() {
    if (this.trackState?.mode !== "native") return;
    this.setState("ended");
    console.warn("[audio] Fin du flux natif sans piste suivante prête — repli sur rechargement réseau");
    this.onEndedCallback?.();
  }

  /** Annule le swap déjà planifié tout en conservant la piste en attente (buffer/trim/
   *  callback), pour pouvoir la replanifier après un pause()/seek(). */
  private unschedulePending() {
    if (!this.pendingNext) return;
    if (this.pendingNext.scheduledSource) {
      const src = this.pendingNext.scheduledSource;
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* noop */
      }
      try {
        src.disconnect();
      } catch {
        /* noop */
      }
    }
    try {
      this.pendingNext.scheduledGain?.disconnect();
    } catch {
      /* noop */
    }
    this.pendingNext.scheduled = false;
    this.pendingNext.scheduledSource = undefined;
    this.pendingNext.scheduledGain = undefined;

    if (this.trackState?.mode === "buffer" && this.trackState.playback) {
      const src = this.trackState.playback.source;
      src.onended = () => this.handleBufferSourceEnded(src);
    }
  }

  private discardPending() {
    this.unschedulePending();
    this.pendingNext = null;
  }

  private teardownCurrent() {
    this.nativeAudio.pause();
    this.nativeGain.gain.cancelScheduledValues(this.context.currentTime);
    this.nativeGain.gain.setValueAtTime(1, this.context.currentTime);
    this.stopCurrentBufferPlayback();
  }
}

let engine: GaplessEngine | null = null;
export function getGaplessEngine(): GaplessEngine {
  if (!engine) engine = new GaplessEngine();
  return engine;
}
