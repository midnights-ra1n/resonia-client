import { detectEdgeSilence, logicalDuration, type SilenceTrim } from "./silenceTrim";
import type { EngineError, EngineState, EngineStateListener } from "./types";
import { debugLog } from "../debug/audioDebugLogger";

// Fondu très court, uniquement pour masquer le point de jonction entre deux sources
// (natif→buffer, ou deux AudioBufferSourceNode consécutifs) — pas pour compenser un
// écart de timing : la planification elle-même est sample-accurate.
const SWAP_FADE_SECONDS = 0.008;

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

  /** Sur WebKit/macOS, l'intégration Now Playing (MPNowPlayingInfoCenter/MPRemoteCommandCenter)
   *  ne reste active que tant qu'un vrai élément <audio>/<video> est dans l'état "playing" —
   *  `navigator.mediaSession.playbackState` fixé manuellement ne suffit pas. Or dès qu'une piste
   *  bascule en mode buffer (voir `attachDecodedActive`), `nativeAudio` est mis en pause : plus
   *  aucun élément média ne joue réellement, WebKit gèle alors le widget système sur "lecture" et
   *  ignore les commandes distantes. Cet élément silencieux, indépendant du graphe audio, reste
   *  actif exactement en même temps que la lecture logique pour maintenir cette session vivante. */
  private sessionAnchor: HTMLAudioElement;

  private trackState: TrackState | null = null;
  private pendingNext: PendingNext | null = null;
  private onEndedCallback: (() => void) | null = null;

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

    this.sessionAnchor = new Audio(SILENT_LOOP_DATA_URI);
    this.sessionAnchor.loop = true;
    this.sessionAnchor.muted = true;
    this.sessionAnchor.volume = 0;
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

    this.trackState = null;

    if (mode === "native" && nativeUrl) {
      this.nativeAudio.src = nativeUrl;
      this.nativeAudio.currentTime = position;
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
    this._state = state;
    this._error = error;
    if (state === "playing") this.startSessionAnchor();
    else if (state === "paused" || state === "idle") this.stopSessionAnchor();
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
    this.anchorQueue = this.anchorQueue.then(async () => {
      if (this.anchorDesiredPlaying !== playing) return; // supplanté entre-temps
      if (playing) {
        try {
          await this.sessionAnchor.play();
        } catch {
          /* noop — un rejet ici n'affecte pas la lecture réelle, seule l'intégration système en pâtit */
        }
      } else {
        this.sessionAnchor.pause();
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
    const buffer = await this.decode(arrayBuffer);
    const trim = detectEdgeSilence(buffer);
    debugLog("decode:trim", { durationSec: buffer.duration, trimStartSec: trim.start, trimEndSec: trim.end });
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
  }

  get currentTime(): number {
    if (!this.trackState) return 0;
    if (this.trackState.mode === "native") {
      return this.trackState.isPaused ? this.trackState.pauseOffset : this.nativeAudio.currentTime;
    }
    if (this.trackState.isPaused || !this.trackState.playback) return this.trackState.pauseOffset;
    const { scheduledStartContextTime, startOffsetInTrim } = this.trackState.playback;
    return startOffsetInTrim + (this.context.currentTime - scheduledStartContextTime);
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

  private startBufferAt(buffer: AudioBuffer, trim: SilenceTrim, offset: number, startPaused = false) {
    this.stopCurrentBufferPlayback();

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
    source.connect(gain);
    debugLog("buffer:start", { offset, trimStartSec: trim.start, bufferPositionSec: trim.start + offset });
    source.start(now, trim.start + offset);

    const remaining = Math.max(logicalDuration(buffer, trim) - offset, 0);
    try {
      source.stop(now + remaining);
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
   *  audible absorbe cette imprécision des deux côtés. `endTime` reste la référence
   *  logique (position 0 de la piste suivante, bascule d'état) : seul le début physique de
   *  `nextSource` est avancé de SWAP_FADE_SECONDS pour ce chevauchement. */
  private trySchedulePending() {
    if (!this.pendingNext || this.pendingNext.scheduled) return;
    if (!this.trackState || this.trackState.mode !== "buffer" || this.trackState.isPaused || !this.trackState.playback) return;

    const { buffer: curBuffer, trim: curTrim, playback } = this.trackState;
    const { source: curSource, gain: curGain, scheduledStartContextTime, startOffsetInTrim } = playback;
    const endTime = scheduledStartContextTime - startOffsetInTrim + logicalDuration(curBuffer, curTrim);
    const crossfadeStart = endTime - SWAP_FADE_SECONDS;

    curGain.gain.setValueAtTime(1, crossfadeStart);
    curGain.gain.linearRampToValueAtTime(0, endTime);

    const { buffer: nextBuffer, trim: nextTrim } = this.pendingNext;

    const nextGain = this.context.createGain();
    nextGain.gain.setValueAtTime(0, crossfadeStart);
    nextGain.gain.linearRampToValueAtTime(1, endTime);
    nextGain.connect(this.masterGain);

    const nextSource = this.context.createBufferSource();
    nextSource.buffer = nextBuffer;
    nextSource.connect(nextGain);
    nextSource.start(crossfadeStart, nextTrim.start);
    try {
      nextSource.stop(endTime + logicalDuration(nextBuffer, nextTrim));
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
