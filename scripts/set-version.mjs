#!/usr/bin/env node
// Synchronise la version applicative dans les 3 endroits qui doivent rester alignés :
// package.json (racine), tauri.conf.json et Cargo.toml. Appelé par les workflows de release
// (stable et beta) à partir du tag git poussé, pour ne jamais avoir à bump ces fichiers à la main.
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
const tauriConfPath = path.join(root, "apps/client/src-tauri/tauri.conf.json");
const cargoTomlPath = path.join(root, "apps/client/src-tauri/Cargo.toml");

function setJsonVersion(filePath) {
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  json.version = version;
  writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n");
}

function setCargoVersion(filePath) {
  const content = readFileSync(filePath, "utf8");
  const updated = content.replace(/^version = ".*"$/m, `version = "${version}"`);
  writeFileSync(filePath, updated);
}

setJsonVersion(rootPackageJsonPath);
setJsonVersion(tauriConfPath);
setCargoVersion(cargoTomlPath);

console.log(`Version fixée à ${version} dans package.json, tauri.conf.json et Cargo.toml.`);
