import 'dart:async';

import 'package:resonia/player/engine.dart';

/// Moteur simulé : retient ce que le contrôleur lui demande (piste courante, suite, position,
/// vitesse) et renvoie les évènements attendus. Pas de son, pas de temps qui passe.
class FakeEngine implements AudioEngine {
  final _events = StreamController<EngineEvent>.broadcast();
  final starts =
      <List<String>>[]; // ids de chaque start() : [courante, suivantes…]
  final startPlay = <bool>[];
  EngineTrack? current;
  List<EngineTrack> next = const [];
  bool playing = false;
  Duration position = Duration.zero;
  double speed = 1;
  bool coupled = true;
  final seeks = <Duration>[];

  List<String> get nextIds => [for (final t in next) t.id];

  @override
  Stream<EngineEvent> get events => _events.stream;

  @override
  Future<bool> start(
    List<EngineTrack> tracks, {
    Duration position = Duration.zero,
    bool play = true,
  }) async {
    starts.add([for (final t in tracks) t.id]);
    startPlay.add(play);
    current = tracks.first;
    next = tracks.sublist(1);
    playing = play;
    this.position = position;
    scheduleMicrotask(
      () => _events.add(Started(tracks.first.id, const Duration(seconds: 180))),
    );
    return true;
  }

  /// Le moteur enchaîne tout seul sur la piste suivante (gapless).
  void advance() {
    current = next.first;
    next = next.sublist(1);
    _events.add(Started(current!.id, const Duration(seconds: 180)));
  }

  void emit(EngineEvent e) => _events.add(e);

  @override
  Future<void> setNext(List<EngineTrack> n) async => next = n;

  @override
  Future<void> play() async => playing = true;

  @override
  Future<Duration> pause() async {
    playing = false;
    return position;
  }

  @override
  Future<void> seek(Duration p) async {
    seeks.add(p);
    position = p;
  }

  @override
  Future<void> stop() async {
    current = null;
    next = const [];
    playing = false;
  }

  @override
  Future<void> setRate(double s, {required bool coupled}) async {
    speed = s;
    this.coupled = coupled;
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
  Future<void> dispose() async {}
}
