import { isElectron } from "../platform";
import { usePlayerStore } from "../../stores/playerStore";

const APP_NAME = "Resonia";

/** Titre de l'onglet (web) et de la fenêtre (bureau : Electron reprend `document.title`) :
 *  « Titre • Artiste — Resonia » pendant une lecture, « Resonia » sinon. Sur bureau uniquement,
 *  préfixé de 🔊 tant que la musique joue réellement (retiré en pause).
 *
 *  Abonnement direct au store, hors React : aucun re-render, et `document.title` n'est réécrit
 *  que si le texte change réellement (jamais à chaque tick de progression). */
export function initDocumentTitle(): void {
  const desktop = isElectron();
  let last = "";

  const update = () => {
    const { currentTrack, isPlaying } = usePlayerStore.getState();
    let title = currentTrack ? `${currentTrack.title} • ${currentTrack.artist} — ${APP_NAME}` : APP_NAME;
    if (desktop && currentTrack && isPlaying) title = `🔊 ${title}`;
    if (title === last) return;
    last = title;
    document.title = title;
  };

  update();
  usePlayerStore.subscribe(update);
}
