#!/usr/bin/env node
// Extrait la section d'une version depuis CHANGELOG.md (racine) et l'imprime sur stdout — utilisé
// par les workflows de release (.github/workflows/release-*.yml) à la place de
// `gh release edit --generate-notes` (qui liste les commits/PR bruts, pas des notes écrites à la
// main). Échoue volontairement (code 1) si la section est absente ou vide : mieux vaut bloquer la
// release que publier des notes vides ou celles d'une version précédente par erreur.
//
// Usage : node scripts/extract-changelog.mjs <version>   (ex: 1.4.0-beta.1)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/extract-changelog.mjs <version>");
  process.exit(1);
}

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const changelogPath = path.join(root, "CHANGELOG.md");

let content;
try {
  content = readFileSync(changelogPath, "utf8");
} catch {
  console.error(`Impossible de lire ${changelogPath}`);
  process.exit(1);
}

const lines = content.split("\n");
// Accepte `## X.Y.Z` et `## [X.Y.Z]` (échappe la version pour l'utiliser dans une regex — un
// suffixe de préversion contient des points, littéraux ici, jamais des caractères spéciaux
// regex par ailleurs vu le format semver).
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const headingPattern = new RegExp(`^##\\s+\\[?${escaped}\\]?\\s*$`);

let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (headingPattern.test(lines[i].trim())) {
    startIndex = i + 1;
    break;
  }
}

if (startIndex === -1) {
  console.error(
    `Aucune section "## ${version}" trouvée dans CHANGELOG.md — ajoute les notes de cette version avant de publier (voir le format documenté en tête du fichier).`,
  );
  process.exit(1);
}

let endIndex = lines.length;
for (let i = startIndex; i < lines.length; i++) {
  if (/^##\s+/.test(lines[i])) {
    endIndex = i;
    break;
  }
}

const section = lines.slice(startIndex, endIndex).join("\n").trim();

if (!section) {
  console.error(
    `La section "## ${version}" de CHANGELOG.md est vide — ajoute au moins une ligne de notes avant de publier.`,
  );
  process.exit(1);
}

process.stdout.write(section + "\n");
