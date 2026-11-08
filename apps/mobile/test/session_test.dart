import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:resonia/session.dart';

/// Faux serveur Subsonic local : répond au ping selon le mot de passe « secret ».
Future<HttpServer> fakeNavidrome({bool html = false}) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen((req) {
    final q = req.uri.queryParameters;
    final ok = q['t'] == md5.convert(utf8.encode('secret${q['s']}')).toString();
    req.response
      ..write(html
          ? '<html>nope</html>'
          : jsonEncode({
              'subsonic-response': ok
                  ? {'status': 'ok'}
                  : {'status': 'failed', 'error': {'code': 40, 'message': 'Wrong username or password'}},
            }))
      ..close();
  });
  return server;
}

Future<LoginError?> errorOf(Future<Session> f) async {
  try {
    await f;
    return null;
  } on LoginException catch (e) {
    return e.error;
  }
}

void main() {
  test('normalizeServerUrl', () {
    expect(normalizeServerUrl(' music.example.com/ '), 'https://music.example.com');
    expect(normalizeServerUrl('http://192.168.1.2:4533//'), 'http://192.168.1.2:4533');
    expect(normalizeServerUrl('https://example.com/navidrome'), 'https://example.com/navidrome');
    expect(normalizeServerUrl(''), isNull);
    expect(normalizeServerUrl('ftp://example.com'), isNull);
    expect(normalizeServerUrl('http://'), isNull);
  });

  test('login succeeds with the right password and stores no password', () async {
    final server = await fakeNavidrome();
    addTearDown(server.close);
    final s = await login('http://127.0.0.1:${server.port}/', ' noe ', 'secret');
    expect(s.url, 'http://127.0.0.1:${server.port}');
    expect(s.username, 'noe');
    expect(s.toJson().values, isNot(contains('secret')));
  });

  test('login maps failures to errors', () async {
    final server = await fakeNavidrome();
    addTearDown(server.close);
    final html = await fakeNavidrome(html: true);
    addTearDown(html.close);

    expect(await errorOf(login('http://127.0.0.1:${server.port}', 'noe', 'wrong')), LoginError.badCredentials);
    expect(await errorOf(login('http://127.0.0.1:${html.port}', 'noe', 'secret')), LoginError.notNavidrome);
    expect(await errorOf(login('not a url at all://', 'noe', 'secret')), LoginError.invalidUrl);
    // Port fermé : connexion refusée.
    final closed = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final port = closed.port;
    await closed.close();
    expect(await errorOf(login('http://127.0.0.1:$port', 'noe', 'secret')), LoginError.unreachable);
  });

  test('SessionStore round-trips and clears', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final store = SessionStore();
    expect(await store.load(), isNull);
    const s = Session(url: 'https://m.example.com', username: 'noe', salt: 'abc', token: 'def');
    await store.save(s);
    expect((await store.load())?.toJson(), s.toJson());
    await store.clear();
    expect(await store.load(), isNull);
  });
}
