import type { ComponentType, SVGProps } from "react";

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
import IconImage from "@material-symbols/svg-400/rounded/image.svg?react";
import IconInfo from "@material-symbols/svg-400/rounded/info.svg?react";
import IconKeyboardArrowDown from "@material-symbols/svg-400/rounded/keyboard_arrow_down.svg?react";
import IconList from "@material-symbols/svg-400/rounded/list.svg?react";
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

/** Chaque SVG Material Symbols n'a pas d'attribut `fill` explicite (donc "black" par défaut
 *  en CSS) : on le fait suivre la couleur de texte ambiante par défaut (`currentColor`), sauf
 *  si l'appelant force une couleur précise via `fill="..."` — exactement le même contrat que
 *  les icônes Phosphor précédemment utilisées ici (`<Play fill="white" .../>` etc.), pour
 *  n'avoir à migrer que l'import, jamais les usages. `size` mappe sur `width`/`height`. */
function wrap(Svg: ComponentType<SVGProps<SVGSVGElement>>): Icon {
  return function WrappedIcon({ size, fill, style, ...rest }: IconProps) {
    return <Svg width={size} height={size} fill={fill ?? "currentColor"} style={style} {...rest} />;
  };
}

export const ArrowLeft = wrap(IconArrowBack);
export const ArrowRight = wrap(IconArrowForward);
export const ArrowsClockwise = wrap(IconAutorenew);
export const Bug = wrap(IconBugReport);
export const Code = wrap(IconCode);
export const CaretDown = wrap(IconKeyboardArrowDown);
export const CaretLeft = wrap(IconChevronLeft);
export const CaretRight = wrap(IconChevronRight);
export const Cast = wrap(IconCast);
export const ChartBar = wrap(IconBarChart);
export const Check = wrap(IconCheck);
export const CircleNotch = wrap(IconProgressActivity);
export const ClockCounterClockwise = wrap(IconHistory);
export const Disc = wrap(IconAlbum);
export const DotsSixVertical = wrap(IconDragIndicator);
export const Download = wrap(IconDownload);
export const Folder = wrap(IconFolder);
export const GearSix = wrap(IconSettings);
export const Globe = wrap(IconLanguage);
export const HardDrive = wrap(IconHardDrive);
export const Heart = wrap(IconFavoriteFill);
export const House = wrap(IconHome);
export const ImageSquare = wrap(IconImage);
export const Info = wrap(IconInfo);
export const ListBullets = wrap(IconList);
export const ListPlus = wrap(IconPlaylistAdd);
export const Lyrics = wrap(IconLyrics);
export const MusicNotes = wrap(IconMusicNote);
export const Pause = wrap(IconPauseFill);
export const PencilSimple = wrap(IconEdit);
export const Play = wrap(IconPlayArrowFill);
export const Playlist = wrap(IconPlaylistPlay);
export const Plug = wrap(IconCast);
export const Plus = wrap(IconAdd);
export const Pulse = wrap(IconGraphicEq);
export const Radio = wrap(IconNetworkCheck);
export const Repeat = wrap(IconRepeat);
export const RestartAlt = wrap(IconRestartAlt);
export const Shuffle = wrap(IconShuffle);
export const SkipBack = wrap(IconSkipPreviousFill);
export const SkipForward = wrap(IconSkipNextFill);
export const SortAscending = wrap(IconArrowUpward);
export const SortDescending = wrap(IconArrowDownward);
export const SpeakerHigh = wrap(IconVolumeUp);
export const SpeakerX = wrap(IconVolumeOff);
export const Star = wrap(IconStar);
export const Trash = wrap(IconDelete);
export const User = wrap(IconPerson);
export const WifiSlash = wrap(IconWifiOff);
export const X = wrap(IconClose);
