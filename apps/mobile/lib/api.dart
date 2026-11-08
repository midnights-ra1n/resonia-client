import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'session.dart';

enum ApiError {
  invalidUrl,
  insecureHttp,
  unreachable,
  notNavidrome,
  badCredentials,
  unknown,
}

class ApiException implements Exception {
  const ApiException(this.error);
  final ApiError error;

  @override
  String toString() => 'ApiException($error)';
}

class Album {
  const Album({
    required this.id,
    required this.name,
    this.artist,
    this.coverArt,
    this.year,
    this.songCount,
  });

  final String id;
  final String name;
  final String? artist;
  final String? coverArt;
  final int? year;
  final int? songCount;

  factory Album.fromJson(Map<String, dynamic> j) => Album(
    id: '${j['id']}',
    name: '${j['name'] ?? j['title'] ?? ''}',
    artist: j['artist'] as String?,
    coverArt: j['coverArt'] as String?,
    year: (j['year'] as num?)?.toInt(),
    songCount: (j['songCount'] as num?)?.toInt(),
  );
}

class Playlist {
  const Playlist({
    required this.id,
    required this.name,
    this.coverArt,
    this.songCount,
  });

  final String id;
  final String name;
  final String? coverArt;
  final int? songCount;

  factory Playlist.fromJson(Map<String, dynamic> j) => Playlist(
    id: '${j['id']}',
    name: '${j['name'] ?? ''}',
    coverArt: j['coverArt'] as String?,
    songCount: (j['songCount'] as num?)?.toInt(),
  );
}

/// Piste. Sérialisable : la file d'attente est sauvegardée telle quelle (voir player/player.dart).
class Song {
  const Song({
    required this.id,
    required this.title,
    this.artist,
    this.album,
    this.albumId,
    this.coverArt,
    this.duration,
    this.track,
    this.disc,
    this.suffix,
  });

  final String id;
  final String title;
  final String? artist;
  final String? album;
  final String? albumId;
  final String? coverArt;
  final int? duration; // secondes
  final int? track;
  final int? disc;
  final String? suffix;

  factory Song.fromJson(Map<String, dynamic> j) => Song(
    id: '${j['id']}',
    title: '${j['title'] ?? ''}',
    artist: j['artist'] as String?,
    album: j['album'] as String?,
    albumId: j['albumId'] == null ? null : '${j['albumId']}',
    coverArt: j['coverArt'] as String?,
    duration: (j['duration'] as num?)?.toInt(),
    track: (j['track'] as num?)?.toInt(),
    disc: (j['discNumber'] as num?)?.toInt(),
    suffix: j['suffix'] as String?,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'artist': artist,
    'album': album,
    'albumId': albumId,
    'coverArt': coverArt,
    'duration': duration,
    'track': track,
    'discNumber': disc,
    'suffix': suffix,
  };
}

class AlbumDetails {
  const AlbumDetails({required this.album, required this.songs, this.duration});

  final Album album;
  final List<Song> songs;
  final int? duration; // secondes

  factory AlbumDetails.fromJson(Map<String, dynamic> j) {
    final album = Album.fromJson(j);
    return AlbumDetails(
      album: album,
      // Navidrome donne à chaque piste sa propre pochette (mf-…) : celle de l'album à la place,
      // déjà en cache, sinon chaque changement de piste la retéléchargerait.
      songs: [
        for (final s in (j['song'] as List?) ?? const [])
          Song.fromJson({
            ...s as Map<String, dynamic>,
            if (album.coverArt != null) 'coverArt': album.coverArt,
          }),
      ],
      duration: (j['duration'] as num?)?.toInt(),
    );
  }
}

enum AlbumListType { frequent, recent, newest, random }

/// Client Subsonic minimal (même API que packages/api-client côté web).
class SubsonicApi {
  SubsonicApi(this.session, {HttpClient? client})
    : _http =
          client ??
          (HttpClient()..connectionTimeout = const Duration(seconds: 10));

  final Session session;
  final HttpClient _http;

  Uri _uri(String endpoint, [Map<String, String> params = const {}]) =>
      Uri.parse('${session.url}/rest/$endpoint')
          .replace(queryParameters: {...session.authParams, ...params});

  /// URL stable (salt/token fixes) : sert aussi de clé au cache d'images.
  String coverUrl(String coverArt, int size) =>
      _uri('getCoverArt', {'id': coverArt, 'size': '$size'}).toString();

  /// `format` : 'raw' (fichier original) ou un format de transcodage Navidrome ('aac'…).
  Uri streamUri(String id, {String format = 'raw', int maxBitRate = 0}) =>
      _uri('stream', {
        'id': id,
        'format': format,
        if (maxBitRate > 0) 'maxBitRate': '$maxBitRate',
        // Content-Length estimé pour les transcodages : AVPlayer/ExoPlayer connaissent la durée.
        if (format != 'raw') 'estimateContentLength': 'true',
      });

  Future<Map<String, dynamic>> _get(
    String endpoint, [
    Map<String, String> params = const {},
  ]) async {
    final String body;
    try {
      final res = await (await _http.getUrl(_uri(endpoint, params)))
          .close()
          .timeout(const Duration(seconds: 15));
      body = await res.transform(utf8.decoder).join();
    } on SocketException {
      throw const ApiException(ApiError.unreachable);
    } on HandshakeException {
      throw const ApiException(ApiError.unreachable);
    } on TimeoutException {
      throw const ApiException(ApiError.unreachable);
    } on HttpException {
      throw const ApiException(ApiError.unreachable);
    }
    final Map<String, dynamic> sub;
    try {
      sub =
          (jsonDecode(body) as Map<String, dynamic>)['subsonic-response']
              as Map<String, dynamic>;
    } catch (_) {
      throw const ApiException(ApiError.notNavidrome);
    }
    if (sub['status'] == 'ok') return sub;
    // 40 : identifiants faux ; 41 : auth par token refusée (compte LDAP, etc.).
    final code = (sub['error'] as Map?)?['code'];
    throw ApiException(
      code == 40 || code == 41 ? ApiError.badCredentials : ApiError.unknown,
    );
  }

  Future<void> ping() => _get('ping');

  Future<List<Album>> albumList(AlbumListType type, {int size = 20}) async {
    final r = await _get('getAlbumList2', {'type': type.name, 'size': '$size'});
    return [
      for (final a in (r['albumList2']?['album'] as List?) ?? const [])
        Album.fromJson(a as Map<String, dynamic>),
    ];
  }

  Future<AlbumDetails> album(String id) async => AlbumDetails.fromJson(
    (await _get('getAlbum', {'id': id}))['album'] as Map<String, dynamic>,
  );

  Future<List<Playlist>> playlists() async {
    final r = await _get('getPlaylists');
    return [
      for (final p in (r['playlists']?['playlist'] as List?) ?? const [])
        Playlist.fromJson(p as Map<String, dynamic>),
    ];
  }

  /// « Now Playing » de Navidrome (submission false) ou écoute comptée (submission true).
  Future<void> scrobble(String id, {required bool submission}) async {
    await _get('scrobble', {'id': id, 'submission': '$submission'});
  }

  Future<Uint8List> bytes(String url) async {
    final res = await (await _http.getUrl(Uri.parse(url)))
        .close()
        .timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) throw const HttpException('bad status');
    final b = BytesBuilder(copy: false);
    await res.forEach(b.add);
    return b.takeBytes();
  }

  void close() => _http.close();
}
