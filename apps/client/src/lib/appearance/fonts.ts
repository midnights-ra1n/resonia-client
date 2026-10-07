import { create } from "zustand";
import { initTheme } from "./themes";

/** Polices d'interface proposées dans Paramètres → Apparence. TOUTES sont embarquées dans
 *  l'application (paquets Fontsource, empaquetés par Vite comme n'importe quel asset) : aucune
 *  requête vers Google Fonts ni un CDN tiers, jamais — fonctionne hors ligne, et la CSP
 *  `font-src 'self'` le garantit côté navigateur.
 *
 *  Chargement À LA DEMANDE : chaque `load()` est un import dynamique, donc un chunk CSS séparé
 *  que Vite n'émet que pour la police réellement choisie. Les fichiers .woff2 sont découpés par
 *  sous-ensemble Unicode (`unicode-range`) : le moteur ne télécharge que ceux dont la page a
 *  besoin (latin en pratique). Polices variables partout où elles existent (un seul fichier
 *  couvre toutes les graisses) ; sinon, uniquement les graisses utilisées par l'interface. */
export const FONTS = [
  // Geist : police par défaut, importée statiquement dans main.tsx (bundle principal) pour
  // être disponible dès le premier rendu — rien à charger ici.
  { id: "geist", label: "Geist", family: '"Geist Variable"', load: () => Promise.resolve() },
  // Roboto : déjà servie localement par public/fonts (voir assets/fonts/fonts.css).
  { id: "roboto", label: "Roboto", family: '"Roboto"', load: () => Promise.resolve() },
  { id: "inter", label: "Inter", family: '"Inter Variable"', load: () => import("@fontsource-variable/inter") },
  {
    id: "fira-sans",
    label: "Fira Sans",
    family: '"Fira Sans"',
    load: () =>
      Promise.all([
        import("@fontsource/fira-sans/400.css"),
        import("@fontsource/fira-sans/500.css"),
        import("@fontsource/fira-sans/700.css"),
        import("@fontsource/fira-sans/900.css"),
      ]),
  },
  {
    id: "ubuntu",
    label: "Ubuntu",
    family: '"Ubuntu"',
    load: () =>
      Promise.all([
        import("@fontsource/ubuntu/400.css"),
        import("@fontsource/ubuntu/500.css"),
        import("@fontsource/ubuntu/700.css"),
      ]),
  },
  {
    id: "google-sans",
    label: "Google Sans",
    family: '"Google Sans Variable"',
    load: () => import("@fontsource-variable/google-sans"),
  },
  {
    id: "lato",
    label: "Lato",
    family: '"Lato"',
    load: () =>
      Promise.all([
        import("@fontsource/lato/400.css"),
        import("@fontsource/lato/700.css"),
        import("@fontsource/lato/900.css"),
      ]),
  },
  {
    id: "reddit-sans",
    label: "Reddit Sans",
    family: '"Reddit Sans Variable"',
    load: () => import("@fontsource-variable/reddit-sans"),
  },
] as const;

export type FontId = (typeof FONTS)[number]["id"];
/** Police des paroles : une police du catalogue, ou "same" = suivre celle de l'interface. */
export type LyricsFontId = FontId | "same";

export const DEFAULT_FONT: FontId = "geist";

const FALLBACK_STACK = '"Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif';
const UI_FONT_KEY = "resonia:appearance:uiFont";
const LYRICS_FONT_KEY = "resonia:appearance:lyricsFont";

function getFont(id: string) {
  return FONTS.find((f) => f.id === id);
}

// localStorage (synchrone) plutôt que l'adaptateur de stockage de l'app (asynchrone sur bureau,
// via IPC) : la police doit être connue AVANT le premier rendu, sinon l'interface s'afficherait
// en Geist puis basculerait visiblement une fois les réglages hydratés. Préférence purement
// locale à l'appareil, comme la taille de fenêtre.
function readStored<T extends string>(key: string, isValid: (v: string) => boolean, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value && isValid(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible (navigation privée...) : le choix vaut pour la session */
  }
}

/** Charge la police puis bascule la variable CSS une fois ses glyphes PRÊTS : pas de
 *  clignotement de police au changement (le texte reste dans l'ancienne jusqu'au remplacement). */
async function applyFont(cssVar: "--font-ui" | "--font-lyrics", id: FontId) {
  const font = getFont(id) ?? getFont(DEFAULT_FONT)!;
  try {
    await font.load();
    await Promise.all([document.fonts.load(`400 1em ${font.family}`), document.fonts.load(`700 1em ${font.family}`)]);
  } catch (err) {
    console.warn("[fonts] Chargement de la police impossible, repli sur Geist", err);
  }
  document.documentElement.style.setProperty(cssVar, `${font.family}, ${FALLBACK_STACK}`);
}

function applyLyricsFont(lyricsFont: LyricsFontId) {
  if (lyricsFont === "same") document.documentElement.style.removeProperty("--font-lyrics");
  else void applyFont("--font-lyrics", lyricsFont);
}

interface AppearanceState {
  uiFont: FontId;
  lyricsFont: LyricsFontId;
  setUiFont: (id: FontId) => void;
  setLyricsFont: (id: LyricsFontId) => void;
}

export const useAppearanceStore = create<AppearanceState>((set) => ({
  uiFont: readStored(UI_FONT_KEY, (v) => !!getFont(v), DEFAULT_FONT),
  lyricsFont: readStored<LyricsFontId>(LYRICS_FONT_KEY, (v) => v === "same" || !!getFont(v), "same"),
  setUiFont: (id) => {
    writeStored(UI_FONT_KEY, id);
    set({ uiFont: id });
    void applyFont("--font-ui", id);
  },
  setLyricsFont: (id) => {
    writeStored(LYRICS_FONT_KEY, id);
    set({ lyricsFont: id });
    applyLyricsFont(id);
  },
}));

/** À appeler une fois au démarrage, avant le premier rendu (voir main.tsx). */
export function initAppearance() {
  initTheme();
  const { uiFont, lyricsFont } = useAppearanceStore.getState();
  if (uiFont !== DEFAULT_FONT) void applyFont("--font-ui", uiFont);
  applyLyricsFont(lyricsFont);
}

/** Précharge une police sans l'appliquer (aperçu dans les réglages). */
export function preloadFont(id: FontId) {
  return getFont(id)?.load();
}
