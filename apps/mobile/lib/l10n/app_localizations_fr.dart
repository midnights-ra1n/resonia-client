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
}
