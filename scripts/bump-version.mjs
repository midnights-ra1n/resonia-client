#!/usr/bin/env node
// Raccourci pour bumper la version avant une release manuelle (voir README des workflows) :
// écrit package.json (racine) — c'est le fichier que les workflows lisent pour décider s'il
// faut publier — ET apps/client/package.json (lu par `app.getVersion()` sous Electron et par
// electron-builder à l'empaquetage), pour que les deux ne divergent jamais en local. Le CI les
// re-synchronise de toute façon avant chaque release (scripts/set-version.mjs).
//
// Usage : pnpm bump 1.0.0-beta.3   (ou node scripts/bump-version.mjs 1.0.0-beta.3)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-beta\.\d+)?$/.test(version)) {
  console.error("Usage: pnpm bump <version>  (ex: 1.0.0 ou 1.0.0-beta.3)");
  process.exit(1);
}

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const packageJsonPath = path.join(root, "package.json");
const clientPackageJsonPath = path.join(root, "apps/client/package.json");

const json = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const previous = json.version;
json.version = version;
writeFileSync(packageJsonPath, JSON.stringify(json, null, 2) + "\n");

const clientJson = JSON.parse(readFileSync(clientPackageJsonPath, "utf8"));
clientJson.version = version;
writeFileSync(clientPackageJsonPath, JSON.stringify(clientJson, null, 2) + "\n");

console.log(`Version : ${previous} → ${version}`);
console.log(`\nProchaines étapes :\n  git add package.json apps/client/package.json\n  git commit -m "bump version to ${version}"\n  git push origin <beta|stable>`);
