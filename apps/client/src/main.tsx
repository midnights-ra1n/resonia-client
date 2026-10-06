import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// Police par défaut (Geist), embarquée localement : chargée avec le CSS principal.
import "@fontsource-variable/geist";
import "./index.css";
import { I18nProvider } from "./lib/i18n";
import { usePlayerStore } from "./stores/playerStore";
import { requestPersistentStorage } from "./lib/audio/cache/opfsStore";
import { initAppearance } from "./lib/appearance/fonts";

if (import.meta.env.DEV) {
  // @ts-expect-error - exposition volontaire pour tester depuis la console DevTools
  window.usePlayerStore = usePlayerStore;
}

requestPersistentStorage();
// Avant le premier rendu : la police choisie s'applique sans bascule visible au lancement.
initAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
