import 'dart:async';
import 'dart:io';
import 'dart:math';

/// Sans un octet reçu pendant ce délai, la connexion est jugée bloquée : on en ouvre une autre.
const _stall = Duration(seconds: 6);

/// Connexion + en-têtes : un serveur local répond en quelques ms, au-delà c'est une connexion
/// morte (socket inactif réutilisé, Wi-Fi qui se réveille) — mieux vaut en ouvrir une neuve vite.
const _headerWait = Duration(seconds: 4);

/// Téléchargement d'un titre vers son fichier de cache (`<fichier>.part`, renommé une fois
/// complet). Reprend à l'octet près quand le serveur accepte les plages (fichier original), relance
/// sans fin avec un délai croissant (0,5 s → 15 s) tant qu'il est demandé, et change de connexion
/// dès qu'elle se bloque — un réseau faible ralentit le chargement, il ne l'abandonne jamais.
class TrackDownload {
  TrackDownload._(this.uri, this.file, this._owner);

  final Uri uri;
  final File file;
  final Downloads _owner;
  File get _part => File('${file.path}.part');

  int total = -1; // taille annoncée, -1 : inconnue
  int received = 0; // octets écrits à la suite dans .part
  bool rangeOk = false;
  late bool complete = file.existsSync();
  bool get running => _running;
  bool _running = false;
  int _gen = 0;
  HttpClientRequest? _request;

  Completer<void> _signal = Completer<void>();

  void _notify() {
    final s = _signal;
    _signal = Completer<void>();
    s.complete();
  }

  /// Le fichier a été supprimé du cache : on repart de zéro au prochain besoin.
  void forget() {
    stop();
    try {
      _part.deleteSync();
    } catch (_) {}
    complete = false;
    received = 0;
    total = -1;
    rangeOk = false;
  }

  /// Attend la fin du téléchargement ; `false` si [cancelled] devient vrai avant (demande
  /// remplacée, p. ex. « suivant » répété). Se réveille à chaque octet reçu et à chaque arrêt.
  Future<bool> waitComplete(bool Function() cancelled) async {
    while (!complete) {
      if (cancelled()) return false;
      await _signal.future;
    }
    return true;
  }

  void start() {
    if (_running || complete) return;
    _running = true;
    final gen = ++_gen;
    // Une seule boucle écrit dans le .part à la fois : la nouvelle attend la fin de l'ancienne
    // (sinon, après un arrêt/reprise rapide, deux écritures se chevauchent et la reprise part
    // d'une taille périmée).
    final prev = _active;
    _active = () async {
      if (prev != null) await prev;
      if (gen == _gen) await _loop(gen);
    }();
  }

  Future<void>? _active;

  /// Arrêt sans perte : les octets déjà écrits servent à la reprise.
  void stop() {
    if (!_running) return;
    _running = false;
    _gen++;
    _request?.abort();
    _notify();
  }

  Future<void> _loop(int gen) async {
    var attempt = 0;
    while (gen == _gen && !complete) {
      try {
        if (await _fetch(gen)) attempt = 0;
      } catch (_) {
        // Coupure, blocage, réponse HTTP inattendue : nouvelle tentative ci-dessous.
      }
      if (gen != _gen || complete) break;
      final ms = min(15000, 500 * (1 << min(attempt++, 5)));
      await Future<void>.delayed(Duration(milliseconds: ms));
    }
    if (gen == _gen) _running = false;
    _owner._pump();
  }

  /// Une requête, lue jusqu'au bout ou jusqu'à la coupure. `true` si des octets sont arrivés.
  Future<bool> _fetch(int gen) async {
    final part = _part;
    received = part.existsSync() ? part.lengthSync() : 0;
    final req = await _owner._client.getUrl(uri).timeout(_headerWait);
    _request = req;
    req.headers.set(HttpHeaders.acceptEncodingHeader, 'identity');
    if (received > 0) {
      req.headers.set(HttpHeaders.rangeHeader, 'bytes=$received-');
    }
    final res = await req.close().timeout(_headerWait);
    if (gen != _gen) return false;
    if (res.statusCode == HttpStatus.requestedRangeNotSatisfiable &&
        received > 0) {
      await res.drain<void>();
      _finish(); // déjà tout reçu
      return true;
    }
    final partial = res.statusCode == HttpStatus.partialContent;
    if (!partial && res.statusCode != HttpStatus.ok) {
      await res.drain<void>();
      throw HttpException('HTTP ${res.statusCode}', uri: uri);
    }
    if (!partial) received = 0; // pas de reprise possible : on repart du début
    rangeOk =
        partial || res.headers.value(HttpHeaders.acceptRangesHeader) == 'bytes';
    final range = res.headers.value(HttpHeaders.contentRangeHeader);
    total = partial
        ? int.tryParse(range?.split('/').last ?? '') ?? -1
        : res.contentLength;
    _notify();

    final raf = await part.open(
      mode: partial ? FileMode.append : FileMode.write,
    );
    var progressed = false;
    try {
      await for (final chunk in res.timeout(_stall)) {
        if (gen != _gen) return progressed;
        await raf.writeFrom(chunk);
        received += chunk.length;
        progressed = true;
        _notify();
      }
    } finally {
      await raf.close();
    }
    if (gen != _gen) return progressed;
    // Coupure propre en cours de route : la taille annoncée n'est pas atteinte, on reprendra.
    if (rangeOk && total > 0 && received < total) return progressed;
    _finish();
    return true;
  }

  void _finish() {
    try {
      _part.renameSync(file.path);
    } catch (_) {}
    complete = true;
    _running = false;
    _notify();
    _owner.onComplete?.call();
  }
}

/// Ordre des téléchargements : la piste en cours puis les suivantes, une à la fois pour leur
/// laisser toute la bande passante. Changer l'ordre (« suivant » répété) arrête aussitôt ce qui ne
/// compte plus : le titre demandé n'attend jamais derrière un titre abandonné.
class Downloads {
  Downloads({this.onIdle, this.onComplete});

  /// Un titre vient d'être entièrement écrit dans le cache.
  final void Function()? onComplete;

  /// Plus rien à télécharger dans l'ordre demandé (pour l'éviction du cache).
  final void Function()? onIdle;

  // idleTimeout court : une connexion gardée ouverte puis coupée par le serveur/Wi-Fi bloquait
  // la requête suivante jusqu'au délai. autoUncompress off : du gzip sur de l'audio casserait la
  // reprise par plage et la taille annoncée.
  final _client = HttpClient()
    ..connectionTimeout = const Duration(seconds: 5)
    ..idleTimeout = const Duration(seconds: 3)
    ..autoUncompress = false;
  final _all = <String, TrackDownload>{};
  List<TrackDownload> _order = const [];

  TrackDownload of(Uri uri, File file) =>
      _all[file.path] ??= TrackDownload._(uri, file, this);

  /// Ne garde en mémoire que les titres de [keep] et ceux encore en cours.
  void retain(Set<String> keep) =>
      _all.removeWhere((path, d) => !keep.contains(path) && !d.running);

  void prioritize(List<TrackDownload> order) {
    _order = order;
    _idle = false;
    _pump();
  }

  bool _idle = false;

  void _pump() {
    TrackDownload? next;
    for (final d in _order) {
      if (!d.complete) {
        next = d;
        break;
      }
    }
    for (final d in _all.values) {
      if (d == next) {
        d.start();
      } else {
        d.stop();
      }
    }
    if (next == null && _order.isNotEmpty && !_idle) {
      _idle = true;
      onIdle?.call();
    }
  }

  /// Oublie l'état des titres dont le fichier vient d'être supprimé (hors [keep], non lus).
  void forgetExcept(Set<String> keep) {
    for (final d in _all.values) {
      if (!keep.contains(d.file.path)) d.forget();
    }
  }

  void stopAll() {
    _order = const [];
    for (final d in _all.values) {
      d.stop();
    }
  }

  void close() {
    stopAll();
    _client.close(force: true);
  }
}
