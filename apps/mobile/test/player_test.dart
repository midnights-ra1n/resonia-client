import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:just_audio/just_audio.dart';
import 'package:just_audio_platform_interface/just_audio_platform_interface.dart';
import 'package:resonia/api.dart';
import 'package:resonia/app_scope.dart';
import 'package:resonia/l10n/app_localizations.dart';
import 'package:resonia/player/player.dart';
import 'package:resonia/player/player_ui.dart';
import 'package:resonia/session.dart';
import 'package:resonia/widgets.dart';

import 'fake_audio_platform.dart';

final songs = [
  for (var i = 0; i < 6; i++)
    Song(
      id: 's$i',
      title: 'Song $i',
      albumId: 'a1',
      suffix: 'mp3',
      duration: 180,
    ),
];

/// Faux Navidrome : chaque /rest/stream renvoie 4 Ko « audio ».
final requests = <Uri>[];

Future<HttpServer> fakeServer() async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  requests.clear();
  server.listen((req) {
    requests.add(req.uri);
    req.response.headers.contentType = ContentType('audio', 'mpeg');
    req.response.contentLength = 4096;
    req.response
      ..add(List.filled(4096, 7))
      ..close();
  });
  return server;
}

late Directory tmp;
late HttpServer server;
late SubsonicApi api;
final controllers = <PlayerController>[];

PlayerController newController() {
  final c = PlayerController(
    player: AudioPlayer(),
    stateDir: () async => Directory('${tmp.path}/state'),
    cacheDir: () async => Directory('${tmp.path}/cache'),
  );
  controllers.add(c);
  return c;
}

bool downloading() =>
    Directory(tmp.path)
        .listSync(recursive: true)
        .any((f) => f.path.endsWith('.part'));

Future<void> until(bool Function() cond) async {
  for (var i = 0; i < 200 && !cond(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 25));
  }
  expect(cond(), isTrue);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // Le binding de test fait répondre 400 à tout HttpClient : ici, vrai faux serveur local.
  HttpOverrides.global = null;

  setUp(() async {
    JustAudioPlatform.instance = FakeJustAudio();
    tmp = await Directory.systemTemp.createTemp('resonia');
    server = await fakeServer();
    const salt = 'abc';
    api = SubsonicApi(
      Session(
        url: 'http://127.0.0.1:${server.port}',
        username: 'noe',
        salt: salt,
        token: md5.convert(utf8.encode('secret$salt')).toString(),
      ),
    );
  });

  tearDown(() async {
    // Préchargement arrêté, puis on laisse finir le téléchargement en vol avant de tout effacer.
    for (final c in controllers) {
      c.dispose();
    }
    controllers.clear();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await until(() => !downloading());
    api.close();
    await server.close(force: true);
    await tmp.delete(recursive: true);
  });

  test(
    'upcomingIndices follows the effective order and wraps on repeat-all',
    () {
      expect(upcomingIndices([0, 1, 2, 3, 4], 1, 3), [2, 3, 4]);
      expect(upcomingIndices([0, 1, 2, 3, 4], 3, 3), [4]);
      expect(upcomingIndices([0, 1, 2, 3, 4], 3, 3, wrap: true), [4, 0, 1]);
      expect(upcomingIndices([3, 0, 4, 1, 2], 4, 3), [1, 2]); // mélange
      expect(upcomingIndices([0, 1], 0, 3, wrap: true), [
        1,
      ]); // jamais la piste en cours
    },
  );

  test('force-quit: the next launch resumes the same track, position, queue and shuffle order', () async {
    final a = newController();
    await a.attach(api);
    await a.playQueue(songs, start: 2);
    await a.seek(const Duration(seconds: 42, milliseconds: 500));
    await a.toggleShuffle();
    await a.player
        .pause(); // position figée : elle doit revenir à la milliseconde près
    final order = List.of(a.player.shuffleIndices);
    // Pas de dispose() : l'app est tuée, seuls les fichiers déjà écrits comptent.

    final b = newController();
    await b.attach(api);
    expect(b.queue.map((s) => s.id), songs.map((s) => s.id));
    expect(b.current?.id, 's2');
    expect(b.player.position, const Duration(seconds: 42, milliseconds: 500));
    expect(b.shuffle, isTrue);
    expect(b.player.shuffleIndices, order);
    expect(b.playing, isFalse); // reprise en pause, jamais de son au lancement
  });

  test(
    'another server does not restore the queue; logout forgets it',
    () async {
      final a = newController();
      await a.attach(api);
      await a.playQueue(songs);

      final other = SubsonicApi(
        Session(
          url: 'https://other.example.com',
          username: 'noe',
          salt: 's',
          token: 't',
        ),
      );
      final b = newController();
      await b.attach(other);
      expect(b.queue, isEmpty);

      await a.detach();
      final c = newController();
      await c.attach(api);
      expect(c.queue, isEmpty);
    },
  );

  test(
    'prefetch caches the current track and the next 3, not further',
    () async {
      final a = newController();
      await a.attach(api);
      await a.playQueue(songs, start: 1);
      File cached(String id) => Directory('${tmp.path}/cache/audio')
          .listSync()
          .whereType<Directory>()
          .first
          .listSync()
          .whereType<File>()
          .firstWhere(
            (f) => f.path.endsWith('/$id.mp3'),
            orElse: () => File('missing'),
          );
      await until(
        () => ['s1', 's2', 's3', 's4'].every((id) => cached(id).existsSync()),
      );
      expect(cached('s4').lengthSync(), 4096);
      expect(cached('s5').existsSync(), isFalse);
      expect(cached('s0').existsSync(), isFalse);
    },
  );

  test('pitch couples speed and pitch, Master Tempo keeps the pitch, settings persist', () async {
    final a = newController();
    await a.attach(api);
    await a.playQueue(songs);
    final native = (JustAudioPlatform.instance as FakeJustAudio).players.last;

    a.setPitch(2.54);
    expect(a.pitch, 2.5);
    await until(() => native.speed == 1.025 && native.pitch == 1.025);

    a.toggleMasterTempo();
    await until(() => native.speed == 1.025 && native.pitch == 1);

    a.setPitch(30); // borné à la plage (±8 par défaut)
    expect(a.pitch, 8);
    a.setPitchRange(4);
    expect(a.pitch, 4);

    await Future<void>.delayed(
      const Duration(milliseconds: 600),
    ); // écriture différée
    final b = newController();
    await b.attach(api);
    expect((b.pitch, b.pitchRange, b.masterTempo), (4.0, 4, true));
  });

  testWidgets(
    'now playing: swipe the cover left for next, right for previous, down to close',
    (tester) async {
      tester.view.physicalSize = const Size(1179, 2556); // iPhone 15
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final c = newController();
      await tester.runAsync(() async {
        await c.attach(api);
        await c.playQueue(songs, start: 1);
        await c.player
            .pause(); // pas de minuterie de position : l'écran se stabilise
      });
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          builder: (context, child) =>
              AppScope(api: api, player: c, child: child!),
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () => openNowPlaying(context),
              child: const Text('open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      // Le lecteur (créé hors du temps simulé) répond en temps réel : on lui en laisse un peu.
      Future<void> swipe(Offset by) async {
        await tester.fling(find.byType(Cover), by, 1200);
        await tester.pumpAndSettle();
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 50)),
        );
        await tester.pumpAndSettle();
      }

      await swipe(const Offset(-300, 0));
      expect(c.current?.id, 's2');
      await swipe(const Offset(300, 0));
      expect(c.current?.id, 's1');
      await swipe(const Offset(0, 300));
      expect(find.byType(NowPlayingPage), findsNothing);
    },
  );

  test(
    'shuffle: Play starts on a random track, a tapped track plays first',
    () async {
      final a = newController();
      await a.attach(api);
      await a.toggleShuffle();
      final starts = <String>{};
      for (var k = 0; k < 10; k++) {
        await a.playQueue(songs);
        starts.add(a.current!.id);
        expect(a.player.effectiveIndices.first, a.player.currentIndex);
      }
      expect(starts.length, greaterThan(1)); // jamais toujours la piste 1
      await a.playQueue(songs, start: 4);
      expect(a.current?.id, 's4');
    },
  );

  test(
    'Navidrome: now playing after 1 s, play counted at half the track',
    () async {
      final a = newController();
      await a.attach(api);
      await a.playQueue(songs);
      List<String?> scrobbles() => [
        for (final u in requests)
          if (u.path.endsWith('/scrobble'))
            '${u.queryParameters['id']} ${u.queryParameters['submission']}',
      ];
      await a.seek(const Duration(seconds: 5));
      await until(() => scrobbles().contains('s0 false'));
      expect(scrobbles(), isNot(contains('s0 true')));
      await a.seek(
        const Duration(seconds: 91),
      ); // titre de 3 min : compté à 1:30
      await until(() => scrobbles().contains('s0 true'));
      expect(scrobbles().where((s) => s == 's0 true'), hasLength(1));
    },
  );
}
