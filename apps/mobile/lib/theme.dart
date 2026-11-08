import 'package:flutter/material.dart';

/// Jetons du thème « resonia-orange » du web (apps/client/src/index.css).
abstract final class AppColors {
  static const bgSunken = Color(0xFF000000);
  static const bgBase = Color(0xFF0C0B0A);
  static const surface1 = Color(0xFF161412);
  static const surface2 = Color(0xFF1E1B18);
  static const surface3 = Color(0xFF272320);
  static const borderStrong = Color(0xFF413A33);
  static const text1 = Color(0xFFF4EFE8);
  static const text2 = Color(0xFFA9A29A);
  static const text3 = Color(0xFF8A8279);
  static const accent = Color(0xFFFFA343);
  static const accentPressed = Color(0xFFE0821F);
  static const onAccent = Color(0xFF1A0F03);
  static const danger = Color(0xFFE5675A);
}

// Geist est variable : fontWeight seul ne pilote pas l'axe wght, il faut aussi fontVariations.
TextStyle? _weighted(TextStyle? s) => s?.copyWith(
  fontVariations: [FontVariation.weight((s.fontWeight ?? FontWeight.w400).value.toDouble())],
);

ThemeData buildTheme() {
  final base = ThemeData(
    brightness: Brightness.dark,
    fontFamily: 'Geist',
    scaffoldBackgroundColor: AppColors.bgSunken,
    colorScheme: const ColorScheme.dark(
      primary: AppColors.accent,
      onPrimary: AppColors.onAccent,
      surface: AppColors.bgBase,
      onSurface: AppColors.text1,
      error: AppColors.danger,
    ),
    splashFactory: NoSplash.splashFactory,
    highlightColor: Colors.transparent,
  );
  final t = base.textTheme.apply(bodyColor: AppColors.text1, displayColor: AppColors.text1);
  return base.copyWith(
    textTheme: t.copyWith(
      headlineSmall: _weighted(t.headlineSmall?.copyWith(fontSize: 26, fontWeight: FontWeight.w800)),
      headlineMedium: _weighted(t.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
      titleMedium: _weighted(t.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
      bodyMedium: _weighted(t.bodyMedium),
      labelSmall: _weighted(t.labelSmall?.copyWith(fontWeight: FontWeight.w500)),
    ),
  );
}
