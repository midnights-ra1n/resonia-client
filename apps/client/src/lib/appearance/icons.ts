import { create } from "zustand";
import { useIconPackStore } from "../../components/icons";
import { ICON_PACKS } from "../../components/icons/packs";

/** Packs d'icônes proposés dans Paramètres → Apparence. Le défaut (Material Symbols Rounded) est
 *  dans le bundle principal ; chaque autre pack est un chunk séparé, chargé seulement s'il est
 *  choisi, et ne contient que les ~50 icônes de l'app (pas le pack entier). Tout est local :
 *  aucune requête vers un CDN. */
export const DEFAULT_ICON_PACK = "material-rounded";
export const ICON_PACK_OPTIONS = [{ id: DEFAULT_ICON_PACK, label: "Material Symbols Rounded", coverage: 53 }, ...ICON_PACKS];

/** Échelle appliquée à toutes les icônes (`--icon-scale`). Défaut un peu au-dessus de 1 :
 *  les tailles en dur des composants datent d'icônes jugées trop petites. */
export const ICON_SCALE_MIN = 0.8;
export const ICON_SCALE_MAX = 1.5;
export const DEFAULT_ICON_SCALE = 1.1;

const PACK_KEY = "resonia:appearance:iconPack";
const SCALE_KEY = "resonia:appearance:iconScale";

type IconPack = NonNullable<ReturnType<typeof useIconPackStore.getState>["pack"]>;
const loaders = import.meta.glob<{ default: IconPack }>(["../../components/icons/packs/*.ts", "!**/index.ts"]);
const loaderFor = (id: string) => loaders[`../../components/icons/packs/${id}.ts`];

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible (navigation privée...) : le choix vaut pour la session */
  }
}

const clampScale = (v: number) => Math.min(ICON_SCALE_MAX, Math.max(ICON_SCALE_MIN, v));

let loadSeq = 0;
/** Bascule les icônes une fois le pack chargé (pas d'état intermédiaire). Un choix plus récent
 *  arrivé pendant le chargement gagne. */
async function applyPack(id: string) {
  const seq = ++loadSeq;
  const load = loaderFor(id);
  let pack: IconPack | null = null;
  if (load) {
    try {
      pack = (await load()).default;
    } catch (err) {
      console.warn("[icons] Chargement du pack impossible, repli sur Material", err);
    }
  }
  if (seq === loadSeq) useIconPackStore.setState({ pack });
}

const applyScale = (scale: number) => document.documentElement.style.setProperty("--icon-scale", String(scale));

interface IconSettingsState {
  iconPack: string;
  iconScale: number;
  setIconPack: (id: string) => void;
  setIconScale: (scale: number) => void;
}

const storedPack = read(PACK_KEY);
const storedScale = Number(read(SCALE_KEY));

export const useIconSettingsStore = create<IconSettingsState>((set) => ({
  iconPack: storedPack && (storedPack === DEFAULT_ICON_PACK || loaderFor(storedPack)) ? storedPack : DEFAULT_ICON_PACK,
  iconScale: storedScale ? clampScale(storedScale) : DEFAULT_ICON_SCALE,
  setIconPack: (id) => {
    write(PACK_KEY, id);
    set({ iconPack: id });
    void applyPack(id);
  },
  setIconScale: (scale) => {
    const v = clampScale(scale);
    write(SCALE_KEY, String(v));
    set({ iconScale: v });
    applyScale(v);
  },
}));

/** Au démarrage : la promesse se résout quand le pack choisi est prêt (immédiatement pour le
 *  défaut), pour que main.tsx rende l'app directement avec les bonnes icônes. */
export function initIcons() {
  const { iconPack, iconScale } = useIconSettingsStore.getState();
  applyScale(iconScale);
  return iconPack === DEFAULT_ICON_PACK ? Promise.resolve() : applyPack(iconPack);
}
