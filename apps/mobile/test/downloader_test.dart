import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:resonia/player/downloader.dart';

final _bytes = List<int>.generate(200000, (i) => i % 251);

void main() {
  late Directory tmp;
  late HttpServer server;
  final ranges = <String?>[];

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('resonia-dl');
    ranges.clear();
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((req) async {
      final range = req.headers.value(HttpHeaders.rangeHeader);
      ranges.add(range);
      final res = req.response
        ..headers.set(HttpHeaders.acceptRangesHeader, 'bytes');
      if (range == null) {
        // Première connexion : coupée net après la moitié du fichier.
        res.contentLength = _bytes.length;
        final socket = await res.detachSocket();
        socket.add(_bytes.sublist(0, 100000));
        await socket.flush();
        socket.destroy();
        return;
      }
      final start = int.parse(range.split('=').last.split('-').first);
      res
        ..statusCode = HttpStatus.partialContent
        ..headers.set(
          HttpHeaders.contentRangeHeader,
          'bytes $start-${_bytes.length - 1}/${_bytes.length}',
        )
        ..contentLength = _bytes.length - start
        ..add(_bytes.sublist(start));
      await res.close();
    });
  });

  tearDown(() async {
    await server.close(force: true);
    await tmp.delete(recursive: true);
  });

  test('a cut connection resumes at the exact byte', () async {
    final downloads = Downloads();
    final file = File('${tmp.path}/s1.mp3');
    final d = downloads.of(
      Uri.parse('http://127.0.0.1:${server.port}/rest/stream'),
      file,
    );
    d.start();
    expect(await d.waitComplete(() => false), isTrue);

    expect(d.complete, isTrue);
    expect(file.readAsBytesSync(), _bytes);
    expect(File('${file.path}.part').existsSync(), isFalse);
    expect(ranges.first, isNull);
    expect(
      ranges.last,
      startsWith('bytes='),
    ); // reprise, pas un nouveau départ à 0
    expect(ranges.last, isNot('bytes=0-'));
    downloads.close();
  });
}
