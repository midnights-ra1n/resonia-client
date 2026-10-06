// Hook electron-builder (voir `afterPack` dans electron-builder.yml), exécuté après
// l'empaquetage de chaque architecture et AVANT la signature et la création des .dmg/.zip/.pkg.
//
// macOS uniquement : remplace l'icon.icns qu'actool génère à partir de build/Resonia.icon
// (seulement 16 et 128 px) par build/icon.icns, complet de 16 à 1024 px et conforme à la grille
// d'icônes macOS (voir scripts/build-mac-icns.sh). Ce .icns est l'icône des macOS ANTÉRIEURS à
// Tahoe ; Tahoe et suivants utilisent Assets.car (Liquid Glass), laissé intact.
const fs = require("node:fs/promises");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const source = path.join(context.packager.info.projectDir, "build", "icon.icns");
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const target = path.join(context.appOutDir, appName, "Contents", "Resources", "icon.icns");

  await fs.copyFile(source, target);
};
