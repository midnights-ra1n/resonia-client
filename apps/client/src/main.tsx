import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { I18nProvider } from "./lib/i18n";
import { usePlayerStore } from "./stores/playerStore";
import { requestPersistentStorage } from "./lib/audio/cache/opfsStore";

if (import.meta.env.DEV) {
  // @ts-expect-error - exposition volontaire pour tester depuis la console DevTools
  window.usePlayerStore = usePlayerStore;
}

requestPersistentStorage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
