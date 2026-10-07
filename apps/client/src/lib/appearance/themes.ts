import { create } from "zustand";

/** Thèmes de couleurs proposés dans Paramètres → Apparence.
 *
 *  Toute la palette de l'app passe par les variables CSS de `@theme` (index.css) : un thème
 *  n'est donc qu'un jeu de valeurs posées en style inline sur <html>, qui l'emporte sur `:root`.
 *  Aucun CSS supplémentaire à charger, aucun re-rendu React : le moteur recalcule les styles une
 *  seule fois au changement. "Resonia Orange" (défaut) n'a pas de jeu de valeurs : ce sont celles
 *  d'index.css, on se contente de retirer les surcharges. */

type Scheme = "dark" | "light";

interface PaletteInput {
  scheme?: Scheme;
  /** Fond le plus profond (voiles des modales, `bg-black`) → fond de l'app → panneaux. */
  sunken: string;
  base: string;
  surface1: string;
  surface2: string;
  surface3: string;
  border: string;
  n600: string;
  /** Du plus discret (durées, labels) au plus lisible (titres). */
  text3: string;
  text2: string;
  n300: string;
  n200: string;
  text1: string;
  n50: string;
  accent: string;
  accentHover: string;
  accentPressed: string;
  onAccent: string;
  teal: string;
  success: string;
  warning: string;
  warningLight: string;
  danger: string;
  dangerLight: string;
  dangerLighter: string;
}

function palette(p: PaletteInput): Record<string, string> {
  const tokens: Record<string, string> = {
    "--color-neutral-50": p.n50,
    "--color-neutral-100": p.text1,
    "--color-neutral-200": p.n200,
    "--color-neutral-300": p.n300,
    "--color-neutral-400": p.text2,
    "--color-neutral-500": p.text3,
    "--color-neutral-600": p.n600,
    "--color-neutral-700": p.border,
    "--color-neutral-800": p.surface3,
    "--color-neutral-900": p.surface1,
    "--color-neutral-950": p.base,
    "--color-white": p.text1,
    "--color-black": p.sunken,
    "--color-bg-sunken": p.sunken,
    "--color-bg-base": p.base,
    "--color-surface-1": p.surface1,
    "--color-surface-2": p.surface2,
    "--color-surface-3": p.surface3,
    "--color-border-strong": p.border,
    "--color-text-1": p.text1,
    "--color-text-2": p.text2,
    "--color-text-3": p.text3,
    "--color-accent": p.accent,
    "--color-accent-hover": p.accentHover,
    "--color-accent-pressed": p.accentPressed,
    "--color-on-accent": p.onAccent,
    "--color-teal": p.teal,
    "--color-success": p.success,
    "--color-warning": p.warning,
    "--color-danger": p.danger,
    "--color-amber-400": p.warningLight,
    "--color-amber-500": p.warning,
    "--color-red-300": p.dangerLighter,
    "--color-red-400": p.dangerLight,
    "--color-red-500": p.danger,
  };
  if (p.scheme === "light") {
    // Ombres noires à 45-60 % : bien trop lourdes sur fond clair.
    // Teinte = couleur du texte du thème (une ombre neutre grise paraît sale sur un fond teinté),
    // très diluée : une fine ombre de contact + un halo ambiant à peine perceptible.
    tokens["--shadow-ink-contact"] = `color-mix(in srgb, ${p.text1} 10%, transparent)`;
    tokens["--shadow-ink-1"] = `color-mix(in srgb, ${p.text1} 7%, transparent)`;
    tokens["--shadow-ink-2"] = `color-mix(in srgb, ${p.text1} 12%, transparent)`;
    // Dégradés album/playlist : couleur de pochette atténuée vers le fond clair, sinon un titre
    // foncé se retrouverait sur une pochette foncée.
    tokens["--dominant-strength"] = "50%";
    // Vue paroles : reste sur fond coloré foncé avec texte clair (voir `.on-media`).
    tokens["--on-media-text"] = p.surface1;
    tokens["--lyrics-fallback-bg"] = p.text1;
  }
  return tokens;
}

export const THEMES = [
  {
    id: "resonia-orange",
    label: "Resonia Orange",
    scheme: "dark",
    swatch: ["#0c0b0a", "#1e1b18", "#f4efe8", "#ffa343"],
    tokens: null,
  },
  {
    id: "catppuccin-latte",
    label: "Catppuccin Latte",
    scheme: "light",
    swatch: ["#dce0e8", "#eff1f5", "#4c4f69", "#8839ef"],
    tokens: palette({
      scheme: "light",
      sunken: "#dce0e8",
      base: "#e6e9ef",
      surface1: "#eff1f5",
      surface2: "#e4e7ed",
      surface3: "#d8dce4",
      border: "#bcc0cc",
      n600: "#9ca0b0",
      text3: "#6c6f85",
      text2: "#5c5f77",
      n300: "#565971",
      n200: "#51546d",
      text1: "#4c4f69",
      n50: "#3c3f55",
      accent: "#8839ef",
      accentHover: "#9a55f2",
      accentPressed: "#7029d6",
      onAccent: "#eff1f5",
      teal: "#179299",
      success: "#40a02b",
      warning: "#df8e1d",
      warningLight: "#c97a12",
      danger: "#d20f39",
      dangerLight: "#d20f39",
      dangerLighter: "#d20f39",
    }),
  },
  {
    id: "catppuccin-frappe",
    label: "Catppuccin Frappé",
    scheme: "dark",
    swatch: ["#232634", "#303446", "#c6d0f5", "#ca9ee6"],
    tokens: palette({
      sunken: "#1d1f2b",
      base: "#232634",
      surface1: "#292c3c",
      surface2: "#303446",
      surface3: "#414559",
      border: "#51576d",
      n600: "#626880",
      text3: "#838ba7",
      text2: "#a5adce",
      n300: "#b5bfe2",
      n200: "#bec8ec",
      text1: "#c6d0f5",
      n50: "#dbe2fa",
      accent: "#ca9ee6",
      accentHover: "#d6b5ec",
      accentPressed: "#b585d8",
      onAccent: "#232634",
      teal: "#81c8be",
      success: "#a6d189",
      warning: "#e5c890",
      warningLight: "#ecd6aa",
      danger: "#e78284",
      dangerLight: "#ec9a9b",
      dangerLighter: "#f0b0b1",
    }),
  },
  {
    id: "catppuccin-macchiato",
    label: "Catppuccin Macchiato",
    scheme: "dark",
    swatch: ["#181926", "#24273a", "#cad3f5", "#c6a0f6"],
    tokens: palette({
      sunken: "#12131d",
      base: "#181926",
      surface1: "#1e2030",
      surface2: "#24273a",
      surface3: "#363a4f",
      border: "#494d64",
      n600: "#5b6078",
      text3: "#8087a2",
      text2: "#a5adcb",
      n300: "#b8c0e0",
      n200: "#c1caeb",
      text1: "#cad3f5",
      n50: "#dee4fa",
      accent: "#c6a0f6",
      accentHover: "#d4b8f8",
      accentPressed: "#ad84ee",
      onAccent: "#181926",
      teal: "#8bd5ca",
      success: "#a6da95",
      warning: "#eed49f",
      warningLight: "#f3e0b9",
      danger: "#ed8796",
      dangerLight: "#f19fab",
      dangerLighter: "#f5b7c0",
    }),
  },
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    scheme: "dark",
    swatch: ["#11111b", "#1e1e2e", "#cdd6f4", "#cba6f7"],
    tokens: palette({
      sunken: "#0b0b12",
      base: "#11111b",
      surface1: "#181825",
      surface2: "#1e1e2e",
      surface3: "#313244",
      border: "#45475a",
      n600: "#585b70",
      text3: "#7f849c",
      text2: "#a6adc8",
      n300: "#bac2de",
      n200: "#c4cce9",
      text1: "#cdd6f4",
      n50: "#e0e6fb",
      accent: "#cba6f7",
      accentHover: "#d9bdfa",
      accentPressed: "#b48ef0",
      onAccent: "#11111b",
      teal: "#94e2d5",
      success: "#a6e3a1",
      warning: "#f9e2af",
      warningLight: "#fbebc8",
      danger: "#f38ba8",
      dangerLight: "#f6a3ba",
      dangerLighter: "#f8bbcc",
    }),
  },
  {
    id: "nord",
    label: "Nord",
    scheme: "dark",
    swatch: ["#272c36", "#2e3440", "#e5e9f0", "#88c0d0"],
    tokens: palette({
      sunken: "#21252e",
      base: "#272c36",
      surface1: "#2e3440",
      surface2: "#343a47",
      surface3: "#3b4252",
      border: "#434c5e",
      n600: "#4c566a",
      text3: "#8892a6",
      text2: "#a7b0c0",
      n300: "#c4cad6",
      n200: "#d8dee9",
      text1: "#e5e9f0",
      n50: "#eceff4",
      accent: "#88c0d0",
      accentHover: "#9fd0de",
      accentPressed: "#6fa8b9",
      onAccent: "#2e3440",
      teal: "#8fbcbb",
      success: "#a3be8c",
      warning: "#ebcb8b",
      warningLight: "#f0d69e",
      danger: "#bf616a",
      dangerLight: "#cc747d",
      dangerLighter: "#d88a92",
    }),
  },
  {
    id: "monokai",
    label: "Monokai",
    scheme: "dark",
    swatch: ["#1e1f1c", "#272822", "#f8f8f2", "#f92672"],
    tokens: palette({
      sunken: "#171814",
      base: "#1e1f1c",
      surface1: "#272822",
      surface2: "#2e2f29",
      surface3: "#3e3d32",
      border: "#49483e",
      n600: "#5e5d50",
      text3: "#908d78",
      text2: "#b5b3a5",
      n300: "#d4d3c8",
      n200: "#e8e8df",
      text1: "#f8f8f2",
      n50: "#fcfcf8",
      accent: "#f92672",
      accentHover: "#fb5c94",
      accentPressed: "#d6145d",
      onAccent: "#1a1b17",
      teal: "#66d9ef",
      success: "#a6e22e",
      warning: "#e6db74",
      warningLight: "#efe69a",
      danger: "#fd5f4f",
      dangerLight: "#fd7c6f",
      dangerLighter: "#fe9b90",
    }),
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    scheme: "dark",
    swatch: ["#16161e", "#1a1b26", "#c0caf5", "#7aa2f7"],
    tokens: palette({
      sunken: "#101014",
      base: "#16161e",
      surface1: "#1a1b26",
      surface2: "#1f2133",
      surface3: "#292e42",
      border: "#3b4261",
      n600: "#545c7e",
      text3: "#737aa2",
      text2: "#a9b1d6",
      n300: "#b5bfe6",
      n200: "#bcc6f0",
      text1: "#c0caf5",
      n50: "#d5dcfa",
      accent: "#7aa2f7",
      accentHover: "#9ab8fa",
      accentPressed: "#5d88e8",
      onAccent: "#16161e",
      teal: "#73daca",
      success: "#9ece6a",
      warning: "#e0af68",
      warningLight: "#e8c38c",
      danger: "#f7768e",
      dangerLight: "#f990a3",
      dangerLighter: "#fbaab8",
    }),
  },
  {
    id: "everforest",
    label: "Everforest",
    scheme: "dark",
    swatch: ["#232a2e", "#2d353b", "#d3c6aa", "#a7c080"],
    tokens: palette({
      sunken: "#1e2326",
      base: "#232a2e",
      surface1: "#2d353b",
      surface2: "#343f44",
      surface3: "#3d484d",
      border: "#475258",
      n600: "#56635f",
      text3: "#859289",
      text2: "#9da9a0",
      n300: "#c4bba3",
      n200: "#cec3a8",
      text1: "#d3c6aa",
      n50: "#e2d8c0",
      accent: "#a7c080",
      accentHover: "#bacf98",
      accentPressed: "#8fa96a",
      onAccent: "#232a2e",
      teal: "#83c092",
      success: "#a7c080",
      warning: "#dbbc7f",
      warningLight: "#e4cb9b",
      danger: "#e67e80",
      dangerLight: "#eb9698",
      dangerLighter: "#f0aeaf",
    }),
  },
] as const satisfies readonly {
  id: string;
  label: string;
  scheme: Scheme;
  swatch: readonly [string, string, string, string];
  tokens: Record<string, string> | null;
}[];

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "resonia-orange";

const THEME_KEY = "resonia:appearance:theme";

function getTheme(id: string) {
  return THEMES.find((t) => t.id === id);
}

/** Toutes les variables qu'un thème peut surcharger : à retirer avant d'en poser un autre. */
const ALL_TOKEN_KEYS = Array.from(
  new Set(THEMES.flatMap((t) => (t.tokens ? Object.keys(t.tokens) : []))),
);

function applyTheme(id: ThemeId) {
  const theme = getTheme(id) ?? getTheme(DEFAULT_THEME)!;
  const root = document.documentElement;
  const style = root.style;
  for (const key of ALL_TOKEN_KEYS) style.removeProperty(key);
  if (theme.tokens) for (const [key, value] of Object.entries(theme.tokens)) style.setProperty(key, value);
  root.dataset.theme = theme.id;
  root.dataset.scheme = theme.scheme;
  // Contrôles natifs du moteur (scrollbars, champs) dans le bon schéma — voir index.html.
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", theme.scheme);
}

/** Changement en direct : coupe les transitions le temps d'une frame, sinon chaque élément
 *  muni d'un `transition-colors` animerait sa bascule (des centaines d'animations simultanées
 *  pour rien). */
function switchTheme(id: ThemeId) {
  const root = document.documentElement;
  root.setAttribute("data-theme-switching", "");
  applyTheme(id);
  requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute("data-theme-switching")));
}

// localStorage synchrone, comme les polices (voir fonts.ts) : le thème doit être posé AVANT le
// premier rendu pour éviter un flash de la palette par défaut.
function readStoredTheme(): ThemeId {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value && getTheme(value) ? (value as ThemeId) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

interface ThemeState {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (id) => {
    try {
      window.localStorage.setItem(THEME_KEY, id);
    } catch {
      /* stockage indisponible : le choix vaut pour la session */
    }
    set({ theme: id });
    switchTheme(id);
  },
}));

/** À appeler une fois au démarrage, avant le premier rendu (voir initAppearance). */
export function initTheme() {
  const { theme } = useThemeStore.getState();
  if (theme !== DEFAULT_THEME) applyTheme(theme);
}
