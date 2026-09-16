/** Racine desktop pour un `BlobStore` (voir `index.ts`) : `AppCache` est un cache transitoire
 *  (dossier `Cache` sous les données de l'app — voir `resolveBaseDir` dans
 *  `electron/main/index.ts`), `AppData` est persistant (téléchargements explicites de
 *  l'utilisateur, dossier racine des données de l'app). Neutre vis-à-vis du backend —
 *  remplace l'énumération `BaseDirectory` du plugin Tauri `fs`, propre à Electron désormais.
 *  Objet + type plutôt qu'un `enum` TS classique : `erasableSyntaxOnly` (tsconfig.app.json)
 *  interdit les constructions qui ne sont pas de la syntaxe JS directement effaçable. */
export const DesktopBaseDir = {
  AppCache: "appCache",
  AppData: "appData",
} as const;
export type DesktopBaseDir = (typeof DesktopBaseDir)[keyof typeof DesktopBaseDir];
