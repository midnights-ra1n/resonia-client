#!/usr/bin/env bash
# Régénère apps/client/build/icon.icns — l'icône des macOS ANTÉRIEURS à Tahoe — à partir de
# l'icône Icon Composer apps/client/build/Resonia.icon (source unique de l'icône macOS).
#
# Pourquoi : macOS 26 Tahoe et suivants lisent l'icône « Liquid Glass » compilée par actool dans
# Assets.car (electron-builder s'en charge seul, voir `mac.icon` dans electron-builder.yml). Les
# versions antérieures lisent un .icns — mais celui qu'actool produit au passage ne contient que
# les tailles 16 et 128 px : Finder, Dock agrandi et fenêtre du .dmg affichaient une icône floue.
# Ce script exporte le rendu macOS à CHACUNE des 10 tailles officielles d'un iconset (rendu
# natif à chaque taille, jamais un agrandissement), puis l'assemble avec iconutil. Le hook
# electron-builder build/afterPack.cjs l'installe ensuite dans l'app empaquetée.
#
# À relancer uniquement quand Resonia.icon change (requiert Xcode 26+ : Icon Composer/ictool),
# puis versionner le .icns produit — le CI n'a pas besoin d'Icon Composer.
#
# Usage : scripts/build-mac-icns.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ICON="$ROOT/apps/client/build/Resonia.icon"
OUT="$ROOT/apps/client/build/icon.icns"
ICTOOL="$(xcode-select -p)/../Applications/Icon Composer.app/Contents/Executables/ictool"

if [[ ! -x "$ICTOOL" ]]; then
  echo "ictool introuvable ($ICTOOL) : Xcode 26 ou plus récent est requis." >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
ICONSET="$WORK/icon.iconset"
mkdir -p "$ICONSET"

# Grille d'icônes macOS (Big Sur et suivants) : carré de 824 px centré dans une toile de 1024 px
# (marge transparente de 100 px). ictool rend la forme bord à bord : on la rend donc à 824/1024
# de la taille cible, nativement, puis on la centre dans la toile — sans quoi l'icône paraîtrait
# plus grosse que toutes les autres dans le Dock et le Finder.
PAD="$ROOT/scripts/pad-png.swift"
for size in 16 32 128 256 512; do
  for scale in 1 2; do
    suffix=$([[ $scale == 2 ]] && echo "@2x" || echo "")
    px=$((size * scale))
    content=$(( (px * 824 + 512) / 1024 ))
    "$ICTOOL" "$ICON" --export-image --output-file "$WORK/raw.png" \
      --platform macOS --rendition Default --width "$content" --height "$content" --scale 1 >/dev/null
    swift "$PAD" "$WORK/raw.png" "$ICONSET/icon_${size}x${size}${suffix}.png" "$px"
  done
done

iconutil -c icns "$ICONSET" -o "$OUT"
echo "Écrit : $OUT ($(du -h "$OUT" | cut -f1))"
