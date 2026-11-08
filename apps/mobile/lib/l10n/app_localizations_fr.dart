// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get navHome => 'Accueil';

  @override
  String get navSearch => 'Rechercher';

  @override
  String get navLibrary => 'Bibliothèque';

  @override
  String get searchPlaceholder => 'Rechercher titres, artistes, albums...';

  @override
  String get loginTitle => 'Connexion';

  @override
  String get loginServerUrl => 'Adresse du serveur';

  @override
  String get loginServerUrlPlaceholder => 'https://musique.exemple.com';

  @override
  String get loginUsername => 'Nom d\'utilisateur';

  @override
  String get loginPassword => 'Mot de passe';

  @override
  String get loginSubmit => 'Se connecter';

  @override
  String get loginSubmitting => 'Connexion...';

  @override
  String get loginErrorInvalidUrl =>
      'Cette adresse de serveur n\'est pas valide.';

  @override
  String get loginErrorInsecureHttp =>
      'http:// ne fonctionne qu\'avec les adresses de votre réseau local. Utilisez https://.';

  @override
  String get loginErrorUnreachable =>
      'Impossible de joindre le serveur. Vérifiez l\'adresse et votre connexion.';

  @override
  String get loginErrorNotNavidrome =>
      'Cette adresse ne semble pas être un serveur Navidrome.';

  @override
  String get loginErrorCredentials =>
      'Nom d\'utilisateur ou mot de passe incorrect.';

  @override
  String get loginErrorGeneric => 'Une erreur inconnue est survenue.';

  @override
  String get accountMenu => 'Compte';

  @override
  String get accountLogout => 'Se déconnecter';

  @override
  String homeGreetingMorning(String username) {
    return 'Bonjour, $username';
  }

  @override
  String homeGreetingAfternoon(String username) {
    return 'Bon après-midi, $username';
  }

  @override
  String homeGreetingEvening(String username) {
    return 'Bonsoir, $username';
  }

  @override
  String get homeResumeListening => 'Reprendre l\'écoute';

  @override
  String get homeQuickAccess => 'Accès rapide';

  @override
  String get homeYourPlaylists => 'Tes playlists';

  @override
  String get homeMostPlayedAlbums => 'Albums les plus joués';

  @override
  String get homeRecentlyPlayed => 'Écoutés récemment';

  @override
  String get homeNewReleases => 'Nouveautés';

  @override
  String get homeDiscover => 'Découvrir';

  @override
  String get homeNoAlbums => 'Aucun album à afficher pour le moment';

  @override
  String get homeLoadError => 'Impossible de charger ta bibliothèque.';

  @override
  String get retry => 'Réessayer';

  @override
  String trackCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count titres',
      one: '$count titre',
    );
    return '$_temp0';
  }

  @override
  String get back => 'Retour';

  @override
  String get close => 'Fermer';

  @override
  String get play => 'Lecture';

  @override
  String get pause => 'Pause';

  @override
  String get next => 'Suivant';

  @override
  String get previous => 'Précédent';

  @override
  String get shufflePlay => 'Lecture aléatoire';

  @override
  String get repeatOff => 'Répétition désactivée';

  @override
  String get repeatAll => 'Répéter tout';

  @override
  String get repeatOne => 'Répéter le titre';

  @override
  String get playbackPosition => 'Position de lecture';

  @override
  String get albumLabel => 'Album';

  @override
  String get albumNotFound => 'Album introuvable';

  @override
  String albumDurationHoursMinutes(int hours, int minutes) {
    return '$hours h $minutes min';
  }

  @override
  String albumDurationMinutes(int minutes) {
    return '$minutes min';
  }

  @override
  String get pitchTitle => 'Pitch';

  @override
  String get pitchRange => 'Plage';

  @override
  String get pitchReset => 'Réinitialiser (1x)';

  @override
  String get pitchMasterTempo => 'Master Tempo';

  @override
  String get pitchMasterTempoHint => 'Garde la hauteur quand la vitesse change';

  @override
  String get pitchHint => 'Vitesse ± hauteur, comme sur une platine';
}
