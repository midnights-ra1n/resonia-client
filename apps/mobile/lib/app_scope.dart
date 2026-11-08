import 'package:flutter/widgets.dart';

import 'api.dart';
import 'player/player.dart';

/// API du serveur connecté + lecteur, accessibles depuis toute la session (y compris le
/// lecteur plein écran, poussé sur le navigateur racine).
class AppScope extends InheritedNotifier<PlayerController> {
  const AppScope({
    super.key,
    required this.api,
    required PlayerController player,
    required super.child,
  }) : super(notifier: player);

  final SubsonicApi api;
  PlayerController get player => notifier!;

  /// Reconstruit l'appelant à chaque changement du lecteur (piste, lecture, mélange…).
  static AppScope of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppScope>()!;

  /// Sans abonnement : pour l'API et les actions.
  static AppScope read(BuildContext context) =>
      context.getInheritedWidgetOfExactType<AppScope>()!;

  @override
  bool updateShouldNotify(AppScope oldWidget) =>
      oldWidget.api != api || super.updateShouldNotify(oldWidget);
}
