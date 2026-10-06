import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import svgr from 'vite-plugin-svgr'

// Même version que celle publiée sur GitHub (tag de release / image Docker) : le workflow de
// release bump cette version à la racine avant de merger/push, voir scripts/set-version.mjs.
const rootPackageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

// Fichiers plus lourds que ce seuil : pas précachés à l'installation du service worker (ex: hls.js,
// chargé uniquement pour les pochettes animées), mis en cache seulement s'ils sont un jour utilisés.
const SW_PRECACHE_MAX_BYTES = 400 * 1024
// Polices exclues du précache (~3 Mo : polices optionnelles des réglages, chacune en plusieurs
// sous-ensembles d'alphabets dont un seul sert) : mises en cache à leur première utilisation réelle.
const isPrecached = (fileName: string) => !/\.(woff2?|map)$/.test(fileName) && !fileName.split('/').pop()!.startsWith('.')

/** Génère `sw.js` (voir sw/sw.template.js) au build web : version = empreinte du build, liste de
 *  précache = tous les fichiers émis (HTML, JS, CSS, polices, icônes) + ceux de `public/`. */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'resonia-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files: string[] = []
      for (const [fileName, output] of Object.entries(bundle)) {
        if (!isPrecached(fileName)) continue
        const size = output.type === 'chunk' ? output.code.length : (output.source as string | Uint8Array).length
        if (size <= SW_PRECACHE_MAX_BYTES) files.push(fileName)
      }
      const publicDir = fileURLToPath(new URL('./public/', import.meta.url))
      const walk = (dir: string): string[] =>
        readdirSync(dir).flatMap((name) => {
          const full = join(dir, name)
          return statSync(full).isDirectory() ? walk(full) : [full]
        })
      for (const full of walk(publicDir)) {
        const fileName = relative(publicDir, full).split('\\').join('/')
        if (isPrecached(fileName) && statSync(full).size <= SW_PRECACHE_MAX_BYTES) files.push(fileName)
      }
      files.sort()
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12)
      const template = readFileSync(new URL('./sw/sw.template.js', import.meta.url), 'utf8')
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__SW_VERSION__', version).replace('__SW_PRECACHE__', JSON.stringify(files)),
      })
    },
  }
}

export default defineConfig({
  plugins: [
    serviceWorkerPlugin(),
    react(),
    tailwindcss(),
    // Icônes Material Symbols (@material-symbols/svg-400, voir components/icons) importées en
    // composants React via le suffixe `?react` — un fichier SVG local par icône, jamais de
    // police/CDN Google chargée au runtime (voir le commentaire dans components/icons/index.tsx).
    svgr(),
  ],
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
