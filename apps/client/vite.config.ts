import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
