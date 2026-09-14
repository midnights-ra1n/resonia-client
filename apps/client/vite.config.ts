import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Même version que celle publiée sur GitHub (tag de release / image Docker) : le workflow de
// release bump cette version à la racine avant de merger/push, voir scripts/set-version.mjs.
const rootPackageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackageJson.version),
  },
  build: {
    target: "es2022",
    // hls.js (~570 Ko) n'est chargé qu'à la demande (pochettes animées, cf.
    // AnimatedAlbumCoverVideo.tsx) donc son poids n'impacte jamais le démarrage.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (/react-dom|\/react\/|react-router/.test(id)) return "vendor-react";
          }
        },
      },
    },
  },
})
