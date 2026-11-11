import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:resonia/api.dart';
import 'package:resonia/session.dart';
import 'package:resonia/widgets.dart';

void main() {
  test('covers: one download per size tier, then read from disk', () async {
    final sizes = <String>[];
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((req) {
      sizes.add(req.uri.queryParameters['size']!);
      req.response
        ..add([1, 2, 3])
        ..close();
    });
    final tmp = await Directory.systemTemp.createTemp('covers');
    addTearDown(() async {
      await server.close(force: true);
      await tmp.delete(recursive: true);
    });
    coverCacheDir = Future.value(tmp);
    final api = SubsonicApi(
      Session(
        url: 'http://127.0.0.1:${server.port}',
        username: 'noe',
        salt: 's',
        token: 't',
      ),
    );
    addTearDown(api.close);

    // Mini-lecteur (120) et accès rapide (168) en même temps : même palier, une requête.
    await Future.wait([
      coverBytes(api, 'al-1', 120),
      coverBytes(api, 'al-1', 168),
    ]);
    await Future<void>.delayed(
      const Duration(milliseconds: 50),
    ); // écriture disque
    expect(await coverBytes(api, 'al-1', 120), [1, 2, 3]); // depuis le disque
    await coverBytes(api, 'al-1', 900);
    expect(sizes, ['200', '1000']);
  });
}
