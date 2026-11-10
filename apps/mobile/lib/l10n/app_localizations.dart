import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_fr.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('fr'),
  ];

  /// No description provided for @navHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navSearch.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get navSearch;

  /// No description provided for @navLibrary.
  ///
  /// In en, this message translates to:
  /// **'Library'**
  String get navLibrary;

  /// No description provided for @searchPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Search tracks, artists, albums...'**
  String get searchPlaceholder;

  /// No description provided for @loginTitle.
  ///
  /// In en, this message translates to:
  /// **'Log in'**
  String get loginTitle;

  /// No description provided for @loginServerUrl.
  ///
  /// In en, this message translates to:
  /// **'Server address'**
  String get loginServerUrl;

  /// No description provided for @loginServerUrlPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'https://music.example.com'**
  String get loginServerUrlPlaceholder;

  /// No description provided for @loginUsername.
  ///
  /// In en, this message translates to:
  /// **'Username'**
  String get loginUsername;

  /// No description provided for @loginPassword.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get loginPassword;

  /// No description provided for @loginSubmit.
  ///
  /// In en, this message translates to:
  /// **'Log in'**
  String get loginSubmit;

  /// No description provided for @loginSubmitting.
  ///
  /// In en, this message translates to:
  /// **'Logging in...'**
  String get loginSubmitting;

  /// No description provided for @loginErrorInvalidUrl.
  ///
  /// In en, this message translates to:
  /// **'This server address isn\'t valid.'**
  String get loginErrorInvalidUrl;

  /// No description provided for @loginErrorInsecureHttp.
  ///
  /// In en, this message translates to:
  /// **'http:// only works for addresses on your local network. Use https:// instead.'**
  String get loginErrorInsecureHttp;

  /// No description provided for @loginErrorUnreachable.
  ///
  /// In en, this message translates to:
  /// **'Can\'t reach the server. Check the address and your connection.'**
  String get loginErrorUnreachable;

  /// No description provided for @loginErrorNotNavidrome.
  ///
  /// In en, this message translates to:
  /// **'This address doesn\'t look like a Navidrome server.'**
  String get loginErrorNotNavidrome;

  /// No description provided for @loginErrorCredentials.
  ///
  /// In en, this message translates to:
  /// **'Wrong username or password.'**
  String get loginErrorCredentials;

  /// No description provided for @loginErrorGeneric.
  ///
  /// In en, this message translates to:
  /// **'An unknown error occurred.'**
  String get loginErrorGeneric;

  /// No description provided for @accountMenu.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get accountMenu;

  /// No description provided for @accountLogout.
  ///
  /// In en, this message translates to:
  /// **'Log out'**
  String get accountLogout;

  /// No description provided for @homeGreetingMorning.
  ///
  /// In en, this message translates to:
  /// **'Good morning, {username}'**
  String homeGreetingMorning(String username);

  /// No description provided for @homeGreetingAfternoon.
  ///
  /// In en, this message translates to:
  /// **'Good afternoon, {username}'**
  String homeGreetingAfternoon(String username);

  /// No description provided for @homeGreetingEvening.
  ///
  /// In en, this message translates to:
  /// **'Good evening, {username}'**
  String homeGreetingEvening(String username);

  /// No description provided for @homeResumeListening.
  ///
  /// In en, this message translates to:
  /// **'Pick up where you left off'**
  String get homeResumeListening;

  /// No description provided for @homeQuickAccess.
  ///
  /// In en, this message translates to:
  /// **'Quick access'**
  String get homeQuickAccess;

  /// No description provided for @homeYourPlaylists.
  ///
  /// In en, this message translates to:
  /// **'Your playlists'**
  String get homeYourPlaylists;

  /// No description provided for @homeMostPlayedAlbums.
  ///
  /// In en, this message translates to:
  /// **'Most played albums'**
  String get homeMostPlayedAlbums;

  /// No description provided for @homeRecentlyPlayed.
  ///
  /// In en, this message translates to:
  /// **'Recently played'**
  String get homeRecentlyPlayed;

  /// No description provided for @homeNewReleases.
  ///
  /// In en, this message translates to:
  /// **'New releases'**
  String get homeNewReleases;

  /// No description provided for @homeDiscover.
  ///
  /// In en, this message translates to:
  /// **'Discover'**
  String get homeDiscover;

  /// No description provided for @homeNoAlbums.
  ///
  /// In en, this message translates to:
  /// **'No albums to show yet'**
  String get homeNoAlbums;

  /// No description provided for @homeLoadError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load your library.'**
  String get homeLoadError;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @trackCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 song} other{{count} songs}}'**
  String trackCount(int count);

  /// No description provided for @back.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get back;

  /// No description provided for @close.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get close;

  /// No description provided for @play.
  ///
  /// In en, this message translates to:
  /// **'Play'**
  String get play;

  /// No description provided for @pause.
  ///
  /// In en, this message translates to:
  /// **'Pause'**
  String get pause;

  /// No description provided for @next.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get next;

  /// No description provided for @previous.
  ///
  /// In en, this message translates to:
  /// **'Previous'**
  String get previous;

  /// No description provided for @shufflePlay.
  ///
  /// In en, this message translates to:
  /// **'Shuffle play'**
  String get shufflePlay;

  /// No description provided for @repeatOff.
  ///
  /// In en, this message translates to:
  /// **'Repeat off'**
  String get repeatOff;

  /// No description provided for @repeatAll.
  ///
  /// In en, this message translates to:
  /// **'Repeat all'**
  String get repeatAll;

  /// No description provided for @repeatOne.
  ///
  /// In en, this message translates to:
  /// **'Repeat one'**
  String get repeatOne;

  /// No description provided for @playbackPosition.
  ///
  /// In en, this message translates to:
  /// **'Playback position'**
  String get playbackPosition;

  /// No description provided for @albumLabel.
  ///
  /// In en, this message translates to:
  /// **'Album'**
  String get albumLabel;

  /// No description provided for @albumNotFound.
  ///
  /// In en, this message translates to:
  /// **'Album not found'**
  String get albumNotFound;

  /// No description provided for @albumDurationHoursMinutes.
  ///
  /// In en, this message translates to:
  /// **'{hours} hr {minutes} min'**
  String albumDurationHoursMinutes(int hours, int minutes);

  /// No description provided for @albumDurationMinutes.
  ///
  /// In en, this message translates to:
  /// **'{minutes} min'**
  String albumDurationMinutes(int minutes);

  /// No description provided for @pitchTitle.
  ///
  /// In en, this message translates to:
  /// **'Pitch'**
  String get pitchTitle;

  /// No description provided for @pitchRange.
  ///
  /// In en, this message translates to:
  /// **'Range'**
  String get pitchRange;

  /// No description provided for @pitchReset.
  ///
  /// In en, this message translates to:
  /// **'Reset (1x)'**
  String get pitchReset;

  /// No description provided for @pitchMasterTempo.
  ///
  /// In en, this message translates to:
  /// **'Master Tempo'**
  String get pitchMasterTempo;

  /// No description provided for @pitchMasterTempoHint.
  ///
  /// In en, this message translates to:
  /// **'Keeps the pitch when the speed changes'**
  String get pitchMasterTempoHint;

  /// No description provided for @pitchHint.
  ///
  /// In en, this message translates to:
  /// **'Speed ± pitch, like a turntable'**
  String get pitchHint;

  /// Time between tapping a track or Play and the first sound (stopwatch in the full-screen player).
  ///
  /// In en, this message translates to:
  /// **'Start time'**
  String get startTime;

  /// No description provided for @clearCache.
  ///
  /// In en, this message translates to:
  /// **'Clear music cache'**
  String get clearCache;

  /// No description provided for @clearCacheBody.
  ///
  /// In en, this message translates to:
  /// **'Downloaded songs will be removed from this device. The track playing and the next ones are kept.'**
  String get clearCacheBody;

  /// No description provided for @cacheCleared.
  ///
  /// In en, this message translates to:
  /// **'Cache cleared ({size})'**
  String cacheCleared(String size);

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'fr'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
