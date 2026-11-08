import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:resonia/api.dart';
import 'package:resonia/session.dart';

/// Faux serveur Subsonic local : mot de passe « secret », 2 albums, aucune playlist.
Future<HttpServer> fakeNavidrome({bool html = false}) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen((req) {
    final q = req.uri.queryParameters;
    final ok = q['t'] == md5.convert(utf8.encode('secret${q['s']}')).toString();
    final Map<String, dynamic> body = !ok
        ? {
            'status': 'failed',
            'error': {'code': 40, 'message': 'Wrong username or password'},
          }
        : switch (req.uri.pathSegments.last) {
            'getAlbumList2' => {
              'status': 'ok',
              'albumList2': {
                'album': [
                  {
                    'id': 'a1',
                    'name': 'One',
                    'artist': 'X',
                    'coverArt': 'al-a1',
                    'year': 2020,
                    'songCount': 9,
                  },
                  {'id': 2, 'name': 'Two'},
                ],
              },
            },
            'getPlaylists' => {'status': 'ok', 'playlists': {}},
            _ => {'status': 'ok'},
          };
    req.response
      ..write(
        html ? '<html>nope</html>' : jsonEncode({'subsonic-response': body}),
      )
      ..close();
  });
  return server;
}

Future<ApiError?> errorOf(Future<Object?> Function() f) async {
  try {
    await f();
    return null;
  } on ApiException catch (e) {
    return e.error;
  }
}

void main() {
  test('isLocalHost', () {
    for (final h in [
      'localhost',
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.1',
      '192.168.1.2',
      '169.254.1.1',
      '100.101.102.103',
      'nas',
      'nas.local',
      '::1',
      'fd12::1',
      'fe80::1',
    ]) {
      expect(isLocalHost(h), isTrue, reason: h);
    }
    for (final h in [
      'music.example.com',
      '8.8.8.8',
      '172.32.0.1',
      '100.128.0.1',
      '2001:db8::1',
    ]) {
      expect(isLocalHost(h), isFalse, reason: h);
    }
  });

  test('normalizeServerUrl', () {
    expect(
      normalizeServerUrl(' music.example.com/ '),
      'https://music.example.com',
    );
    expect(normalizeServerUrl('192.168.1.2:4533'), 'http://192.168.1.2:4533');
    expect(normalizeServerUrl('nas.local:4533/'), 'http://nas.local:4533');
    expect(
      normalizeServerUrl('http://192.168.1.2:4533//'),
      'http://192.168.1.2:4533',
    );
    expect(normalizeServerUrl('https://192.168.1.2'), 'https://192.168.1.2');
    expect(
      normalizeServerUrl('https://example.com/navidrome'),
      'https://example.com/navidrome',
    );
    expect(
      () => normalizeServerUrl(''),
      throwsA(
        isA<ApiException>().having(
          (e) => e.error,
          'error',
          ApiError.invalidUrl,
        ),
      ),
    );
    expect(
      () => normalizeServerUrl('ftp://example.com'),
      throwsA(
        isA<ApiException>().having(
          (e) => e.error,
          'error',
          ApiError.invalidUrl,
        ),
      ),
    );
    expect(
      () => normalizeServerUrl('http://music.example.com'),
      throwsA(
        isA<ApiException>().having(
          (e) => e.error,
          'error',
          ApiError.insecureHttp,
        ),
      ),
    );
  });

  test(
    'login succeeds with the right password and stores no password',
    () async {
      final server = await fakeNavidrome();
      addTearDown(server.close);
      final s = await login(
        'http://127.0.0.1:${server.port}/',
        ' noe ',
        'secret',
      );
      expect(s.url, 'http://127.0.0.1:${server.port}');
      expect(s.username, 'noe');
      expect(s.toJson().values, isNot(contains('secret')));
    },
  );

  test('login maps failures to errors', () async {
    final server = await fakeNavidrome();
    addTearDown(server.close);
    final html = await fakeNavidrome(html: true);
    addTearDown(html.close);

    expect(
      await errorOf(
        () => login('http://127.0.0.1:${server.port}', 'noe', 'wrong'),
      ),
      ApiError.badCredentials,
    );
    expect(
      await errorOf(
        () => login('http://127.0.0.1:${html.port}', 'noe', 'secret'),
      ),
      ApiError.notNavidrome,
    );
    expect(
      await errorOf(() => login('not a url at all://', 'noe', 'secret')),
      ApiError.invalidUrl,
    );
    // Port fermé : connexion refusée.
    final closed = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final port = closed.port;
    await closed.close();
    expect(
      await errorOf(() => login('http://127.0.0.1:$port', 'noe', 'secret')),
      ApiError.unreachable,
    );
  });

  test('api parses album lists and empty playlists', () async {
    final server = await fakeNavidrome();
    addTearDown(server.close);
    final session = await login(
      'http://127.0.0.1:${server.port}',
      'noe',
      'secret',
    );
    final api = SubsonicApi(session);
    addTearDown(api.close);

    final albums = await api.albumList(AlbumListType.recent);
    expect(albums.map((a) => a.id), ['a1', '2']);
    expect(
      (albums.first.artist, albums.first.year, albums.first.songCount),
      ('X', 2020, 9),
    );
    expect(await api.playlists(), isEmpty);
    expect(
      api.coverUrl('al-a1', 300),
      allOf(
        contains('/rest/getCoverArt?'),
        contains('id=al-a1'),
        contains('size=300'),
      ),
    );
  });

  test('SessionStore round-trips and clears', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final store = SessionStore();
    expect(await store.load(), isNull);
    const s = Session(
      url: 'https://m.example.com',
      username: 'noe',
      salt: 'abc',
      token: 'def',
    );
    await store.save(s);
    expect((await store.load())?.toJson(), s.toJson());
    await store.clear();
    expect(await store.load(), isNull);
  });

  test('album tracks share the album cover (no download per track)', () {
    final d = AlbumDetails.fromJson({
      'id': 'a1',
      'name': 'One',
      'coverArt': 'al-a1_1',
      'song': [
        {'id': 's1', 'title': 'A', 'coverArt': 'mf-s1_1'},
        {'id': 's2', 'title': 'B'},
      ],
    });
    expect(d.songs.map((s) => s.coverArt), ['al-a1_1', 'al-a1_1']);
  });
}
