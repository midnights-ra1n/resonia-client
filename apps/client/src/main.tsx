import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// Police par défaut (Geist), embarquée localement : chargée avec le CSS principal.
import "@fontsource-variable/geist";
import "./index.css";
import { I18nProvider } from "./lib/i18n";
import { usePlayerStore } from "./stores/playerStore";
import { useServersStore } from "./stores/serversStore";
import { useSettingsStore } from "./stores/settingsStore";
import { requestPersistentStorage } from "./lib/audio/cache/opfsStore";
import { initAppearance } from "./lib/appearance/fonts";
import { registerServiceWorker } from "./lib/app/serviceWorker";
import { initDocumentTitle } from "./lib/app/documentTitle";
import { preloadRoutes } from "./app/router";

if (import.meta.env.DEV) {
  // @ts-expect-error - exposition volontaire pour tester depuis la console DevTools
  window.usePlayerStore = usePlayerStore;
}

// Avant le premier rendu (lectures synchrones, voir StorageAdapter.getSync) : session, réglages
// et langue sont connus d'emblée — l'app s'affiche complète, sans écran de chargement.
void useServersStore.getState().hydrate();
void useSettingsStore.getState().hydrate();

requestPersistentStorage();
// Titre de l'onglet / de la fenêtre : piste en cours (voir documentTitle.ts).
initDocumentTitle();
// Avant le premier rendu : la police choisie s'applique sans bascule visible au lancement.
initAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);

// Après le premier affichage, quand le navigateur est inactif : rien de tout ça ne retarde le lancement.
preloadRoutes();
registerServiceWorker();
