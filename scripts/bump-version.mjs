#!/usr/bin/env node
// Raccourci pour bumper la version avant une release manuelle (voir README des workflows) :
// écrit uniquement package.json (racine) — c'est le seul fichier que les workflows lisent pour
// décider s'il faut publier. tauri.conf.json / Cargo.toml sont eux synchronisés par le CI
// (scripts/set-version.mjs), pas besoin de le faire en local.
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

const json = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const previous = json.version;
json.version = version;
writeFileSync(packageJsonPath, JSON.stringify(json, null, 2) + "\n");

console.log(`Version : ${previous} → ${version}`);
console.log(`\nProchaines étapes :\n  git add package.json\n  git commit -m "bump version to ${version}"\n  git push origin <beta|stable>`);
