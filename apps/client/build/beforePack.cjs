// Hook electron-builder (voir `beforePack` dans electron-builder.yml), exécuté avant
// l'empaquetage de chaque architecture.
//
// electron-builder n'empaquette que ce qui est déjà dans dist-electron/ : lancé seul (ou après
// un `pnpm build`, qui ne produit QUE le build web dans dist/), il embarquait silencieusement un
// renderer périmé — l'app de bureau ne correspondait alors plus à ce que montre `pnpm dev`.
// On recompile donc via electron-vite si une source est plus récente que la sortie. Une seule
// fois par process : le hook est rappelé pour chaque arch, le module reste en cache.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

let checked = false;

const IGNORED_DIRS = new Set(["node_modules", "dist", ".turbo", ".git"]);

function newestMtime(target) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name) || entry.name === ".DS_Store") continue;
    newest = Math.max(newest, newestMtime(path.join(target, entry.name)));
  }
  return newest;
}

function outputMtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

exports.default = async function beforePack(context) {
  if (checked) return;
  checked = true;

  const projectDir = context.packager.info.projectDir;
  const sources = [
    "src",
    "electron",
    "public",
    "index.html",
    "electron.vite.config.ts",
    "package.json",
    "../../packages",
    "../../package.json",
  ].map((p) => path.join(projectDir, p));
  const outputs = [
    "dist-electron/main/index.js",
    "dist-electron/preload/index.cjs",
    "dist-electron/renderer/index.html",
  ].map((p) => path.join(projectDir, p));

  const newestSource = Math.max(...sources.map(newestMtime));
  const oldestOutput = Math.min(...outputs.map(outputMtime));
  if (oldestOutput > newestSource) return;

  console.log("  • dist-electron/ absent ou périmé — recompilation via electron-vite build");
  execFileSync("pnpm", ["exec", "electron-vite", "build"], {
    cwd: projectDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
};
