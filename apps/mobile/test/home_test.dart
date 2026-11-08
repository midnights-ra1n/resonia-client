import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:just_audio/just_audio.dart';
import 'package:just_audio_platform_interface/just_audio_platform_interface.dart';
import 'package:resonia/api.dart';
import 'package:resonia/app_scope.dart';
import 'package:resonia/home_page.dart';
import 'package:resonia/l10n/app_localizations.dart';
import 'package:resonia/player/player.dart';
import 'package:resonia/session.dart';

import 'fake_audio_platform.dart';

class FakeApi extends SubsonicApi {
  FakeApi(this.lists, {this.fail = false})
    : super(
        const Session(
          url: 'https://m.example.com',
          username: 'noe',
          salt: 's',
          token: 't',
        ),
      );

  final Map<AlbumListType, List<Album>> lists;
  final bool fail;

  @override
  Future<List<Album>> albumList(AlbumListType type, {int size = 20}) async =>
      fail ? throw const ApiException(ApiError.unreachable) : lists[type] ?? [];

  @override
  Future<List<Playlist>> playlists() async => fail
      ? throw const ApiException(ApiError.unreachable)
      : [const Playlist(id: 'p1', name: 'Road trip', songCount: 12)];

  @override
  Future<Uint8List> bytes(String url) async =>
      throw const ApiException(ApiError.unreachable);
}

Album album(String id) =>
    Album(id: id, name: 'Album $id', artist: 'Artist $id');

Future<void> pumpHome(WidgetTester tester, SubsonicApi api) async {
  tester.view.physicalSize = const Size(
    1170,
    4000,
  ); // grand écran : toutes les sections visibles
  addTearDown(tester.view.reset);
  JustAudioPlatform.instance = FakeJustAudio();
  final player = PlayerController(player: AudioPlayer());
  addTearDown(player.dispose);
  await tester.pumpWidget(
    MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: AppScope(
        api: api,
        player: player,
        child: Scaffold(
          body: HomePage(key: UniqueKey(), api: api, leading: const SizedBox()),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('hero is the last played album; quick access skips it', (
    tester,
  ) async {
    await pumpHome(
      tester,
      FakeApi({
        AlbumListType.recent: [album('r1')],
        AlbumListType.frequent: [album('r1'), album('f2')],
        AlbumListType.newest: [album('n1')],
      }),
    );

    expect(find.text('PICK UP WHERE YOU LEFT OFF'), findsOneWidget);
    expect(find.text('Quick access'), findsOneWidget);
    expect(find.text('Your playlists'), findsOneWidget);
    expect(find.text('New releases'), findsOneWidget);
    expect(find.text('Discover'), findsNothing); // liste vide : section masquée
    expect(find.text('12 songs'), findsOneWidget);
    expect(find.text('Play'), findsOneWidget); // pilule du bandeau
    // r1 : bandeau + « Récemment écoutés » + « Les plus joués », mais pas l'accès rapide.
    expect(find.text('Album r1'), findsNWidgets(3));
    // f2 : accès rapide + « Les plus joués ».
    expect(find.text('Album f2'), findsNWidgets(2));
  });

  testWidgets('carousels fit with large accessibility text', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await pumpHome(
      tester,
      FakeApi({
        AlbumListType.newest: [album('n1')],
      }),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('empty library and failures show a message', (tester) async {
    await pumpHome(tester, FakeApi({}));
    expect(
      find.text('No albums to show yet'),
      findsNothing,
    ); // une playlist existe
    await pumpHome(tester, FakeApi({}, fail: true));
    expect(find.text("Couldn't load your library."), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });
}
