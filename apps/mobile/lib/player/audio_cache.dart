import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';

import '../api.dart';
import '../session.dart';

/// Cache disque des fichiers audio, par serveur : `<caches>/audio/<serveur>/<id>.<ext>`.
///
/// Le téléchargement lui-même est fait par `LockCachingAudioSource` (just_audio) : la piste en
/// cours est lue ET enregistrée en un seul téléchargement, et le préchargement des suivantes
/// passe par la même source (voir PlayerController._prefetch) — jamais deux téléchargements du
/// même fichier. Ici : emplacements, choix du format, éviction.
class AudioCache {
  AudioCache(this.dir);

  final Directory dir;

  /// shortcut: limite fixe, à rendre réglable avec la page Paramètres.
  static const maxBytes = 2 * 1024 * 1024 * 1024;

  /// Formats lus nativement : envoyés tels quels (`format=raw`), ce qui garde les métadonnées
  /// gapless d'origine (délai et remplissage de l'encodeur). Le reste est transcodé en AAC
  /// 256 kb/s (qualité par défaut du web), sans ces métadonnées.
  static final _native = {
    'mp3',
    'm4a',
    'mp4',
    'aac',
    'flac',
    'wav',
    'aif',
    'aiff',
    'alac',
    'caf',
    // ExoPlayer lit aussi Ogg (Vorbis, Opus) : pas de transcodage sur Android.
    if (Platform.isAndroid) ...['ogg', 'oga', 'opus'],
  };

  /// [base] : dossier de caches de l'app (`getApplicationCacheDirectory`).
  static Future<AudioCache> open(Session s, Directory base) async {
    final key = md5
        .convert(utf8.encode('${s.url}|${s.username}'))
        .toString()
        .substring(0, 12);
    final dir = Directory('${base.path}/audio/$key');
    await dir.create(recursive: true);
    return AudioCache(dir);
  }

  static ({String format, int maxBitRate, String ext}) formatFor(Song s) {
    final suffix = s.suffix?.toLowerCase();
    return suffix != null && _native.contains(suffix)
        ? (format: 'raw', maxBitRate: 0, ext: suffix)
        : (format: 'aac', maxBitRate: 256, ext: 'aac');
  }

  /// L'extension compte : AVPlayer identifie le type d'un fichier local par son extension.
  File fileFor(Song s) => File(
    '${dir.path}/${s.id.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_')}.${formatFor(s).ext}',
  );

  bool isCached(Song s) => fileFor(s).existsSync();

  /// Marque un fichier comme récemment utilisé (éviction LRU sur la date de modification).
  void touch(Song s) {
    try {
      fileFor(s).setLastModifiedSync(DateTime.now());
    } catch (_) {}
  }

  /// Supprime les fichiers les moins récemment utilisés au-delà de [maxBytes], sauf [keep]
  /// (pistes en cours / à venir), ainsi que les téléchargements partiels abandonnés.
  Future<void> evict({
    Set<String> keep = const {},
    int limit = maxBytes,
  }) async {
    final files = <File>[];
    final stale = DateTime.now().subtract(const Duration(days: 1));
    await for (final e in dir.list()) {
      if (e is! File) continue;
      if (e.path.endsWith('.part')) {
        if (e.statSync().modified.isBefore(stale)) _delete(e);
      } else if (!e.path.endsWith('.mime')) {
        files.add(e);
      }
    }
    final stats = {for (final f in files) f: f.statSync()};
    var total = stats.values.fold<int>(0, (a, s) => a + s.size);
    if (total <= limit) return;
    files.sort((a, b) => stats[a]!.modified.compareTo(stats[b]!.modified));
    for (final f in files) {
      if (total <= limit) break;
      if (keep.contains(f.path)) continue;
      total -= stats[f]!.size;
      _delete(f);
      _delete(File('${f.path}.mime'));
    }
  }

  static void _delete(File f) {
    try {
      f.deleteSync();
    } catch (_) {}
  }
}
