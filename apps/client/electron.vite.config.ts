import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import svgr from "vite-plugin-svgr";

// Même source que vite.config.ts (build web) — gardée synchronisée manuellement, electron-vite
// exige son propre format de config (main/preload/renderer distincts), pas la peine de forcer
// une factorisation artificielle entre les deux pour trois plugins partagés.
const rootPackageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

export default defineConfig({
  main: {
    // `electron-updater` (et ses propres dépendances transitives) exclu de l'externalisation :
    // bundlé directement dans dist-electron/main/index.js plutôt que laissé en `require()`
    // externe — cohérent avec electron-builder.yml, qui n'embarque volontairement PAS
    // node_modules dans le paquet final (voir son commentaire "files").
    plugins: [externalizeDepsPlugin({ exclude: ["electron-updater"] })],
    build: {
      outDir: "dist-electron/main",
      lib: { entry: "electron/main/index.ts" },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist-electron/preload",
      lib: { entry: "electron/preload/index.ts" },
      // CJS explicite plutôt que le `.mjs` par défaut (hérité du "type": "module" de
      // package.json) : un preload sandboxé (`sandbox: true` dans createWindow) charge de façon
      // fiable un script CommonJS sur toutes les versions d'Electron, alors que le support ESM
      // en preload sandboxé reste plus récent/fragile. C'était bien la cause du "app pas
      // reconnue comme desktop" observé en .app packagé (confirmé via le listener
      // "preload-error" ajouté dans electron/main/index.ts).
      rollupOptions: {
        // `external` explicite : fournir son propre `output` remplace celui posé par défaut
        // par electron-vite (qui exclut déjà "electron" + les builtins Node), sans le fusionner
        // — sans cette ligne, rollup avait bundlé le PAQUET NPM "electron" (un simple
        // résolveur de chemin vers le binaire, utilisé par les outils Node) à la place du vrai
        // module "electron" fourni par le runtime à l'exécution, qui tente alors de
        // `require("child_process")` — module absent de l'environnement restreint d'un preload
        // sandboxé, d'où l'échec silencieux de `contextBridge.exposeInMainWorld`.
        external: ["electron"],
        output: {
          format: "cjs",
          entryFileNames: "index.cjs",
        },
      },
    },
  },
  renderer: {
    root: ".",
    // `base: "/"` (défaut, correct pour le web servi en HTTP depuis une racine réelle — voir
    // vite.config.ts, non touché) casserait tous les chemins d'assets une fois empaqueté : le
    // process principal charge `index.html` via `file://`, où une référence absolue
    // (`/assets/...`) résout vers la racine du DISQUE, pas vers le dossier de l'app — d'où les
    // images/scripts/CSS en "lien mort" observés dans le .app packagé. Un chemin relatif reste
    // correct aussi bien en dev (servi par le serveur Vite d'electron-vite) qu'empaqueté.
    base: "./",
    build: {
      outDir: "dist-electron/renderer",
      rollupOptions: { input: "index.html" },
    },
    define: {
      __APP_VERSION__: JSON.stringify(rootPackageJson.version),
    },
    plugins: [react(), tailwindcss(), svgr()],
  },
});
