// LockCachingAudioSource est « expérimental » upstream ; just_audio est figé dans third_party/,
// il ne peut donc pas changer sous nos pieds.
// ignore_for_file: experimental_member_use

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:audio_session/audio_session.dart';
import 'package:flutter/widgets.dart';
import 'package:just_audio/just_audio.dart';
import 'package:just_audio_background/just_audio_background.dart';
import 'package:path_provider/path_provider.dart';

import '../api.dart';
import 'audio_cache.dart';

/// Plages du pitch fader (±%), comme le bureau (stores/playerStore.ts).
const pitchRanges = [4, 8, 10, 16];
const _defaultPitchRange = 8;
const _upcoming = 3; // pistes préchargées après la courante

/// Moteur de lecture : file d'attente, lecture gapless (playlist native just_audio), cache,
/// préchargement, pitch, et reprise exacte après une fermeture forcée.
///
/// Invariants (CLAUDE.md) : la transition entre pistes est faite par le lecteur natif
/// (AVQueuePlayer / ExoPlayer), jamais par l'UI ; le préchargement laisse la priorité à la
/// piste en cours, pour ne jamais la faire caler (voir [_prefetch]).
class PlayerController extends ChangeNotifier with WidgetsBindingObserver {
  PlayerController({
    AudioPlayer? player,
    Future<Directory> Function()? stateDir,
    Future<Directory> Function()? cacheDir,
  }) : player = player ?? AudioPlayer(),
       _stateDirFn = stateDir ?? _defaultStateDir,
       _cacheDirFn = cacheDir ?? getApplicationCacheDirectory {
    _subs = [
      this.player.currentIndexStream.listen((_) => _onIndexChanged()),
      this.player.playingStream.listen(_onPlaying),
      this.player.shuffleModeEnabledStream.listen((_) => notifyListeners()),
      this.player.loopModeStream.listen((_) => notifyListeners()),
      this.player.processingStateStream.listen((_) => notifyListeners()),
      // Répétition d'un titre : nouvelle écoute pour Navidrome.
      this.player.positionDiscontinuityStream.listen((d) {
        if (d.reason == PositionDiscontinuityReason.autoAdvance) {
          _resetScrobble();
        }
      }),
    ];
    WidgetsBinding.instance.addObserver(this);
  }

  final AudioPlayer player;
  final Future<Directory> Function() _stateDirFn;
  final Future<Directory> Function() _cacheDirFn;
  late final List<StreamSubscription<dynamic>> _subs;

  SubsonicApi? _api;
  AudioCache? _cache;
  Directory? _stateDir;
  List<Song> _queue = const [];
  List<AudioSource> _sources = const [];

  double pitch = 0; // en %, vitesse effective = 1 + pitch / 100
  int pitchRange = _defaultPitchRange;
  bool masterTempo = false; // true : hauteur préservée

  /// Lecture en arrière-plan : contrôles écran verrouillé / Dynamic Island / notification.
  static Future<void> initBackground() async {
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
  Song? get current {
    final i = player.currentIndex;
    return i != null && i < _queue.length ? _queue[i] : null;
  }

  bool get playing => player.playing;
  bool get shuffle => player.shuffleModeEnabled;
  LoopMode get loopMode => player.loopMode;
  bool get loading =>
      player.processingState == ProcessingState.loading ||
      player.processingState == ProcessingState.buffering;

  // ───────────────────────── Session ─────────────────────────

  /// Ouvre le cache du serveur et restaure la file sauvegardée (même serveur uniquement).
  Future<void> attach(SubsonicApi api) async {
    _api = api;
    _cache = await AudioCache.open(api.session, await _cacheDirFn());
    _stateDir = await _stateDirFn();
    await _stateDir!.create(recursive: true);
    unawaited(_cache!.evict());
    _loadSettings();
    unawaited(_applyRate());
    await _restore();
  }

  /// Déconnexion : arrêt et oubli de la file (le cache audio, lui, reste sur le disque).
  Future<void> detach() async {
    _gen++;
    try {
      await player.stop();
    } catch (_) {}
    _queue = const [];
    _sources = const [];
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
    _scrobbleId = null; // même titre relancé : nouvelle écoute
    start ??= player.shuffleModeEnabled ? Random().nextInt(songs.length) : 0;
    _queue = List.unmodifiable(songs);
    _sources = _sourcesFor(songs);
    _prefetchedFor = null;
    notifyListeners();
    try {
      await player.setAudioSources(
        _sources,
        initialIndex: start,
        initialPosition: Duration.zero,
      );
      if (player.shuffleModeEnabled) {
        await player.shuffle(); // piste choisie en tête du mélange
      }
    } on PlayerException catch (_) {
      // Piste illisible / serveur injoignable : l'état « idle » est reflété par l'UI.
    } on PlayerInterruptedException catch (_) {
      return; // remplacée par une autre demande de lecture
    }
    _saveQueue();
    unawaited(
      player.play(),
    ); // play() ne se termine qu'à la pause : ne pas attendre
  }

  Future<void> togglePlay() async {
    if (player.playing) return player.pause();
    if (player.processingState == ProcessingState.completed) {
      await player.seek(
        Duration.zero,
        index: player.effectiveIndices.firstOrNull,
      );
    }
    unawaited(player.play());
  }

  Future<void> next() => player.seekToNext();

  /// Comme partout : après 3 s, « précédent » revient au début de la piste.
  Future<void> previous() async {
    if (player.position > const Duration(seconds: 3) || !player.hasPrevious) {
      await seek(Duration.zero);
    } else {
      await player.seekToPrevious();
    }
  }

  Future<void> seek(Duration position) async {
    await player.seek(position);
    _savePosition(force: true);
  }

  Future<void> toggleShuffle() async {
    final on = !player.shuffleModeEnabled;
    if (on) await player.shuffle();
    await player.setShuffleModeEnabled(on);
    _saveQueue();
    _prefetchedFor = null;
    _prefetch();
  }

  Future<void> cycleRepeat() async {
    await player.setLoopMode(switch (player.loopMode) {
      LoopMode.off => LoopMode.all,
      LoopMode.all => LoopMode.one,
      LoopMode.one => LoopMode.off,
    });
    _saveQueue();
  }

  // ───────────────────────── Pitch ─────────────────────────

  /// Pitch fader façon platine DJ : vitesse et hauteur couplées, sauf en Master Tempo.
  void setPitch(double percent) {
    final p = ((percent.clamp(-pitchRange, pitchRange) * 10).round() / 10)
        .toDouble();
    // Un glissé envoie un évènement par pixel : rien à refaire si la valeur ne change pas.
    if (p == pitch) return;
    pitch = p;
    notifyListeners();
    _applyRate();
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
    _applyRate();
    _saveSettingsSoon();
  }

  bool _applying = false;
  bool _rateDirty = false;

  /// Coalesce les mises à jour pendant un glissé : au plus un réglage natif toutes les 60 ms
  /// (chaque changement de vitesse coûte au moteur audio), le dernier demandé gagne.
  Future<void> _applyRate() async {
    if (_applying) {
      _rateDirty = true;
      return;
    }
    _applying = true;
    try {
      do {
        _rateDirty = false;
        final speed = 1 + pitch / 100;
        final p = masterTempo ? 1.0 : speed;
        if (player.speed != speed) await player.setSpeed(speed);
        // Android : pitch natif ExoPlayer. iOS : correctif third_party/just_audio (Varispeed).
        if (player.pitch != p) await player.setPitch(p);
        await Future<void>.delayed(const Duration(milliseconds: 60));
      } while (_rateDirty);
    } catch (_) {
      // Plateforme sans pitch : la vitesse seule s'applique.
    } finally {
      _applying = false;
    }
  }

  // ───────────────────────── Sources & cache ─────────────────────────

  // Sources encore en téléchargement, par fichier de cache : une nouvelle file qui contient le
  // même titre reprend la même source, sinon deux téléchargements écriraient le même fichier.
  final _downloading = <String, LockCachingAudioSource>{};

  List<AudioSource> _sourcesFor(List<Song> songs) {
    final paths = {for (final s in songs) _cache!.fileFor(s).path};
    _downloading.removeWhere(
      (path, _) => !paths.contains(path) || File(path).existsSync(),
    );
    final used = <String>{};
    return [for (final s in songs) _source(s, reuse: used.add(s.id))];
  }

  /// [reuse] false : titre déjà présent plus tôt dans la file, lu en flux sans cache (une
  /// même source ne peut pas figurer deux fois dans une playlist just_audio).
  AudioSource _source(Song s, {bool reuse = true}) {
    final api = _api!;
    final file = _cache!.fileFor(s);
    final tag = MediaItem(
      id: s.id,
      title: s.title,
      artist: s.artist,
      album: s.album,
      duration: s.duration == null ? null : Duration(seconds: s.duration!),
      artUri: s.coverArt == null
          ? null
          : Uri.parse(api.coverUrl(s.coverArt!, 600)),
    );
    if (file.existsSync()) return AudioSource.file(file.path, tag: tag);
    final f = AudioCache.formatFor(s);
    final uri = api.streamUri(s.id, format: f.format, maxBitRate: f.maxBitRate);
    if (!reuse) return AudioSource.uri(uri, tag: tag);
    // Lit le flux ET l'enregistre dans le cache, en un seul téléchargement.
    return _downloading[file.path] ??= LockCachingAudioSource(
      uri,
      cacheFile: file,
      tag: tag,
    );
  }

  int _gen = 0;
  int? _prefetchedFor;

  void _onIndexChanged() {
    _savePosition(force: true);
    final c = current;
    if (c != null) _cache?.touch(c);
    _prefetch();
    notifyListeners();
  }

  /// Précharge la piste en cours et les [_upcoming] suivantes (ordre effectif : mélange et
  /// boucle compris), en laissant toujours la priorité réseau à la piste en cours, comme le
  /// bureau : rien d'autre tant qu'elle a moins de 15 s d'avance, puis une seule suivante,
  /// puis toutes en parallèle une fois qu'elle est entièrement téléchargée.
  Future<void> _prefetch() async {
    final i = player.currentIndex;
    if (i == null ||
        !player.playing ||
        _prefetchedFor == i ||
        _cache == null ||
        i >= _sources.length) {
      return;
    }
    _prefetchedFor = i;
    final gen = ++_gen;
    final upcoming = upcomingIndices(
      player.effectiveIndices,
      i,
      _upcoming,
      wrap: player.loopMode == LoopMode.all,
    );
    final keep = {
      for (final j in [i, ...upcoming]) _cache!.fileFor(_queue[j]).path,
    };

    // En général déjà demandée par le lecteur natif : même téléchargement, réutilisé.
    final current = _download(_sources[i]);
    await Future.any([current, _bufferedAhead(const Duration(seconds: 15))]);
    if (gen != _gen || upcoming.isEmpty) return;
    final first = _download(_sources[upcoming.first]);
    await current;
    if (gen != _gen) return;
    await Future.wait([
      first,
      for (final j in upcoming.skip(1)) _download(_sources[j]),
    ]);
    if (gen == _gen) await _cache!.evict(keep: keep);
  }

  /// Se termine quand le lecteur a [ahead] d'audio en tampon (8 s au plus d'attente).
  Future<void> _bufferedAhead(Duration ahead) => player.bufferedPositionStream
      .firstWhere((b) => b - player.position >= ahead)
      .timeout(const Duration(seconds: 8))
      .then<void>((_) {}, onError: (_) {});

  static Future<void> _download(AudioSource s) async {
    if (s is! LockCachingAudioSource) return; // déjà un fichier local
    try {
      // Une requête d'un octet déclenche le téléchargement complet vers le cache ; s'il est
      // déjà en cours (lecture), c'est le même téléchargement qui est réutilisé.
      final r = await s.request(0, 1);
      await r.stream.drain<void>();
      await s.downloadProgressStream
          .firstWhere((p) => p >= 1)
          .timeout(const Duration(minutes: 10));
    } catch (_) {
      // Échec réseau : on passe à la suivante, la lecture streamera.
    }
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
    if (song == null || api == null) return;
    if (song.id != _scrobbleId) {
      _scrobbleId = song.id;
      _resetScrobble();
    }
    final pos = player.position;
    if (!_nowPlayingSent && pos > const Duration(seconds: 1)) {
      _nowPlayingSent = true;
      unawaited(api.scrobble(song.id, submission: false).catchError((_) {}));
    }
    final at = _submitAt(
      player.duration ?? Duration(seconds: song.duration ?? 0),
    );
    if (!_submitted && at > Duration.zero && pos >= at) {
      _submitted = true;
      unawaited(api.scrobble(song.id, submission: true).catchError((_) {}));
    }
  }

  // ───────────────────────── Persistance ─────────────────────────

  Timer? _tick;
  String? _lastPosition;

  void _onPlaying(bool playing) {
    _tick?.cancel();
    // Fermeture forcée = pas de dernier rappel : on écrit la position chaque seconde en lecture.
    if (playing) {
      _tick = Timer.periodic(const Duration(seconds: 1), (_) {
        _savePosition();
        _scrobble();
      });
      _prefetch();
    } else {
      _savePosition(force: true);
    }
    notifyListeners();
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
      'shuffle': player.shuffleModeEnabled,
      'shuffleOrder': player.shuffleIndices,
      'loop': player.loopMode.index,
    });
    _savePosition(force: true);
  }

  void _savePosition({bool force = false}) {
    final i = player.currentIndex;
    if (i == null || _queue.isEmpty) return;
    final json = jsonEncode({'index': i, 'ms': player.position.inMilliseconds});
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
    _sources = _sourcesFor(songs);
    _prefetchedFor = null;
    notifyListeners();
    try {
      await player.setLoopMode(
        LoopMode.values[((q['loop'] as num?)?.toInt() ?? 0).clamp(0, 2)],
      );
      await player.setAudioSources(
        _sources,
        initialIndex: index,
        initialPosition: Duration(
          milliseconds: (p?['ms'] as num?)?.toInt() ?? 0,
        ),
        shuffleOrder: validOrder ? _FixedShuffleOrder(order) : null,
      );
      if (q['shuffle'] == true) await player.setShuffleModeEnabled(true);
      final at = _submitAt(Duration(seconds: songs[index].duration ?? 0));
      _scrobbleId = songs[index].id;
      _nowPlayingSent = false;
      _submitted =
          at > Duration.zero &&
          Duration(milliseconds: (p?['ms'] as num?)?.toInt() ?? 0) >= at;
    } catch (_) {
      // Hors ligne et piste non cachée : la file reste affichée, la lecture réessaiera.
    }
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
    _gen++; // arrête le préchargement en cours
    WidgetsBinding.instance.removeObserver(this);
    for (final s in _subs) {
      s.cancel();
    }
    _tick?.cancel();
    _settingsTimer?.cancel();
    player.dispose();
    super.dispose();
  }
}

/// Indices des [count] pistes qui suivent [current] dans [order] (ordre de lecture effectif).
List<int> upcomingIndices(
  List<int> order,
  int current,
  int count, {
  bool wrap = false,
}) {
  final pos = order.indexOf(current);
  if (pos < 0) return const [];
  return [
    for (var k = 1; k <= count && k < order.length; k++)
      if (pos + k < order.length)
        order[pos + k]
      else if (wrap)
        order[(pos + k) % order.length],
  ];
}

/// Ordre de mélange restauré tel qu'il était avant la fermeture de l'app. just_audio vide
/// puis remplit l'ordre (`clear()` + `insert(0, n)`) et remélange au chargement : on y glisse
/// l'ordre sauvé et on ignore ce premier mélange.
class _FixedShuffleOrder extends DefaultShuffleOrder {
  _FixedShuffleOrder(this._initial);

  List<int>? _initial;
  bool _skipShuffle = false;

  @override
  void shuffle({int? initialIndex}) {
    if (_skipShuffle) {
      _skipShuffle = false;
      return;
    }
    super.shuffle(initialIndex: initialIndex);
  }

  @override
  void insert(int index, int count) {
    final initial = _initial;
    _initial = null;
    if (initial != null &&
        indices.isEmpty &&
        index == 0 &&
        count == initial.length) {
      indices.addAll(initial);
      _skipShuffle = true;
    } else {
      super.insert(index, count);
    }
  }
}
