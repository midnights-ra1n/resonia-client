#!/usr/bin/env node
// Bloc « liens de téléchargement » du README, entre les marqueurs downloads:start/end.
//
// Les liens pointent directement vers les fichiers de la release vX.Y.Z (et non vers
// /releases/latest/download/…) : GitHub exclut les préversions de /releases/latest, et marquer
// une beta « latest » la ferait proposer aux utilisateurs du canal stable par electron-updater.
// Le bloc est donc régénéré à chaque `pnpm bump` (scripts/bump-version.mjs), jamais à la main.
//
// Usage :
//   node scripts/readme-downloads.mjs update <version>   réécrit le bloc du README
//   node scripts/readme-downloads.mjs check <dossier>     vérifie que chaque fichier lié au
//                                                         README existe dans <dossier> (CI)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO = "midnights-ra1n/resonia-client";
const START = "<!-- downloads:start -->";
const END = "<!-- downloads:end -->";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const readmePath = path.join(root, "README.md");

// Noms produits par electron-builder (voir apps/client/electron-builder.yml) : chaque cible
// Linux a sa propre convention d'architecture (deb : amd64, rpm : x86_64/aarch64…).
function downloads(version) {
  return [
    {
      os: "macOS",
      files: [
        ["Apple Silicon (.dmg)", `Resonia-${version}-arm64.dmg`],
        ["Apple Silicon (.pkg)", `Resonia-${version}-arm64.pkg`],
      ],
    },
    {
      os: "Windows",
      files: [["x64 / ARM64 (.exe)", `Resonia-Setup-${version}.exe`]],
    },
    {
      os: "Linux",
      files: [
        ["x86_64 (.AppImage)", `Resonia-${version}-x86_64.AppImage`],
        ["ARM64 (.AppImage)", `Resonia-${version}-arm64.AppImage`],
        ["x86_64 (.deb)", `Resonia-${version}-amd64.deb`],
        ["ARM64 (.deb)", `Resonia-${version}-arm64.deb`],
        ["x86_64 (.rpm)", `Resonia-${version}-x86_64.rpm`],
        ["ARM64 (.rpm)", `Resonia-${version}-aarch64.rpm`],
      ],
    },
  ];
}

function renderBlock(version) {
  const base = `https://github.com/${REPO}/releases/download/v${version}`;
  const rows = downloads(version).map(
    ({ os, files }) => `| ${os} | ${files.map(([label, file]) => `[${label}](${base}/${file})`).join("<br>")} |`,
  );
  return [
    START,
    `Latest version: **[v${version}](https://github.com/${REPO}/releases/tag/v${version})**`,
    "",
    "| OS | Download |",
    "| --- | --- |",
    ...rows,
    END,
  ].join("\n");
}

function blockRange(readme) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README.md : marqueurs ${START} / ${END} introuvables.`);
  }
  return [start, end + END.length];
}

export function updateReadmeDownloads(version) {
  const readme = readFileSync(readmePath, "utf8");
  const [start, end] = blockRange(readme);
  writeFileSync(readmePath, readme.slice(0, start) + renderBlock(version) + readme.slice(end));
}

function checkReadmeDownloads(dir) {
  const readme = readFileSync(readmePath, "utf8");
  const [start, end] = blockRange(readme);
  const links = [...readme.slice(start, end).matchAll(/\/releases\/download\/v([^/]+)\/([^)\s]+)\)/g)];
  if (links.length === 0) throw new Error("README.md : aucun lien de téléchargement dans le bloc.");

  const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  let ok = true;
  for (const [, linkVersion, file] of links) {
    if (linkVersion !== version) {
      console.error(`::error::README.md lie la v${linkVersion} au lieu de la v${version} : lance 'pnpm bump ${version}'.`);
      ok = false;
    } else if (!existsSync(path.join(dir, file))) {
      console.error(`::error::README.md lie ${file}, absent des fichiers construits.`);
      ok = false;
    }
  }
  return ok;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2);
  if (command === "update" && arg) {
    updateReadmeDownloads(arg);
    console.log(`README.md : liens de téléchargement mis à jour pour v${arg}.`);
  } else if (command === "check" && arg) {
    process.exit(checkReadmeDownloads(arg) ? 0 : 1);
  } else {
    console.error("Usage: node scripts/readme-downloads.mjs update <version> | check <dossier>");
    process.exit(1);
  }
}
