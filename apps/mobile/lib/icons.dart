import 'package:flutter/widgets.dart';

/// Material Symbols Rounded (Google), comme le pack par défaut du web.
///
/// assets/fonts/MaterialSymbolsRounded.ttf ne contient QUE les glyphes listés ici, avec l'axe FILL
/// conservé (`Icon(..., fill: 1)` = variante pleine du même glyphe, pour l'état actif).
/// Pour ajouter une icône : copier son codepoint depuis fonts.google.com/icons (« Code point »),
/// ajouter une ligne ci-dessous, puis lancer `python3 tool/subset_icons.py`.
abstract final class AppIcons {
  static const _f = 'MaterialSymbolsRounded';

  static const home = IconData(0xe9b2, fontFamily: _f);
  static const search = IconData(0xef7a, fontFamily: _f);
  static const libraryMusic = IconData(0xe030, fontFamily: _f);
  static const logout = IconData(0xe9ba, fontFamily: _f, matchTextDirection: true);
  static const musicNote = IconData(0xe405, fontFamily: _f);
  static const queueMusic = IconData(0xe03d, fontFamily: _f, matchTextDirection: true);
}
