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

// Rappel local seulement — le vrai garde-fou est côté CI (scripts/extract-changelog.mjs, appelé
// par .github/workflows/release-*.yml), qui fait échouer la release si cette section manque
// encore au moment du push. Ici on se contente de prévenir tout de suite plutôt que de laisser
// découvrir l'oubli seulement après un run CI complet (build desktop des 4 plateformes).
const changelogPath = path.join(root, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");
const hasSection = new RegExp(`^##\\s+\\[?${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]?\\s*$`, "m").test(
  changelog,
);
if (!hasSection) {
  console.warn(
    `\n⚠️  CHANGELOG.md n'a pas encore de section "## ${version}" — la release échouera en CI tant qu'elle n'est pas ajoutée.`,
  );
}

console.log(`\nProchaines étapes :\n  git add package.json apps/client/package.json CHANGELOG.md\n  git commit -m "bump version to ${version}"\n  git push origin <beta|stable>`);
