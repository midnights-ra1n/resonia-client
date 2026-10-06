import { isElectron } from "../platform";

/** Enregistre le service worker de la version web (généré au build, voir sw/sw.template.js) :
 *  toute l'interface est ensuite servie depuis le cache local, le lancement n'attend plus le
 *  réseau. Jamais sur bureau (app déjà chargée depuis le disque, `file://`) ni en dev (le cache
 *  masquerait le rechargement à chaud de Vite).
 *
 *  Enregistré une fois le navigateur inactif : l'installation (précache ~0,8 Mo) ne concurrence
 *  jamais le premier affichage ni le démarrage de la lecture. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || isElectron() || !("serviceWorker" in navigator)) return;
  if (!window.location.protocol.startsWith("http")) return;

  const register = () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .catch((err) => console.warn("[sw] Enregistrement du service worker impossible", err));
  };

  const whenIdle = () =>
    "requestIdleCallback" in window ? window.requestIdleCallback(register, { timeout: 5000 }) : setTimeout(register, 2000);

  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle, { once: true });
}
