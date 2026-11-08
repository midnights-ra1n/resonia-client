import type { ComponentType, CSSProperties, SVGProps } from "react";
import { create } from "zustand";

// Material Symbols (le set d'icônes de fonts.google.com/icons), servies par le paquet npm
// `@material-symbols/svg-400` — un fichier SVG local par icône, jamais une police ni un CSS
// chargés depuis fonts.googleapis.com/fonts.gstatic.com : aucune requête réseau vers Google au
// runtime (contrainte de confidentialité), et le bundle ne contient que les icônes réellement
// importées ci-dessous (tree-shaking Vite/Rollup standard sur des modules ES), pas le pack
// entier (~7800 icônes × 3 styles). `?react` (vite-plugin-svgr, voir vite.config.ts) transforme
// chaque SVG en composant React plutôt qu'en URL d'asset.
import IconArrowBack from "@material-symbols/svg-400/rounded/arrow_back.svg?react";
import IconArrowDownward from "@material-symbols/svg-400/rounded/arrow_downward.svg?react";
import IconArrowForward from "@material-symbols/svg-400/rounded/arrow_forward.svg?react";
import IconArrowUpward from "@material-symbols/svg-400/rounded/arrow_upward.svg?react";
import IconBarChart from "@material-symbols/svg-400/rounded/bar_chart.svg?react";
import IconBugReport from "@material-symbols/svg-400/rounded/bug_report.svg?react";
import IconContentCopy from "@material-symbols/svg-400/rounded/content_copy.svg?react";
import IconAutorenew from "@material-symbols/svg-400/rounded/autorenew.svg?react";
import IconCast from "@material-symbols/svg-400/rounded/cast.svg?react";
import IconCheck from "@material-symbols/svg-400/rounded/check.svg?react";
import IconChevronLeft from "@material-symbols/svg-400/rounded/chevron_left.svg?react";
import IconChevronRight from "@material-symbols/svg-400/rounded/chevron_right.svg?react";
import IconClose from "@material-symbols/svg-400/rounded/close.svg?react";
import IconCode from "@material-symbols/svg-400/rounded/code.svg?react";
import IconDelete from "@material-symbols/svg-400/rounded/delete.svg?react";
import IconDownload from "@material-symbols/svg-400/rounded/download.svg?react";
import IconDragIndicator from "@material-symbols/svg-400/rounded/drag_indicator.svg?react";
import IconEdit from "@material-symbols/svg-400/rounded/edit.svg?react";
import IconFavoriteFill from "@material-symbols/svg-400/rounded/favorite-fill.svg?react";
import IconFolder from "@material-symbols/svg-400/rounded/folder.svg?react";
import IconGraphicEq from "@material-symbols/svg-400/rounded/graphic_eq.svg?react";
import IconHardDrive from "@material-symbols/svg-400/rounded/hard_drive.svg?react";
import IconHistory from "@material-symbols/svg-400/rounded/history.svg?react";
import IconHome from "@material-symbols/svg-400/rounded/home.svg?react";
import IconLanguage from "@material-symbols/svg-400/rounded/language.svg?react";
import IconPalette from "@material-symbols/svg-400/rounded/palette.svg?react";
import IconImage from "@material-symbols/svg-400/rounded/image.svg?react";
import IconInfo from "@material-symbols/svg-400/rounded/info.svg?react";
import IconKeyboardArrowDown from "@material-symbols/svg-400/rounded/keyboard_arrow_down.svg?react";
import IconList from "@material-symbols/svg-400/rounded/list.svg?react";
import IconLogout from "@material-symbols/svg-400/rounded/logout.svg?react";
import IconLyrics from "@material-symbols/svg-400/rounded/lyrics.svg?react";
import IconMusicNote from "@material-symbols/svg-400/rounded/music_note.svg?react";
import IconAlbum from "@material-symbols/svg-400/rounded/album.svg?react";
import IconNetworkCheck from "@material-symbols/svg-400/rounded/network_check.svg?react";
import IconPauseFill from "@material-symbols/svg-400/rounded/pause-fill.svg?react";
import IconPerson from "@material-symbols/svg-400/rounded/person.svg?react";
import IconPlayArrowFill from "@material-symbols/svg-400/rounded/play_arrow-fill.svg?react";
import IconPlaylistAdd from "@material-symbols/svg-400/rounded/playlist_add.svg?react";
import IconPlaylistPlay from "@material-symbols/svg-400/rounded/playlist_play.svg?react";
import IconAdd from "@material-symbols/svg-400/rounded/add.svg?react";
import IconProgressActivity from "@material-symbols/svg-400/rounded/progress_activity.svg?react";
import IconRepeat from "@material-symbols/svg-400/rounded/repeat.svg?react";
import IconRestartAlt from "@material-symbols/svg-400/rounded/restart_alt.svg?react";
import IconSettings from "@material-symbols/svg-400/rounded/settings.svg?react";
import IconShuffle from "@material-symbols/svg-400/rounded/shuffle.svg?react";
import IconSkipNextFill from "@material-symbols/svg-400/rounded/skip_next-fill.svg?react";
import IconSkipPreviousFill from "@material-symbols/svg-400/rounded/skip_previous-fill.svg?react";
import IconStar from "@material-symbols/svg-400/rounded/star.svg?react";
import IconVolumeOff from "@material-symbols/svg-400/rounded/volume_off.svg?react";
import IconVolumeUp from "@material-symbols/svg-400/rounded/volume_up.svg?react";
import IconWifiOff from "@material-symbols/svg-400/rounded/wifi_off.svg?react";

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

/** Type d'un composant icône — sert à typer un champ "icon" générique (voir
 *  components/menu/ContextMenu.tsx), rendu dynamiquement via `<Icon ... />`. */
export type Icon = ComponentType<IconProps>;

type SvgComponent = ComponentType<SVGProps<SVGSVGElement>>;

/** Pack d'icônes actif (voir lib/appearance/icons.ts) : `null` = Material Symbols Rounded, le
 *  défaut importé ci-dessus. Un pack ne couvre pas forcément toutes nos icônes : celles qui
 *  lui manquent retombent sur Material. */
export const useIconPackStore = create<{ pack: Partial<Record<string, SvgComponent>> | null }>(() => ({ pack: null }));

/** `size` est multiplié par `--icon-scale` (réglage Apparence → Taille des icônes). `fill`
 *  donne la couleur (même contrat qu'avant : `fill="white"`, `fill="currentColor"`) ; il passe
 *  par `color` et jamais par l'attribut `fill`, qui remplirait les icônes à traits (Lucide,
 *  Feather...). Les SVG Material n'ont pas de `fill` propre : on leur met `currentColor`. */
function icon(name: string, Fallback: SvgComponent): Icon {
  function PackIcon({ size, fill, style, ...rest }: IconProps) {
    const Override = useIconPackStore((s) => s.pack?.[name]);
    const dim = size === undefined ? undefined : `calc(${typeof size === "number" ? `${size}px` : size} * var(--icon-scale, 1))`;
    const st: CSSProperties = { width: dim, height: dim, color: fill === "currentColor" ? undefined : fill, ...style };
    return Override ? <Override style={st} {...rest} /> : <Fallback fill="currentColor" style={st} {...rest} />;
  }
  PackIcon.displayName = name;
  return PackIcon;
}

export const ArrowLeft = icon("ArrowLeft", IconArrowBack);
export const ArrowRight = icon("ArrowRight", IconArrowForward);
export const ArrowsClockwise = icon("ArrowsClockwise", IconAutorenew);
export const Bug = icon("Bug", IconBugReport);
export const Code = icon("Code", IconCode);
export const Copy = icon("Copy", IconContentCopy);
export const CaretDown = icon("CaretDown", IconKeyboardArrowDown);
export const CaretLeft = icon("CaretLeft", IconChevronLeft);
export const CaretRight = icon("CaretRight", IconChevronRight);
export const Cast = icon("Cast", IconCast);
export const ChartBar = icon("ChartBar", IconBarChart);
export const Check = icon("Check", IconCheck);
export const CircleNotch = icon("CircleNotch", IconProgressActivity);
export const ClockCounterClockwise = icon("ClockCounterClockwise", IconHistory);
export const Disc = icon("Disc", IconAlbum);
export const DotsSixVertical = icon("DotsSixVertical", IconDragIndicator);
export const Download = icon("Download", IconDownload);
export const Folder = icon("Folder", IconFolder);
export const GearSix = icon("GearSix", IconSettings);
export const Globe = icon("Globe", IconLanguage);
export const Palette = icon("Palette", IconPalette);
export const HardDrive = icon("HardDrive", IconHardDrive);
export const Heart = icon("Heart", IconFavoriteFill);
export const House = icon("House", IconHome);
export const ImageSquare = icon("ImageSquare", IconImage);
export const Info = icon("Info", IconInfo);
export const ListBullets = icon("ListBullets", IconList);
export const ListPlus = icon("ListPlus", IconPlaylistAdd);
export const SignOut = icon("SignOut", IconLogout);
export const Lyrics = icon("Lyrics", IconLyrics);
export const MusicNotes = icon("MusicNotes", IconMusicNote);
export const Pause = icon("Pause", IconPauseFill);
export const PencilSimple = icon("PencilSimple", IconEdit);
export const Play = icon("Play", IconPlayArrowFill);
export const Playlist = icon("Playlist", IconPlaylistPlay);
export const Plug = icon("Plug", IconCast);
export const Plus = icon("Plus", IconAdd);
export const Pulse = icon("Pulse", IconGraphicEq);
export const Radio = icon("Radio", IconNetworkCheck);
export const Repeat = icon("Repeat", IconRepeat);
export const RestartAlt = icon("RestartAlt", IconRestartAlt);
export const Shuffle = icon("Shuffle", IconShuffle);
export const SkipBack = icon("SkipBack", IconSkipPreviousFill);
export const SkipForward = icon("SkipForward", IconSkipNextFill);
export const SortAscending = icon("SortAscending", IconArrowUpward);
export const SortDescending = icon("SortDescending", IconArrowDownward);
export const SpeakerHigh = icon("SpeakerHigh", IconVolumeUp);
export const SpeakerX = icon("SpeakerX", IconVolumeOff);
export const Star = icon("Star", IconStar);
export const Trash = icon("Trash", IconDelete);
export const User = icon("User", IconPerson);
export const WifiSlash = icon("WifiSlash", IconWifiOff);
export const X = icon("X", IconClose);
