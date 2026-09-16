#!/usr/bin/env node
// Synchronise la version applicative dans les 2 endroits qui doivent rester alignés :
// package.json (racine) et apps/client/package.json (lu par `app.getVersion()` sous Electron,
// et par electron-builder à l'empaquetage). Appelé par les workflows de release (stable et
// beta) à partir du tag git poussé, pour ne jamais avoir à bump ces fichiers à la main.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/set-version.mjs <version>  (ex: 1.4.0 ou 1.4.0-beta.1)");
  process.exit(1);
}

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const rootPackageJsonPath = path.join(root, "package.json");
const clientPackageJsonPath = path.join(root, "apps/client/package.json");

function setJsonVersion(filePath) {
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  json.version = version;
  writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n");
}

setJsonVersion(rootPackageJsonPath);
setJsonVersion(clientPackageJsonPath);

console.log(`Version fixée à ${version} dans package.json (racine) et apps/client/package.json.`);
