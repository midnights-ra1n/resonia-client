import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:just_audio/just_audio.dart';
import 'package:just_audio_background/just_audio_background.dart';

/// Piste confiée au moteur : toujours un fichier de cache COMPLET (le téléchargement est fait en
/// amont par `downloader.dart`), jamais un flux réseau.
class EngineTrack {
  const EngineTrack({
    required this.id,
    required this.path,
    this.title = '',
    this.artist,
    this.album,
    this.duration,
    this.art,
  });

  final String id;
  final String path;
  final String title;
  final String? artist;
  final String? album;
  final Duration? duration;
  final String? art;
}

sealed class EngineEvent {
  const EngineEvent();
}

/// Une piste vient de commencer à sonner (démarrage demandé ou enchaînement gapless).
class Started extends EngineEvent {
  const Started(this.id, this.duration);
  final String id;
  final Duration duration;
}

/// Plus rien à jouer : la file envoyée est épuisée.
class Ended extends EngineEvent {
  const Ended();
}

/// Lecture / pause décidée par le système (appel, casque débranché, reprise automatique).
class PlayingChanged extends EngineEvent {
  const PlayingChanged(this.playing, this.position);
  final bool playing;
  final Duration position;
}

/// Bouton de l'écran verrouillé : `play`, `pause`, `toggle`, `next`, `previous`, `seek`.
class Remote extends EngineEvent {
  const Remote(this.command, [this.position]);
  final String command;
  final Duration? position;
}

/// Fichier illisible.
class Failed extends EngineEvent {
  const Failed(this.id);
  final String id;
}

/// Ce que sait faire un moteur : lire des fichiers locaux à la suite, sans coupure, à vitesse
/// variable. La file, le mélange, la boucle et le réseau sont gérés par `PlayerController`.
abstract class AudioEngine {
  Stream<EngineEvent> get events;

  /// Remplace tout : [tracks] `[0]` est la piste courante, le reste la suite déjà prête.
  /// `false` : la piste courante n'a pas pu être ouverte.
  Future<bool> start(
    List<EngineTrack> tracks, {
    Duration position = Duration.zero,
    bool play = true,
  });

  /// Pistes à venir après la courante (déjà en cache), dans l'ordre de lecture.
  Future<void> setNext(List<EngineTrack> next);

  Future<void> play();

  /// Renvoie la position à laquelle la lecture s'est arrêtée.
  Future<Duration> pause();
  Future<void> seek(Duration position);
  Future<void> stop();

  /// [coupled] : la hauteur suit la vitesse (platine) ; sinon elle est conservée (Master Tempo).
  Future<void> setRate(double speed, {required bool coupled});

  /// Écran verrouillé (iOS) : titre, pochette, puis position / état.
  Future<void> setNowPlaying(EngineTrack? track);
  Future<void> setNowPlayingState(
    Duration position, {
    required bool playing,
    required double speed,
  });

  Future<void> dispose();

  /// Moteur de la plateforme : AVAudioEngine natif sur iOS, ExoPlayer ailleurs.
  static AudioEngine create() =>
      Platform.isIOS ? NativeEngine() : JustAudioEngine();
}

/// iOS : ios/Runner/GaplessEngine.swift (AVAudioEngine) via le canal `resonia/engine`.
class NativeEngine implements AudioEngine {
  NativeEngine() {
    _channel.setMethodCallHandler((call) async {
      final a = (call.arguments as Map?)?.cast<String, Object?>() ?? const {};
      Duration secs(Object? s) =>
          Duration(microseconds: (((s as num?) ?? 0) * 1e6).round());
      switch (call.method) {
        case 'started':
          _events.add(Started(a['id'] as String, secs(a['duration'])));
        case 'ended':
          _events.add(const Ended());
        case 'playing':
          _events.add(
            PlayingChanged(a['playing'] == true, secs(a['position'])),
          );
        case 'remote':
          _events.add(
            Remote(
              a['cmd'] as String,
              a['position'] == null ? null : secs(a['position']),
            ),
          );
        case 'error':
          _events.add(Failed(a['id'] as String));
      }
    });
  }

  static const _channel = MethodChannel('resonia/engine');
  final _events = StreamController<EngineEvent>.broadcast();

  @override
  Stream<EngineEvent> get events => _events.stream;

  static List<Map<String, String>> _tracks(List<EngineTrack> l) => [
    for (final t in l) {'id': t.id, 'path': t.path},
  ];

  @override
  Future<bool> start(
    List<EngineTrack> tracks, {
    Duration position = Duration.zero,
    bool play = true,
  }) async =>
      await _channel.invokeMethod<bool>('start', {
        'tracks': _tracks(tracks),
        'position': position.inMicroseconds / 1e6,
        'play': play,
      }) ??
      false;

  @override
  Future<void> setNext(List<EngineTrack> next) =>
      _channel.invokeMethod('setNext', {'tracks': _tracks(next)});

  @override
  Future<void> play() => _channel.invokeMethod('play');

  @override
  Future<Duration> pause() async {
    final s = await _channel.invokeMethod<double>('pause') ?? 0;
    return Duration(microseconds: (s * 1e6).round());
  }

  @override
  Future<void> seek(Duration position) => _channel.invokeMethod('seek', {
    'position': position.inMicroseconds / 1e6,
  });

  @override
  Future<void> stop() => _channel.invokeMethod('stop');

  @override
  Future<void> setRate(double speed, {required bool coupled}) =>
      _channel.invokeMethod('setRate', {'speed': speed, 'coupled': coupled});

  @override
  Future<void> setNowPlaying(EngineTrack? t) => _channel.invokeMethod(
    'nowPlaying',
    t == null
        ? null
        : {
            'title': t.title,
            'artist': t.artist,
            'album': t.album,
            'duration': (t.duration?.inMilliseconds ?? 0) / 1000,
            'art': t.art,
          },
  );

  @override
  Future<void> setNowPlayingState(
    Duration position, {
    required bool playing,
    required double speed,
  }) => _channel.invokeMethod('nowPlayingState', {
    'position': position.inMicroseconds / 1e6,
    'playing': playing,
    'speed': speed,
  });

  @override
  Future<void> dispose() async {
    _channel.setMethodCallHandler(null);
    await _events.close();
  }
}

/// Android : ExoPlayer via just_audio. Même contrat que le moteur iOS : une liste « courante +
/// suivantes prêtes », fichiers complets seulement. Notification et écran verrouillé :
/// just_audio_background (métadonnées dans le MediaItem de chaque source).
/// shortcut: pas encore de moteur Android dédié ; à écrire (MediaCodec + AudioTrack) si ExoPlayer
/// laisse entendre une coupure au raccord.
class JustAudioEngine implements AudioEngine {
  JustAudioEngine({AudioPlayer? player})
    : _player =
          player ??
          AudioPlayer(
            audioLoadConfiguration: const AudioLoadConfiguration(
              androidLoadControl: AndroidLoadControl(
                bufferForPlaybackDuration: Duration(milliseconds: 250),
                bufferForPlaybackAfterRebufferDuration: Duration(seconds: 1),
              ),
            ),
          ) {
    _subs = [
      _player.currentIndexStream.listen(_onIndex),
      _player.playerStateStream.listen(_onState),
    ];
  }

  final AudioPlayer _player;
  late final List<StreamSubscription<Object?>> _subs;
  final _events = StreamController<EngineEvent>.broadcast();
  List<String> _ids = const [];
  int _lastIndex = -1;
  bool _lastPlaying = false;
  bool _starting = false;

  @override
  Stream<EngineEvent> get events => _events.stream;

  static AudioSource _source(EngineTrack t) => AudioSource.file(
    t.path,
    tag: MediaItem(
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: t.duration,
      artUri: t.art == null ? null : Uri.parse(t.art!),
    ),
  );

  void _onIndex(int? i) {
    if (i == null || _starting || i == _lastIndex || i >= _ids.length) return;
    final previous = _lastIndex;
    _lastIndex = i;
    if (previous >= 0) {
      _events.add(Started(_ids[i], _player.duration ?? Duration.zero));
    }
  }

  void _onState(PlayerState s) {
    if (s.processingState == ProcessingState.completed && !_starting) {
      _events.add(const Ended());
    }
    if (s.playing != _lastPlaying) {
      _lastPlaying = s.playing;
      if (!_starting) _events.add(PlayingChanged(s.playing, _player.position));
    }
  }

  @override
  Future<bool> start(
    List<EngineTrack> tracks, {
    Duration position = Duration.zero,
    bool play = true,
  }) async {
    _starting = true;
    try {
      _ids = [for (final t in tracks) t.id];
      _lastIndex = 0;
      await _player.setAudioSources(
        [for (final t in tracks) _source(t)],
        initialIndex: 0,
        initialPosition: position,
      );
      if (play) unawaited(_player.play());
      _lastPlaying = play;
    } on PlayerInterruptedException {
      return true; // remplacée par une autre demande
    } on PlayerException {
      _events.add(Failed(tracks.first.id));
      return false;
    } finally {
      _starting = false;
    }
    _events.add(Started(tracks.first.id, _player.duration ?? Duration.zero));
    return true;
  }

  @override
  Future<void> setNext(List<EngineTrack> next) async {
    final cur = _player.currentIndex;
    if (cur == null || cur >= _ids.length) return;
    final have = _ids.sublist(cur + 1);
    if (have.length == next.length &&
        [for (final t in next) t.id].toString() == have.toString()) {
      return;
    }
    _ids = [..._ids.sublist(0, cur + 1), for (final t in next) t.id];
    if (_player.audioSources.length > cur + 1) {
      await _player.removeAudioSourceRange(
        cur + 1,
        _player.audioSources.length,
      );
    }
    if (next.isNotEmpty) {
      await _player.addAudioSources([for (final t in next) _source(t)]);
    }
  }

  @override
  Future<void> play() async => unawaited(_player.play());

  @override
  Future<Duration> pause() async {
    await _player.pause();
    return _player.position;
  }

  @override
  Future<void> seek(Duration position) => _player.seek(position);

  @override
  Future<void> stop() async {
    _ids = const [];
    await _player.stop();
  }

  @override
  Future<void> setRate(double speed, {required bool coupled}) async {
    await _player.setSpeed(speed);
    await _player.setPitch(coupled ? speed : 1);
  }

  @override
  Future<void> setNowPlaying(EngineTrack? track) async {}

  @override
  Future<void> setNowPlayingState(
    Duration position, {
    required bool playing,
    required double speed,
  }) async {}

  @override
  Future<void> dispose() async {
    for (final s in _subs) {
      await s.cancel();
    }
    await _player.dispose();
    await _events.close();
  }
}
