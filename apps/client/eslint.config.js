import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // src-tauri/target contient les artefacts de build Rust (dont des .js générés par
  // tauri-codegen, illisibles par un parseur JS classique) — jamais du code source à linter.
  globalIgnores(['dist', 'src-tauri']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Ces 3 règles viennent des configs React Compiler-oriented d'eslint-plugin-react-hooks
      // / -react-refresh récentes et sont trop agressives pour l'état actuel du code :
      // - set-state-in-effect flague le pattern standard `if (!server) { setLoading(false);
      //   return } ` dans une dizaine de hooks de fetch — corriger "en règle" changerait le
      //   comportement de tous ces hooks pour un bénéfice nul ici.
      // - refs remonte des faux positifs sur des refs renvoyées par un hook custom
      //   (useTrackListSelection) : jamais lues pendant le rendu, la règle ne sait juste pas
      //   tracer une ref au travers d'un objet retourné par un hook.
      // - only-export-components réclamerait de scinder router.tsx / I18nContext.tsx.
      // En warn plutôt qu'error : visible sans bloquer `pnpm lint` (donc le check CI "build").
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-refresh/only-export-components": "warn",
    },
  },
])
