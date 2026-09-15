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
    plugins: [externalizeDepsPlugin()],
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
    },
  },
  renderer: {
    root: ".",
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
