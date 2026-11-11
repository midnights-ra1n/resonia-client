import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:audio_session/audio_session.dart';
import 'package:flutter/widgets.dart';
import 'package:just_audio_background/just_audio_background.dart';
import 'package:path_provider/path_provider.dart';

import '../api.dart';
import 'audio_cache.dart';
import 'downloader.dart';
import 'engine.dart';

/// Plages du pitch fader (±%), comme le bureau (stores/playerStore.ts).
const pitchRanges = [4, 8, 10, 16];
const _defaultPitchRange = 8;
const _upcoming = 3; // pistes préchargées après la courante

enum Repeat { off, one, all }

/// Contrôleur de lecture. Il possède la file, le mélange, la boucle, les téléchargements et le
/// cache ; le moteur ([AudioEngine]) ne fait que lire des fichiers complets à la suite, sans coupure.
///
/// Invariants (CLAUDE.md) :
/// - la transition entre deux pistes est faite par le moteur, jamais par l'UI : ici on ne fait que
///   lui donner à l'avance la suite déjà en cache ([_syncNext]) ;
/// - les 3 pistes suivantes sont préchargées, la piste en cours est toujours servie en premier : un
///   préchargement ne ralentit ni n'interrompt jamais ce qui sonne (voir [Downloads]) ;
/// - un titre n'est téléchargé qu'une fois : lu depuis le cache s'il y est, sinon téléchargé vers le
///   cache puis lu — jamais de second téléchargement du même fichier.
class PlayerController extends ChangeNotifier with WidgetsBindingObserver {
  PlayerController({
    AudioEngine? engine,
    Future<Directory> Function()? stateDir,
    Future<Directory> Function()? cacheDir,
  }) : _engineOrNull = engine,
       _stateDirFn = stateDir ?? _defaultStateDir,
       _cacheDirFn = cacheDir ?? getApplicationCacheDirectory {
    WidgetsBinding.instance.addObserver(this);
  }

  final AudioEngine? _engineOrNull;
  late final AudioEngine engine = _engineOrNull ?? AudioEngine.create();
  StreamSubscription<EngineEvent>? _events;
  final Future<Directory> Function() _stateDirFn;
  final Future<Directory> Function() _cacheDirFn;

  SubsonicApi? _api;
  AudioCache? _cache;
  late final _downloads = Downloads(
    onIdle: () => unawaited(_cache?.evict(keep: _keep)),
    onComplete: _syncNext,
  );
  Set<String> _keep = const {};
  Directory? _stateDir;

  List<Song> _queue = const [];
  List<int> _order = const []; // ordre de lecture : indices dans _queue
  int _pos = 0; // place de la piste courante dans _order
  bool _shuffle = false;
  Repeat _repeat = Repeat.off;

  bool _playing =
      false; // lecture demandée (même si le fichier n'est pas encore là)
  bool _buffering = false; // en attente du fichier / du moteur
  bool _awaiting = false; // un start() est en cours : on attend son Started
  String? _loadedId; // piste que le moteur tient comme courante
  List<String> _sentNext = const []; // suite déjà donnée au moteur
  int _gen = 0; // change à chaque demande de lecture : les attentes périmées s'arrêtent
  int _failures = 0;
  Duration _openAt = Duration.zero;
  Duration? _duration;

  double pitch = 0; // en %, vitesse effective = 1 + pitch / 100
  int pitchRange = _defaultPitchRange;
  bool masterTempo = false; // true : hauteur préservée
  double _speed = 1;

  /// Lecture en arrière-plan. iOS : session et écran verrouillé sont gérés par le moteur natif.
  /// Android : notification via just_audio_background.
  static Future<void> initBackground() async {
    if (!Platform.isAndroid) return;
    await JustAudioBackground.init(
      androidNotificationChannelId: 'com.resonia.resonia.playback',
      androidNotificationChannelName: 'Resonia',
      androidNotificationOngoing: true,
    );
    await (await AudioSession.instance).configure(
      const AudioSessionConfiguration.music(),
    );
  }

  static Future<Directory> _defaultStateDir() async =>
      Directory('${(await getApplicationSupportDirectory()).path}/player');

  List<Song> get queue => _queue;

  /// Ordre de lecture effectif (mélange compris) : indices dans [queue].
  List<int> get playOrder => List.unmodifiable(_order);
  Song? get current => _queue.isEmpty ? null : _queue[_order[_pos]];
  bool get playing => _playing;
  bool get shuffle => _shuffle;
  Repeat get repeat => _repeat;

  /// Le son tarde : la barre de lecture passe en chargement infini.
  bool get loading => _playing && _buffering;
  bool get hasNext => _pos < _order.length - 1 || _repeat != Repeat.off;

  Duration get duration =>
      _duration ?? Duration(seconds: current?.duration ?? 0);

  // Position : instantané à l'évènement du moteur, puis horloge locale × vitesse. Aucun aller-retour
  // natif, donc aucun coût pour l'interface qui la lit 4 fois par seconde.
  Duration _posBase = Duration.zero;
  final _posClock = Stopwatch();

  Duration get position {
    if (!_posClock.isRunning) return _posBase;
    final p = _posBase + _posClock.elapsed * _speed;
    final d = duration;
    return d > Duration.zero && p > d ? d : p;
  }

  void _setPosition(Duration p, {required bool running}) {
    _posBase = p;
    _posClock
      ..reset()
      ..stop();
    if (running) _posClock.start();
  }

  void _rebase() => _setPosition(position, running: _posClock.isRunning);

  // ───────────────────────── Session ─────────────────────────

  /// Ouvre le cache du serveur et restaure la file sauvegardée (même serveur uniquement).
  Future<void> attach(SubsonicApi api) async {
    _api = api;
    _events ??= engine.events.listen(_onEvent);
    _cache = await AudioCache.open(api.session, await _cacheDirFn());
    _stateDir = await _stateDirFn();
    await _stateDir!.create(recursive: true);
    unawaited(_cache!.evict());
    _loadSettings();
    _speed = 1 + pitch / 100;
    unawaited(_pushRate());
    await _restore();
  }

  /// Déconnexion : arrêt et oubli de la file (le cache audio, lui, reste sur le disque).
  Future<void> detach() async {
    _gen++;
    _downloads.stopAll();
    _tick?.cancel();
    try {
      await engine.stop();
      await engine.setNowPlaying(null);
    } catch (_) {}
    _queue = const [];
    _order = const [];
    _pos = 0;
    _playing = _buffering = _awaiting = false;
    _loadedId = null;
    _sentNext = const [];
    _setPosition(Duration.zero, running: false);
    for (final f in ['queue.json', 'position.json']) {
      _delete(File('${_stateDir?.path}/$f'));
    }
    _api = null;
    notifyListeners();
  }

  // ───────────────────────── Commandes ─────────────────────────

  /// Sans [start] (bouton Lecture d'un album), le mode aléatoire part d'une piste au hasard.
  Future<void> playQueue(List<Song> songs, {int? start}) async {
    if (songs.isEmpty || _api == null) return;
    start ??= _shuffle ? Random().nextInt(songs.length) : 0;
    _queue = List.unmodifiable(songs);
    _order = _makeOrder(start);
    _pos = _shuffle ? 0 : start;
    _scrobbleId = null; // même titre relancé : nouvelle écoute
    _saveQueue();
    await _open(_pos);
  }

  List<int> _makeOrder(int first) {
    final n = _queue.length;
    if (!_shuffle) return List.generate(n, (i) => i);
    final rest = [
      for (var i = 0; i < n; i++)
        if (i != first) i,
    ]..shuffle();
    return [first, ...rest];
  }

  Future<void> togglePlay() async {
    if (current == null) return;
    if (_playing) return pause();
    return resume();
  }

  Future<void> pause() async {
    if (!_playing) return;
    _playing = false;
    _startWatch = null; // mise en pause avant le son : plus rien à mesurer
    _setPosition(position, running: false);
    notifyListeners();
    final p = await engine.pause();
    if (!_playing && !_awaiting && _loadedId != null) {
      _setPosition(p, running: false);
      notifyListeners();
    }
    _savePosition(force: true);
    _publishState();
  }

  Future<void> resume() async {
    if (_playing || current == null) return;
    _markStart();
    if (_loadedId != current!.id || _awaiting) {
      // Rien de chargé (file restaurée, fin de liste) : on ouvre la piste à la position gardée.
      final at = _posBase >= duration && duration > Duration.zero
          ? Duration.zero
          : _posBase;
      return _open(_pos, at: at);
    }
    _playing = true;
    _setPosition(_posBase, running: !_buffering);
    notifyListeners();
    await engine.play();
    _markLoaded();
    _publishState();
  }

  Future<void> next() async {
    final n = _following(1, loopOne: false);
    if (n.isEmpty) return seek(Duration.zero);
    await _open(n.first);
  }

  /// Comme partout : après 3 s, « précédent » revient au début de la piste ; sinon piste d'avant
  /// (toujours disponible : sur la première, il recommence la piste).
  Future<void> previous() async {
    final n = _order.length;
    final canGo = _pos > 0 || (_repeat == Repeat.all && n > 1);
    if (position > const Duration(seconds: 3) || !canGo) {
      return seek(Duration.zero);
    }
    await _open(_pos > 0 ? _pos - 1 : n - 1);
  }

  Future<void> seek(Duration p) async {
    if (current == null) return;
    final d = duration;
    p = p < Duration.zero
        ? Duration.zero
        : (d > Duration.zero && p > d ? d : p);
    _setPosition(p, running: _playing && !_buffering);
    _openAt = p;
    notifyListeners();
    if (_loadedId == current!.id && !_awaiting) await engine.seek(p);
    _savePosition(force: true);
    _publishState();
  }

  Future<void> toggleShuffle() async {
    if (_queue.isEmpty) {
      _shuffle = !_shuffle;
      return notifyListeners();
    }
    final cur = _order[_pos];
    _shuffle = !_shuffle;
    _order = _shuffle
        ? _makeOrder(cur)
        : List.generate(_queue.length, (i) => i);
    _pos = _shuffle ? 0 : cur;
    _saveQueue();
    _prefetch();
    _syncNext();
    notifyListeners();
  }

  Future<void> cycleRepeat() async {
    _repeat = switch (_repeat) {
      Repeat.off => Repeat.all,
      Repeat.all => Repeat.one,
      Repeat.one => Repeat.off,
    };
    _saveQueue();
    _prefetch();
    _syncNext();
    notifyListeners();
  }

  // ───────────────────────── Pitch ─────────────────────────

  /// Pitch fader façon platine DJ : vitesse et hauteur couplées, sauf en Master Tempo. Le moteur
  /// règle la vitesse en direct sur des unités audio : rien n'est jeté ni rechargé, donc aucune
  /// coupure pendant qu'on glisse.
  void setPitch(double percent) {
    final p = ((percent.clamp(-pitchRange, pitchRange) * 10).round() / 10)
        .toDouble();
    // Un glissé envoie un évènement par pixel : rien à refaire si la valeur ne change pas.
    if (p == pitch) return;
    pitch = p;
    notifyListeners();
    unawaited(_pushRate());
    _saveSettingsSoon();
  }

  void resetPitch() => setPitch(0);

  void setPitchRange(int range) {
    pitchRange = range;
    notifyListeners();
    setPitch(pitch); // borne la valeur courante dans la nouvelle plage
    _saveSettingsSoon();
  }

  void toggleMasterTempo() {
    masterTempo = !masterTempo;
    notifyListeners();
    unawaited(_pushRate());
    _saveSettingsSoon();
  }

  Future<void> _pushRate() async {
    _rebase(); // la position écoulée jusqu'ici l'a été à l'ancienne vitesse
    _speed = 1 + pitch / 100;
    try {
      await engine.setRate(_speed, coupled: !masterTempo);
    } catch (_) {
      // Plateforme sans réglage de vitesse : la lecture reste normale.
    }
    _publishState();
  }

  // ───────────────────────── File : ordre, suite, préchargement ─────────────────────────

  /// Places (dans [_order]) des [count] pistes qui suivent la courante : mélange et boucle compris.
  /// En répétition d'un titre, la suite du moteur est la piste elle-même ([loopOne]) ; pour le
  /// préchargement, c'est la vraie suivante.
  List<int> _following(int count, {bool loopOne = true}) {
    final n = _order.length;
    if (n == 0) return const [];
    if (loopOne && _repeat == Repeat.one) return [_pos];
    if (n == 1) return _repeat == Repeat.all ? [_pos] : const [];
    return [
      for (var k = 1; k <= count && k < n; k++)
        if (_pos + k < n)
          _pos + k
        else if (_repeat == Repeat.all)
          (_pos + k) % n,
    ];
  }

  Song _songAt(int pos) => _queue[_order[pos]];

  EngineTrack _track(Song s) => EngineTrack(
    id: s.id,
    path: _cache!.fileFor(s).path,
    title: s.title,
    artist: s.artist,
    album: s.album,
    duration: s.duration == null ? null : Duration(seconds: s.duration!),
    art: s.coverArt == null ? null : _api!.coverUrl(s.coverArt!, 600),
  );

  TrackDownload _download(Song s) {
    final f = AudioCache.formatFor(s);
    return _downloads.of(
      _api!.streamUri(s.id, format: f.format, maxBitRate: f.maxBitRate),
      _cache!.fileFor(s),
    );
  }

  /// Suite déjà en cache, dans l'ordre : s'arrête au premier titre manquant (le moteur ne peut pas
  /// sauter un trou).
  List<EngineTrack> _ready() {
    final cache = _cache;
    if (cache == null) return const [];
    final out = <EngineTrack>[];
    for (final p in _following(_upcoming)) {
      final s = _songAt(p);
      if (!cache.isCached(s)) break;
      out.add(_track(s));
    }
    return out;
  }

  /// Donne au moteur la suite prête ; rappelé quand l'ordre change ou qu'un titre finit de
  /// télécharger. Aucun effet si rien n'a changé.
  void _syncNext() {
    if (_loadedId == null || _awaiting) return;
    final ready = _ready();
    final ids = [for (final t in ready) t.id];
    if (ids.join('\u0000') == _sentNext.join('\u0000')) return;
    _sentNext = ids;
    unawaited(engine.setNext(ready).catchError((_) {}));
  }

  /// Télécharge la piste en cours puis les [_upcoming] suivantes (ordre effectif : mélange et
  /// boucle compris), une à la fois et dans cet ordre : la piste en cours a toute la bande
  /// passante, puis la suivante est prête bien avant la transition.
  void _prefetch() {
    final cur = current;
    if (cur == null || _cache == null) return;
    final order = [
      _download(cur),
      if (_playing)
        for (final p in _following(_upcoming, loopOne: false))
          _download(_songAt(p)),
    ];
    _keep = {for (final d in order) d.file.path};
    _downloads.retain({..._keep});
    _downloads.prioritize(order);
  }

  // ───────────────────────── Ouverture d'une piste ─────────────────────────

  /// Joue la piste de la place [pos]. L'interface montre la nouvelle piste tout de suite ; le son
  /// part dès que le fichier est complet (instantané s'il est en cache, y compris pour les pistes
  /// préchargées de la file). Un « suivant » répété remplace la demande en cours : seule la dernière
  /// compte, et seul son fichier se télécharge.
  Future<void> _open(
    int pos, {
    Duration at = Duration.zero,
    bool play = true,
  }) async {
    final cache = _cache;
    if (cache == null || pos < 0 || pos >= _order.length) return;
    final gen = ++_gen;
    _pos = pos;
    final song = _songAt(pos);
    _markStart();
    _playing = play;
    _awaiting = true;
    _buffering = true;
    _openAt = at;
    _duration = null;
    _setPosition(at, running: false);
    notifyListeners();
    unawaited(engine.setNowPlaying(_track(song)).catchError((_) {}));
    _prefetch();
    // Rend la main tout de suite : l'interface est à jour, le son suit dès que le fichier est là.
    unawaited(_load(gen, pos, song, at));
  }

  Future<void> _load(int gen, int pos, Song song, Duration at) async {
    final d = _download(song);
    if (!d.complete) {
      // Le téléchargement a déjà démarré (_prefetch) ; en attendant, la piste d'avant se tait.
      if (_loadedId != null) unawaited(engine.pause().catchError((_) => at));
      if (!await d.waitComplete(() => gen != _gen)) return;
    }
    if (gen != _gen) return;

    final ready = _ready();
    _sentNext = [for (final t in ready) t.id];
    bool ok;
    try {
      // `_playing` relu ici : une pause pendant l'attente du fichier est respectée.
      ok = await engine.start(
        [_track(song), ...ready],
        position: at,
        play: _playing,
      );
    } catch (_) {
      ok = false;
    }
    if (gen != _gen) return;
    if (!ok) return _fail(pos, at);
  }

  /// Fichier illisible : on le jette et on le retélécharge une fois (copie corrompue) ; au second
  /// échec, la piste est sautée.
  void _fail(int pos, Duration at) {
    if (pos != _pos) return;
    _awaiting = false;
    _loadedId = null;
    if (_failures++ == 0) {
      final song = _songAt(pos);
      _download(song).forget();
      _delete(_cache!.fileFor(song));
      unawaited(_open(pos, at: at, play: _playing));
      return;
    }
    _failures = 0;
    final n = _following(1, loopOne: false);
    if (n.isNotEmpty && _playing) {
      unawaited(_open(n.first));
    } else {
      _buffering = false;
      _playing = false;
      notifyListeners();
    }
  }

  // ───────────────────────── Évènements du moteur ─────────────────────────

  void _onEvent(EngineEvent e) {
    switch (e) {
      case Started(:final id, :final duration):
        _onStarted(id, duration);
      case Ended():
        _onEnded();
      case PlayingChanged(:final playing, :final position):
        if (_awaiting || playing == _playing) return;
        _playing = playing;
        _setPosition(position, running: playing && !_buffering);
        if (playing) _markStart();
        _savePosition(force: true);
        _publishState();
        notifyListeners();
      case Remote(:final command, :final position):
        switch (command) {
          case 'play':
            unawaited(resume());
          case 'pause':
            unawaited(pause());
          case 'toggle':
            unawaited(togglePlay());
          case 'next':
            unawaited(next());
          case 'previous':
            unawaited(previous());
          case 'seek':
            if (position != null) unawaited(seek(position));
        }
      case Failed(:final id):
        if (id == current?.id) _fail(_pos, _openAt);
    }
  }

  void _onStarted(String id, Duration dur) {
    final cur = current;
    if (cur == null) return;
    _duration = dur > Duration.zero ? dur : null;
    if (_awaiting && id == cur.id) {
      // La piste demandée sonne.
      _awaiting = false;
      _buffering = false;
      _loadedId = id;
      _failures = 0;
      _setPosition(_openAt, running: _playing);
      _markLoaded();
    } else {
      // Enchaînement fait par le moteur (gapless) : on suit.
      final next = _following(_upcoming).where((p) => _songAt(p).id == id);
      if (next.isEmpty) return;
      _pos = next.first;
      _loadedId = id;
      _awaiting = false;
      _buffering = false;
      _setPosition(Duration.zero, running: _playing);
      _resetScrobble();
      // Le moteur a consommé la tête de la suite : on lui redonne la nouvelle.
      _sentNext = _sentNext.isEmpty ? const [] : _sentNext.sublist(1);
    }
    final song = current!;
    _cache?.touch(song);
    _savePosition(force: true);
    _saveQueue();
    _prefetch();
    _syncNext();
    unawaited(engine.setNowPlaying(_track(song)).catchError((_) {}));
    _publishState();
    notifyListeners();
  }

  /// Le moteur n'a plus rien à jouer : soit la suite n'était pas encore en cache (on attend son
  /// téléchargement), soit c'est la fin de la file.
  void _onEnded() {
    if (_awaiting) return;
    final n = _following(1);
    if (n.isNotEmpty && _playing) {
      unawaited(_open(n.first));
      return;
    }
    _playing = false;
    _loadedId = null;
    _sentNext = const [];
    _setPosition(Duration.zero, running: false);
    _publishState();
    notifyListeners();
  }

  void _publishState() => unawaited(
    engine
        .setNowPlayingState(
          position,
          playing: _playing && !_buffering,
          speed: _speed,
        )
        .catchError((_) {}),
  );

  // ───────────────────────── Cache ─────────────────────────

  /// Vide le cache audio (garde la piste en cours et les suivantes préchargées). Octets libérés.
  Future<int> clearCache() async {
    final cache = _cache;
    if (cache == null) return 0;
    final c = current;
    final keep = {..._keep, if (c != null) cache.fileFor(c).path};
    _downloads.forgetExcept(keep);
    return cache.clear(keep: keep);
  }

  // ───────────────────────── Démarrage & reprise ─────────────────────────

  /// Temps entre le geste (titre touché, Lecture) et le son : mesuré en direct pendant le
  /// chargement, figé au démarrage. `null` : aucune mesure.
  Stopwatch? _startWatch;
  Duration? startLatency;
  bool get measuringStart => _startWatch != null;
  Duration? get startElapsed => _startWatch?.elapsed ?? startLatency;

  void _markStart() {
    _startWatch = Stopwatch()..start();
    startLatency = null;
  }

  void _markLoaded() {
    final watch = _startWatch;
    if (watch == null) return;
    _startWatch = null;
    if (_playing) startLatency = watch.elapsed;
  }

  // ───────────────────────── Navidrome ─────────────────────────

  // Mêmes règles que le bureau (stores/playerStore.ts) : « Now Playing » après 1 s de lecture,
  // écoute comptée à la moitié du titre (4 min au plus), titres de 30 s minimum.
  String? _scrobbleId; // titre auquel s'appliquent les deux drapeaux
  bool _nowPlayingSent = false;
  bool _submitted = false;

  void _resetScrobble() => _nowPlayingSent = _submitted = false;

  static Duration _submitAt(Duration d) => d < const Duration(seconds: 30)
      ? Duration.zero
      : d ~/ 2 < const Duration(minutes: 4)
      ? d ~/ 2
      : const Duration(minutes: 4);

  void _scrobble() {
    final song = current;
    final api = _api;
    if (song == null || api == null || !_playing || _buffering) return;
    if (song.id != _scrobbleId) {
      _scrobbleId = song.id;
      _resetScrobble();
    }
    final pos = position;
    if (!_nowPlayingSent && pos > const Duration(seconds: 1)) {
      _nowPlayingSent = true;
      unawaited(api.scrobble(song.id, submission: false).catchError((_) {}));
    }
    final at = _submitAt(duration);
    if (!_submitted && at > Duration.zero && pos >= at) {
      _submitted = true;
      unawaited(api.scrobble(song.id, submission: true).catchError((_) {}));
    }
  }

  // ───────────────────────── Persistance ─────────────────────────

  // Fermeture forcée = pas de dernier rappel : la position est écrite chaque seconde en lecture.
  // Une seule minuterie, et seulement pendant que le son joue (batterie).
  Timer? _tick;
  String? _lastPosition;

  @override
  void notifyListeners() {
    final run = _playing && !_buffering;
    if (run != (_tick != null)) {
      _tick?.cancel();
      _tick = run
          ? Timer.periodic(const Duration(seconds: 1), (_) {
              _savePosition();
              _scrobble();
            })
          : null;
    }
    super.notifyListeners();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) _savePosition(force: true);
  }

  File? _file(String name) =>
      _stateDir == null ? null : File('${_stateDir!.path}/$name');

  /// Écriture atomique (fichier temporaire + renommage) : un kill en pleine écriture ne
  /// laisse jamais un fichier tronqué.
  static void _write(File? f, Object json) {
    if (f == null) return;
    try {
      final tmp = File('${f.path}.tmp')..writeAsStringSync(jsonEncode(json));
      tmp.renameSync(f.path);
    } catch (_) {}
  }

  static Map<String, dynamic>? _read(File? f) {
    try {
      return f != null && f.existsSync()
          ? jsonDecode(f.readAsStringSync()) as Map<String, dynamic>
          : null;
    } catch (_) {
      return null;
    }
  }

  static void _delete(File f) {
    try {
      f.deleteSync();
    } catch (_) {}
  }

  String get _serverKey => _cache!.dir.path.split('/').last;

  void _saveQueue() {
    if (_queue.isEmpty || _cache == null) return;
    _write(_file('queue.json'), {
      'server': _serverKey,
      'songs': [for (final s in _queue) s.toJson()],
      'shuffle': _shuffle,
      'shuffleOrder': _order,
      'loop': _repeat.index,
    });
    _savePosition(force: true);
  }

  void _savePosition({bool force = false}) {
    if (_queue.isEmpty) return;
    final json = jsonEncode({
      'index': _order[_pos],
      'ms': position.inMilliseconds,
    });
    if (!force && json == _lastPosition) return;
    _lastPosition = json;
    _write(_file('position.json'), jsonDecode(json) as Object);
  }

  Future<void> _restore() async {
    final q = _read(_file('queue.json'));
    if (q == null || q['server'] != _serverKey) return;
    final songs = [
      for (final s in (q['songs'] as List? ?? const []))
        Song.fromJson(s as Map<String, dynamic>),
    ];
    if (songs.isEmpty) return;
    final p = _read(_file('position.json'));
    final index = ((p?['index'] as num?)?.toInt() ?? 0).clamp(
      0,
      songs.length - 1,
    );
    final order = [
      for (final i in (q['shuffleOrder'] as List? ?? const []))
        (i as num).toInt(),
    ];
    final validOrder =
        order.length == songs.length && order.toSet().length == songs.length;

    _queue = List.unmodifiable(songs);
    _shuffle = q['shuffle'] == true;
    _repeat = Repeat.values[((q['loop'] as num?)?.toInt() ?? 0).clamp(0, 2)];
    _order = validOrder ? order : List.generate(songs.length, (i) => i);
    _pos = max(0, _order.indexOf(index));
    final ms = (p?['ms'] as num?)?.toInt() ?? 0;
    _openAt = Duration(milliseconds: ms);
    _setPosition(_openAt, running: false);
    final at = _submitAt(Duration(seconds: songs[index].duration ?? 0));
    _scrobbleId = songs[index].id;
    _nowPlayingSent = false;
    _submitted = at > Duration.zero && _openAt >= at;
    // La reprise ne télécharge que la piste affichée ; le son part au premier appui sur Lecture.
    _prefetch();
    notifyListeners();
  }

  Timer? _settingsTimer;

  void _saveSettingsSoon() {
    _settingsTimer?.cancel();
    _settingsTimer = Timer(const Duration(milliseconds: 500), () {
      _write(_file('settings.json'), {
        'pitch': pitch,
        'pitchRange': pitchRange,
        'masterTempo': masterTempo,
      });
    });
  }

  void _loadSettings() {
    final s = _read(_file('settings.json'));
    if (s == null) return;
    final range = (s['pitchRange'] as num?)?.toInt();
    pitchRange = pitchRanges.contains(range) ? range! : _defaultPitchRange;
    pitch = ((s['pitch'] as num?)?.toDouble() ?? 0)
        .clamp(-pitchRange, pitchRange)
        .toDouble();
    masterTempo = s['masterTempo'] == true;
  }

  @override
  void dispose() {
    _downloads.close();
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_events?.cancel());
    _tick?.cancel();
    _settingsTimer?.cancel();
    if (_events != null) unawaited(engine.dispose());
    super.dispose();
  }
}
