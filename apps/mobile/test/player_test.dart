import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:resonia/api.dart';
import 'package:resonia/icons.dart';
import 'package:resonia/app_scope.dart';
import 'package:resonia/l10n/app_localizations.dart';
import 'package:resonia/player/player.dart';
import 'package:resonia/player/player_ui.dart';
import 'package:resonia/session.dart';
import 'package:resonia/widgets.dart';

import 'fake_engine.dart';

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

/// Tant qu'il n'est pas terminé, le serveur ne répond pas aux /rest/stream (réseau lent).
Completer<void>? hold;

Future<HttpServer> fakeServer() async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  requests.clear();
  hold = null;
  server.listen((req) async {
    requests.add(req.uri);
    if (req.uri.path.endsWith('/stream')) await hold?.future;
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

late FakeEngine engine;

PlayerController newController([FakeEngine? e]) {
  final c = PlayerController(
    engine: e ?? (engine = FakeEngine()),
    stateDir: () async => Directory('${tmp.path}/state'),
    cacheDir: () async => Directory('${tmp.path}/cache'),
  );
  controllers.add(c);
  return c;
}

Future<void> until(bool Function() cond) async {
  for (var i = 0; i < 200 && !cond(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 25));
  }
  expect(cond(), isTrue);
}

/// Les pochettes se chargent en temps réel : on attend la fin des requêtes avant de fermer le serveur.
Future<void> settleNetwork(
  WidgetTester tester,
  PlayerController c,
) => tester.runAsync(() async {
  await c
      .detach(); // arrête les téléchargements de préchargement encore en cours
  await Future<void>.delayed(const Duration(milliseconds: 300));
});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // Le binding de test fait répondre 400 à tout HttpClient : ici, vrai faux serveur local.
  HttpOverrides.global = null;

  setUp(() async {
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
    // Téléchargements arrêtés (un .part reste pour la reprise), le temps de fermer les fichiers.
    for (final c in controllers) {
      c.dispose();
    }
    controllers.clear();
    await Future<void>.delayed(const Duration(milliseconds: 200));
    api.close();
    await server.close(force: true);
    await tmp.delete(recursive: true);
  });

  int streams() => requests.where((u) => u.path.endsWith('/stream')).length;

  test('the engine is given the next tracks once they are cached; wraps on repeat-all', () async {
    final a = newController();
    await a.attach(api);
    await a.playQueue(songs, start: 1);
    await until(() => engine.nextIds.join() == 's2s3s4');
    expect(engine.current?.id, 's1');

    await a.playQueue(songs, start: 4);
    await a.cycleRepeat(); // tout répéter
    await until(() => engine.nextIds.join() == 's5s0s1');
    await a
        .cycleRepeat(); // un titre : la suite du moteur est la piste elle-même
    await until(() => engine.nextIds.join() == 's4');
  });

  test(
    'gapless: the engine advances on its own and the controller follows',
    () async {
      final a = newController();
      await a.attach(api);
      await a.playQueue(songs, start: 0);
      await until(() => engine.nextIds.join() == 's1s2s3');
      final starts = engine.starts.length;

      engine.advance();
      await until(() => a.current?.id == 's1');
      expect(a.position, lessThan(const Duration(seconds: 1)));
      await until(
        () => engine.nextIds.join() == 's2s3s4',
      ); // la suite se complète
      expect(
        engine.starts.length,
        starts,
      ); // jamais de start() : le moteur n'a pas été relancé
    },
  );

  test(
    'a track plays from the cache: tapping it again downloads nothing',
    () async {
      final a = newController();
      await a.attach(api);
      await a.playQueue(songs, start: 2);
      await until(() => engine.current?.id == 's2' && !a.loading);
      await until(() => streams() == 4); // s2 + 3 suivantes
      await a.playQueue(songs, start: 3);
      await until(() => engine.current?.id == 's3');
      await Future<void>.delayed(const Duration(milliseconds: 200));
      expect(
        requests.where((u) => u.queryParameters['id'] == 's3'),
        hasLength(1),
      );
    },
  );

  test('slow network: loading shows at once, the sound waits for the file, a pause is respected', () async {
    hold = Completer<void>();
    final a = newController();
    await a.attach(api);
    final play = a.playQueue(songs, start: 1);
    await play;
    expect(a.current?.id, 's1'); // l'interface a déjà la nouvelle piste
    expect(a.loading, isTrue);
    expect(engine.starts, isEmpty);

    await a.pause(); // pause pendant le chargement
    hold!.complete();
    await until(() => engine.starts.isNotEmpty);
    expect(engine.startPlay.last, isFalse);
    await until(() => !a.loading);
  });

  test('skipping fast: only the last track is started', () async {
    hold = Completer<void>();
    final a = newController();
    await a.attach(api);
    await a.playQueue(songs, start: 0);
    for (var i = 0; i < 4; i++) {
      await a.next();
    }
    expect(a.current?.id, 's4');
    hold!.complete();
    await until(() => engine.starts.isNotEmpty && !a.loading);
    expect(engine.starts.map((s) => s.first), ['s4']);
    // Les pistes abandonnées en route n'ont pas été téléchargées jusqu'au bout pour rien.
    expect(
      requests.where((u) => u.queryParameters['id'] == 's1'),
      hasLength(1),
    );
  });

  test(
    'previous is always available: on the first track it restarts the track',
    () async {
      final a = newController();
      await a.attach(api);
      await a.playQueue(songs, start: 0);
      await until(() => !a.loading);
      await a.previous();
      expect(a.current?.id, 's0');
      expect(engine.seeks.last, Duration.zero);
      await a.next();
      await until(() => a.current?.id == 's1' && !a.loading);
      await a.previous(); // < 3 s : piste d'avant
      await until(() => a.current?.id == 's0');
    },
  );

  test('force-quit: the next launch resumes the same track, position, queue and shuffle order', () async {
    final a = newController();
    await a.attach(api);
    await a.playQueue(songs, start: 2);
    await until(() => !a.loading);
    await a.seek(const Duration(seconds: 42, milliseconds: 500));
    await a.toggleShuffle();
    await a
        .pause(); // position figée : elle doit revenir à la milliseconde près
    final order = List.of(a.playOrder);
    // Pas de dispose() : l'app est tuée, seuls les fichiers déjà écrits comptent.

    final b = newController();
    await b.attach(api);
    expect(b.queue.map((s) => s.id), songs.map((s) => s.id));
    expect(b.current?.id, 's2');
    expect(b.position, const Duration(seconds: 42, milliseconds: 500));
    expect(b.shuffle, isTrue);
    expect(b.playOrder, order);
    expect(b.playing, isFalse); // reprise en pause, jamais de son au lancement
    expect(engine.starts, isEmpty);

    await b.togglePlay(); // le son part là où on s'était arrêté
    await until(() => engine.current?.id == 's2');
    expect(engine.position, const Duration(seconds: 42, milliseconds: 500));
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

  test('pitch is applied live (no reload), couples speed and pitch, Master Tempo keeps the pitch, settings persist', () async {
    final a = newController();
    await a.attach(api);
    await a.playQueue(songs);
    await until(() => !a.loading);
    final starts = engine.starts.length;

    a.setPitch(2.54);
    expect(a.pitch, 2.5);
    await until(() => engine.speed == 1.025 && engine.coupled);

    a.toggleMasterTempo();
    await until(() => engine.speed == 1.025 && !engine.coupled);

    a.setPitch(30); // borné à la plage (±8 par défaut)
    expect(a.pitch, 8);
    a.setPitchRange(4);
    expect(a.pitch, 4);
    await until(() => engine.speed == 1.04);
    expect(
      engine.starts.length,
      starts,
    ); // le moteur n'a jamais été rechargé : aucune coupure

    await Future<void>.delayed(
      const Duration(milliseconds: 600),
    ); // écriture différée
    final b = newController();
    await b.attach(api);
    expect((b.pitch, b.pitchRange, b.masterTempo), (4.0, 4, true));
    await until(() => engine.speed == 1.04); // réappliqué au lancement
  });

  test('the position follows the rate', () async {
    final a = newController();
    await a.attach(api);
    await a.playQueue(songs);
    await until(() => !a.loading);
    a.setPitch(8);
    final p0 = a.position;
    await Future<void>.delayed(const Duration(milliseconds: 500));
    final moved = (a.position - p0).inMilliseconds;
    expect(moved, inInclusiveRange(480, 620)); // 500 ms × 1,08
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
        await c.pause(); // pas de minuterie de position : l'écran se stabilise
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
        for (var i = 0; i < 8; i++) {
          await tester.pump(
            const Duration(milliseconds: 100),
          ); // sortie / entrée de la pochette
        }
        // Le fichier se télécharge en temps réel ; la barre de chargement s'anime tant que ça dure.
        await tester.runAsync(() async {
          for (var i = 0; i < 80 && c.loading; i++) {
            await Future<void>.delayed(const Duration(milliseconds: 25));
          }
          // « Suivant » lance la lecture ; en pause, plus de minuterie de position : l'écran se stabilise.
          await c.pause();
        });
        await tester.pumpAndSettle();
      }

      await swipe(const Offset(-300, 0));
      expect(c.current?.id, 's2');
      await swipe(const Offset(300, 0));
      expect(c.current?.id, 's1');
      await swipe(const Offset(0, 300));
      expect(find.byType(NowPlayingPage), findsNothing);
      await settleNetwork(tester, c);
      await tester.pump(
        const Duration(seconds: 10),
      ); // purge les minuteries de la zone simulée
    },
  );

  testWidgets(
    'now playing layout matches the iPhone 16 mock-up (393 x 852 pt)',
    (tester) async {
      tester.view.physicalSize = const Size(1179, 2556);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final c = newController();
      await tester.runAsync(() async {
        await c.attach(api);
        await c.playQueue(songs, start: 1);
        await c.pause();
      });
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          builder: (context, child) =>
              AppScope(api: api, player: c, child: child!),
          home: const NowPlayingPage(),
        ),
      );
      await tester.pumpAndSettle();
      final cover = tester.getRect(find.byType(Cover));
      expect(cover.left, 24);
      expect(cover.width, 345);
      expect(cover.height, 345);
      final play = tester.getCenter(find.byType(PlayButton));
      expect(play.dx, closeTo(196.5, 0.5));
      expect(tester.getSize(find.byType(PlayButton)).width, 64);
      // Précédent actif dès le premier titre, à 112 pt de la gauche.
      final prev = tester.widget<IconButton>(
        find.widgetWithIcon(IconButton, AppIcons.skipPrevious),
      );
      expect(prev.onPressed, isNotNull);
      expect(
        tester
            .getCenter(find.widgetWithIcon(IconButton, AppIcons.skipPrevious))
            .dx,
        closeTo(112, 0.5),
      );
      await settleNetwork(tester, c);
      await tester.pump(
        const Duration(seconds: 10),
      ); // purge les minuteries de la zone simulée
    },
  );

  test('start time: measured from the tap until the track plays', () async {
    final a = newController();
    await a.attach(api);
    expect(a.startElapsed, isNull);
    await a.playQueue(songs, start: 2);
    await until(() => !a.measuringStart);
    expect(a.startLatency, isNotNull);
    expect(a.startElapsed, a.startLatency);
  });

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
        expect(
          a.playOrder.first,
          songs.indexWhere((s) => s.id == a.current!.id),
        );
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
      await until(() => !a.loading);
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
