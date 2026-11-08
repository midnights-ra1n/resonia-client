// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get navHome => 'Home';

  @override
  String get navSearch => 'Search';

  @override
  String get navLibrary => 'Library';

  @override
  String get searchPlaceholder => 'Search tracks, artists, albums...';

  @override
  String get loginTitle => 'Log in';

  @override
  String get loginServerUrl => 'Server address';

  @override
  String get loginServerUrlPlaceholder => 'https://music.example.com';

  @override
  String get loginUsername => 'Username';

  @override
  String get loginPassword => 'Password';

  @override
  String get loginSubmit => 'Log in';

  @override
  String get loginSubmitting => 'Logging in...';

  @override
  String get loginErrorInvalidUrl => 'This server address isn\'t valid.';

  @override
  String get loginErrorInsecureHttp =>
      'http:// only works for addresses on your local network. Use https:// instead.';

  @override
  String get loginErrorUnreachable =>
      'Can\'t reach the server. Check the address and your connection.';

  @override
  String get loginErrorNotNavidrome =>
      'This address doesn\'t look like a Navidrome server.';

  @override
  String get loginErrorCredentials => 'Wrong username or password.';

  @override
  String get loginErrorGeneric => 'An unknown error occurred.';

  @override
  String get accountMenu => 'Account';

  @override
  String get accountLogout => 'Log out';

  @override
  String homeGreetingMorning(String username) {
    return 'Good morning, $username';
  }

  @override
  String homeGreetingAfternoon(String username) {
    return 'Good afternoon, $username';
  }

  @override
  String homeGreetingEvening(String username) {
    return 'Good evening, $username';
  }

  @override
  String get homeResumeListening => 'Pick up where you left off';

  @override
  String get homeQuickAccess => 'Quick access';

  @override
  String get homeYourPlaylists => 'Your playlists';

  @override
  String get homeMostPlayedAlbums => 'Most played albums';

  @override
  String get homeRecentlyPlayed => 'Recently played';

  @override
  String get homeNewReleases => 'New releases';

  @override
  String get homeDiscover => 'Discover';

  @override
  String get homeNoAlbums => 'No albums to show yet';

  @override
  String get homeLoadError => 'Couldn\'t load your library.';

  @override
  String get retry => 'Retry';

  @override
  String trackCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count songs',
      one: '1 song',
    );
    return '$_temp0';
  }
}
