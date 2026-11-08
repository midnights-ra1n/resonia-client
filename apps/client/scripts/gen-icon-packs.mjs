// Génère src/components/icons/packs/*.ts : pour chaque pack, l'icône à utiliser pour chacun de nos
// noms sémantiques (ceux exportés par src/components/icons/index.tsx). Un nom introuvable dans un
// pack est simplement omis : l'interface retombe alors sur Material Symbols Rounded.
//
//   node scripts/gen-icon-packs.mjs [chemin/vers/Papicons Extended]
//
// Avec le chemin Papicons, copie aussi les SVG utilisés dans src/assets/icons/papicons (couleur
// noire remplacée par currentColor pour suivre la couleur du texte).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src/components/icons/packs");
const ri = join(root, "node_modules/react-icons");
const ms = join(root, "node_modules/@material-symbols/svg-400");
const papiDir = join(root, "src/assets/icons/papicons");

// Nom sémantique → synonymes (PascalCase) essayés dans l'ordre. `solid` : on préfère la variante
// pleine du pack quand elle existe (boutons de lecture, comme le défaut Material).
const ICONS = {
  ArrowLeft: ["ArrowLeft", "ArrowBack", "ArrowLeftLine", "LeftArrow", "ArrowLeftShort", "ArrowLeftAlt", "ArrowLeftCircle", "ArrowLeftO", "ArrowSmallLeft"],
  ArrowRight: ["ArrowRight", "ArrowForward", "ArrowRightLine", "RightArrow", "ArrowRightShort", "ArrowRightAlt", "ArrowRightCircle", "ArrowRightO", "ArrowSmallRight"],
  ArrowsClockwise: ["ArrowsClockwise", "RefreshCw", "RefreshCcw", "Refresh", "Autorenew", "ArrowClockwise", "Sync", "Reload", "Update", "ArrowRepeat", "Redo", "Loop", "Rotate", "RotateCw", "Spinner11", "ArrowRotateRight", "SyncAlt"],
  Bug: ["Bug", "BugReport", "BugLine", "Beetle", "Ladybug", "Spider"],
  Code: ["Code", "CodeSlash", "CodeLine", "CodeAlt", "Terminal", "CodeBrackets", "CodeBlock", "Embed"],
  Copy: ["Copy", "ContentCopy", "Copy2", "Clipboard", "Files", "Duplicate", "Copy1", "DocumentDuplicate", "Square2Stack", "FileCopy", "Clone", "Squares"],
  CaretDown: ["ChevronDown", "CaretDown", "KeyboardArrowDown", "ArrowDownS", "AngleDown", "DownOutlined", "ChevronDownOutline", "ArrowDownSLine", "ArrowDropDown", "SmallDown", "ChevronDownCircle", "ArrowDown"],
  CaretLeft: ["ChevronLeft", "CaretLeft", "KeyboardArrowLeft", "ArrowLeftS", "AngleLeft", "LeftOutlined", "ArrowLeftSLine", "SmallLeft", "ArrowLeft"],
  CaretRight: ["ChevronRight", "CaretRight", "KeyboardArrowRight", "ArrowRightS", "AngleRight", "RightOutlined", "ArrowRightSLine", "SmallRight", "ArrowRight"],
  Cast: ["Cast", "Airplay", "ScreenCast", "Broadcast", "Tv", "Television", "Monitor", "Screen", "Display", "Desktop", "Speaker"],
  ChartBar: ["ChartBar", "BarChart", "Chart", "BarChart2", "BarChartLine", "Graph", "ChartBarSquare", "Stats", "StatsChart", "Analytics", "Poll", "BarChartAlt", "ChartColumn", "ChartNoAxesColumn"],
  Check: ["Check", "Checkmark", "CheckLine", "Done", "Tick", "Ok", "CheckOutlined", "Check2", "Success"],
  CircleNotch: ["CircleNotch", "Loader", "Loader2", "Spinner", "SpinnerGap", "LoaderCircle", "Loading", "Loading3Quarters", "Spinner2", "LoaderAlt", "Sync", "Refresh", "Reload"],
  ClockCounterClockwise: ["ClockCounterClockwise", "History", "Clock", "Time", "TimeOutline", "Restore", "ClockRotateLeft", "Hourglass", "Alarm", "Watch", "Timer"],
  Disc: ["Disc", "Album", "Disc3", "Vinyl", "Record", "Compact", "Cd", "RecordVinyl"],
  DotsSixVertical: ["DotsSixVertical", "GripVertical", "DragIndicator", "Grip", "DragHandle", "Draggable", "DragMove", "Menu", "DotsVertical", "MoreVertical", "Drag", "ThreeDotsVertical", "KebabVertical", "EllipsisVertical"],
  Download: ["Download", "DownloadSimple", "CloudDownload", "Download2", "DownloadCloud", "DownloadLine", "ArrowDownTray", "Save", "Inbox"],
  Folder: ["Folder", "FolderSimple", "FolderOpen", "Folder2", "Directory", "FileDirectory", "Archive", "Box"],
  GearSix: ["GearSix", "Settings", "Gear", "Cog", "Settings2", "Cog6Tooth", "Settings3", "Gears", "Setting", "Tools", "Wrench", "Options", "Tune"],
  Globe: ["Globe", "Language", "Earth", "Globe2", "World", "Network", "GlobeAlt", "GlobeEurope", "GlobeEuropeAfrica", "Web", "Internet", "Planet"],
  Palette: ["Palette", "ColorPalette", "Brush", "Paintbrush", "PaintBrush", "Swatches", "SwatchBook", "ColorFill", "Paint", "Swatch", "BgColors", "Drop", "Droplet", "Image"],
  HardDrive: ["HardDrive", "HardDrives", "Database", "Server", "Storage", "Hdd", "Disk", "Drive", "Save", "Archive"],
  Heart: ["Heart", "Favorite", "Like", "HeartFill", "Love", "Hearts", "Star"],
  House: ["House", "Home", "HouseSimple", "Home2", "HomeAlt", "HomeSimple", "Home3", "HouseDoor", "HomeOutline"],
  ImageSquare: ["ImageSquare", "Image", "Photo", "Picture", "Images", "Gallery", "FileImage", "Camera"],
  Info: ["Info", "InfoCircle", "InformationCircle", "Information", "InfoOutline", "Alert", "QuestionCircle", "Question"],
  ListBullets: ["ListBullets", "List", "ListUl", "ListUnordered", "ViewList", "ListBulleted", "Menu", "Bars", "BarsArrowDown", "Queue", "ListOl", "ThreeBars", "Lines"],
  ListPlus: ["ListPlus", "PlaylistAdd", "ListAdd", "AddToQueue", "Playlist", "ListCheck", "QueueList", "TaskAdd", "AddBox", "SquarePlus", "PlusSquare", "PlusCircle", "AddCircle", "Plus"],
  SignOut: ["SignOut", "LogOut", "Logout", "LogoutBox", "Exit", "ArrowRightOnRectangle", "BoxArrowRight", "LogOutOutline", "SignOutAlt", "ArrowLeftOnRectangle", "Leave", "Power"],
  Lyrics: ["Lyrics", "MicrophoneStage", "Microphone", "Mic", "Mic2", "TextQuote", "Quote", "Subtitles", "ChatText", "TextAlignLeft", "Text", "Article", "Note", "DocumentText", "ChatBubble", "Chat"],
  MusicNotes: ["MusicNotes", "Music", "MusicNote", "Music2", "MusicalNote", "MusicalNotes", "Music4", "MusicAlt", "Note", "Headphones", "Audio"],
  Pause: ["Pause", "PauseFill", "PauseCircle", "Pause1", "PauseOutline", "MediaPause", "PlayerPause"],
  PencilSimple: ["PencilSimple", "Pencil", "Edit", "Pen", "PencilLine", "Edit2", "PenTool", "PencilSquare", "EditAlt", "Write", "Brush"],
  Play: ["Play", "PlayArrow", "PlayFill", "Play3", "PlayCircle", "MediaPlay", "PlayerPlay", "PlayOutline", "CaretRight", "Forward"],
  Playlist: ["Playlist", "PlaylistPlay", "ListVideo", "ListMusic", "QueueMusic", "Queue", "PlayList", "ListPlay", "Album", "List"],
  Plug: ["Plug", "Plugs", "PlugConnected", "Cast", "Link", "PuzzlePiece", "Puzzle", "Extension"],
  Plus: ["Plus", "Add", "PlusLg", "AddLine", "PlusSmall", "PlusOutlined", "Plus2", "Addition", "AddOutline", "PlusCircle"],
  Pulse: ["Pulse", "Waveform", "AudioLines", "GraphicEq", "Activity", "Equalizer", "Heartbeat", "SoundWave", "Wave", "Pulse2", "Graph", "Sliders"],
  Radio: ["Radio", "NetworkCheck", "Broadcast", "WifiHigh", "Wifi", "Network", "Rss", "Antenna", "Signal", "Gauge", "Speedometer", "Dashboard"],
  Repeat: ["Repeat", "Repeat2", "RepeatLine", "Loop", "Retweet", "Sync", "RepeatOutline", "ArrowRepeat", "Refresh", "Cycle"],
  RestartAlt: ["RestartAlt", "ArrowCounterClockwise", "RotateCcw", "Undo", "Restart", "ArrowCounterclockwise", "Reset", "Replay", "RotateLeft", "Reload", "ArrowUturnLeft", "History", "Refresh"],
  Shuffle: ["Shuffle", "ShuffleSimple", "Shuffle2", "ShuffleLine", "Random", "ShuffleOutline", "ArrowsShuffle", "Arrows", "SwapHorizontal", "Transfer"],
  SkipBack: ["SkipBack", "SkipPrevious", "SkipStart", "StepBackward", "Previous", "PlayerSkipBack", "PlayerTrackPrev", "Backward", "SkipBackward", "Prev", "PlaySkipBack", "Rewind", "MediaSkipBackward", "MediaRewind", "ChevronDoubleLeft"],
  SkipForward: ["SkipForward", "SkipNext", "SkipEnd", "StepForward", "Next", "PlayerSkipForward", "PlayerTrackNext", "Forward", "PlaySkipForward", "FastForward", "MediaSkipForward", "MediaFastForward", "ChevronDoubleRight"],
  SortAscending: ["ArrowUp", "SortAscending", "ArrowUpward", "UpArrow", "ArrowUpLine", "ArrowUpShort", "ArrowUpAlt", "ArrowNarrowUp", "ChevronUp", "CaretUp", "Up", "ArrowSmallUp"],
  SortDescending: ["ArrowDown", "SortDescending", "ArrowDownward", "DownArrow", "ArrowDownLine", "ArrowDownShort", "ArrowDownAlt", "ArrowNarrowDown", "ChevronDown", "CaretDown", "Down", "ArrowSmallDown"],
  SpeakerHigh: ["SpeakerHigh", "Volume2", "VolumeUp", "VolumeHigh", "Volume", "VolumeUpLine", "SpeakerWave", "Speaker", "Sound", "VolumeFull", "Volume3", "Audio", "Unmute"],
  SpeakerX: ["SpeakerX", "VolumeX", "VolumeOff", "VolumeMute", "Mute", "VolumeMuteLine", "SpeakerXMark", "SpeakerSlash", "SoundOff", "VolumeOffOutline", "MuteOutline", "Volume0", "VolumeCross"],
  Star: ["Star", "StarFill", "StarOutline", "Star1", "StarEmpty", "Stars", "Favorite"],
  Trash: ["Trash", "Trash2", "Delete", "TrashSimple", "DeleteBin", "Bin", "Trashcan", "TrashAlt", "Garbage"],
  User: ["User", "Person", "UserCircle", "Account", "Profile", "UserAlt", "PersonCircle", "Avatar", "Man"],
  WifiSlash: ["WifiSlash", "WifiOff", "NoWifi", "WifiNo", "SignalOff", "CloudOff", "Offline", "Disconnect", "Unlink", "LinkBreak", "Ban", "Block"],
  X: ["XMark", "Xmark", "Close", "Times", "X", "CloseLine", "Times", "Cross", "Cancel", "Multiply", "Remove", "CloseOutline", "Clear", "Dismiss", "Delete"],
};
const SOLID = new Set(["Play", "Pause", "SkipBack", "SkipForward", "Heart"]);

const exportsOf = (mod) =>
  new Set([...readFileSync(join(ri, mod, "index.d.ts"), "utf8").matchAll(/declare const (\w+)/g)].map((m) => m[1]));

// Un pack react-icons : `names(base, solid)` → candidats complets essayés dans l'ordre.
const ri_ = (id, label, mod, names) => ({ id, label, kind: "ri", mod, names });
const pre = (p, ...suffixes) => (b) => suffixes.map((s) => p + b + s);
const solidFirst = (normal, solid) => (b, isSolid) => (isSolid ? [...solid(b), ...normal(b)] : [...normal(b), ...solid(b)]);
const phosphor = (s) => solidFirst(pre("Pi", s), pre("Pi", "Fill"));

const PACKS = [
  ...["Outlined", "Sharp"].map((style) => ({ id: `material-${style.toLowerCase()}`, label: `Material Symbols ${style}`, kind: "ms", style: style.toLowerCase() })),
  { id: "papicons", label: "Papicons", kind: "papi" },
  ri_("phosphor", "Phosphor Regular", "pi", phosphor("")),
  ri_("phosphor-thin", "Phosphor Thin", "pi", phosphor("Thin")),
  ri_("phosphor-light", "Phosphor Light", "pi", phosphor("Light")),
  ri_("phosphor-bold", "Phosphor Bold", "pi", phosphor("Bold")),
  ri_("phosphor-fill", "Phosphor Fill", "pi", pre("Pi", "Fill")),
  ri_("phosphor-duotone", "Phosphor Duotone", "pi", phosphor("Duotone")),
  ri_("lucide", "Lucide", "lu", pre("Lu", "")),
  ri_("feather", "Feather", "fi", pre("Fi", "")),
  ri_("tabler", "Tabler Outline", "tb", solidFirst(pre("Tb", ""), pre("Tb", "Filled"))),
  ri_("tabler-filled", "Tabler Filled", "tb", pre("Tb", "Filled", "")),
  ri_("remix-line", "Remix Line", "ri", solidFirst(pre("Ri", "Line", ""), pre("Ri", "Fill"))),
  ri_("remix-fill", "Remix Fill", "ri", pre("Ri", "Fill", "", "Line")),
  ri_("bootstrap", "Bootstrap", "bs", solidFirst(pre("Bs", ""), pre("Bs", "Fill"))),
  ri_("bootstrap-fill", "Bootstrap Fill", "bs", pre("Bs", "Fill", "")),
  ri_("heroicons2", "Heroicons 2 Outline", "hi2", solidFirst((b) => ["HiOutline" + b], (b) => ["Hi" + b])),
  ri_("heroicons2-solid", "Heroicons 2 Solid", "hi2", (b) => ["Hi" + b, "HiOutline" + b]),
  ri_("heroicons2-mini", "Heroicons 2 Mini", "hi2", (b) => ["HiMini" + b, "Hi" + b]),
  ri_("heroicons", "Heroicons Outline", "hi", solidFirst((b) => ["HiOutline" + b], (b) => ["Hi" + b])),
  ri_("heroicons-solid", "Heroicons Solid", "hi", (b) => ["Hi" + b, "HiOutline" + b]),
  ri_("fa6", "Font Awesome 6", "fa6", (b) => ["Fa" + b, "FaReg" + b]),
  ri_("fa6-regular", "Font Awesome 6 Regular", "fa6", solidFirst((b) => ["FaReg" + b], (b) => ["Fa" + b])),
  ri_("fa5", "Font Awesome 5", "fa", (b) => ["Fa" + b, "FaReg" + b]),
  ri_("fa5-regular", "Font Awesome 5 Regular", "fa", solidFirst((b) => ["FaReg" + b], (b) => ["Fa" + b])),
  ri_("ionicons5", "Ionicons 5", "io5", pre("Io", "", "Outline")),
  ri_("ionicons5-outline", "Ionicons 5 Outline", "io5", solidFirst(pre("Io", "Outline"), pre("Io", ""))),
  ri_("ionicons5-sharp", "Ionicons 5 Sharp", "io5", pre("Io", "Sharp", "")),
  ri_("ionicons4-ios", "Ionicons 4 iOS", "io", (b) => ["IoIos" + b, "IoMd" + b, "Io" + b]),
  ri_("ionicons4-md", "Ionicons 4 Material", "io", (b) => ["IoMd" + b, "IoIos" + b, "Io" + b]),
  ri_("material-design", "Material Design", "md", (b) => ["Md" + b, "MdOutline" + b]),
  ri_("material-design-outlined", "Material Design Outlined", "md", solidFirst((b) => ["MdOutline" + b], (b) => ["Md" + b])),
  ri_("ant", "Ant Design Outlined", "ai", solidFirst((b) => ["AiOutline" + b], (b) => ["AiFill" + b])),
  ri_("ant-filled", "Ant Design Filled", "ai", (b) => ["AiFill" + b, "AiOutline" + b]),
  ri_("ant-twotone", "Ant Design Two-tone", "ai", (b) => ["AiTwotone" + b, "AiFill" + b, "AiOutline" + b]),
  ri_("boxicons", "BoxIcons", "bi", solidFirst(pre("Bi", ""), pre("BiSolid", ""))),
  ri_("boxicons-solid", "BoxIcons Solid", "bi", (b) => ["BiSolid" + b, "Bi" + b]),
  ri_("octicons", "GitHub Octicons", "go", pre("Go", "")),
  ri_("circum", "Circum Icons", "ci", pre("Ci", "")),
  ri_("typicons", "Typicons", "ti", solidFirst(pre("Ti", "Outline", ""), pre("Ti", "")), ),
  ri_("grommet", "Grommet Icons", "gr", pre("Gr", "")),
  ri_("simple-line", "Simple Line Icons", "sl", pre("Sl", "")),
  ri_("icomoon", "IcoMoon Free", "im", pre("Im", "")),
  ri_("css-gg", "css.gg", "cg", pre("Cg", "")),
  ri_("vscode", "VS Code Icons", "vsc", pre("Vsc", "")),
  ri_("themify", "Themify Icons", "tfi", pre("Tfi", "")),
  ri_("radix", "Radix Icons", "rx", pre("Rx", "")),
  ri_("line-awesome", "Line Awesome", "lia", pre("Lia", "Solid", "")),
  ri_("flat-color", "Flat Color Icons", "fc", pre("Fc", "")),
  ri_("game-icons", "Game Icons", "gi", pre("Gi", "")),
  // Pas de Weather Icons, Devicons ni Simple Icons : ce sont des logos (météo, langages, marques),
  // presque aucune de nos icônes n'y existe (5, 2 et 11 sur 53).
];

// Papicons : correspondance faite à la main (noms de fichiers kebab-case du pack).
const PAPICONS = {
  ArrowLeft: "arrow-left", ArrowRight: "arrow-right", ArrowsClockwise: "refresh", Bug: "bug", Code: "code", Copy: "copy",
  CaretDown: "chevron-down", CaretLeft: "chevron-left", CaretRight: "chevron-right", Cast: "tv", ChartBar: "chart-bar",
  Check: "check", ClockCounterClockwise: "clock", Disc: "disc", DotsSixVertical: "dots-vertical", Download: "download",
  Folder: "folder", GearSix: "gears", Globe: "globe", Palette: "palette", HardDrive: "hard-drive", Heart: "heart",
  House: "home", ImageSquare: "gallery", Info: "info", ListBullets: "list", ListPlus: "add", SignOut: "logout",
  Lyrics: "text-bubble", MusicNotes: "music", Pause: "pause", PencilSimple: "pen", Play: "play", Playlist: "playlist",
  Plug: "plug", Plus: "plus", Pulse: "sliders", Radio: "network", Repeat: "repeat", RestartAlt: "undo", Shuffle: "shuffle",
  SkipBack: "skip-back", SkipForward: "skip-forward", SortAscending: "arrow-up", SortDescending: "arrow-down",
  SpeakerHigh: "volume", SpeakerX: "volume-cross", Star: "star", Trash: "trash", User: "user", WifiSlash: "globe-cross", X: "cross",
};

// Material Symbols Rounded (défaut, importé statiquement dans index.tsx) : même noms de fichiers pour Outlined/Sharp.
const MATERIAL = Object.fromEntries(
  [...readFileSync(join(root, "src/components/icons/index.tsx"), "utf8").matchAll(/import (\w+) from "@material-symbols\/svg-400\/rounded\/([\w-]+)\.svg\?react"/g)].map(
    (m) => [m[1], m[2]],
  ),
);
const MATERIAL_BY_NAME = Object.fromEntries(
  [...readFileSync(join(root, "src/components/icons/index.tsx"), "utf8").matchAll(/export const (\w+) = icon\("\w+", (\w+)\)/g)].map((m) => [m[1], MATERIAL[m[2]]]),
);

const papiSrc = process.argv[2];
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
if (papiSrc) {
  rmSync(papiDir, { recursive: true, force: true });
  mkdirSync(papiDir, { recursive: true });
  copyFileSync(join(papiSrc, "LICENSE"), join(papiDir, "LICENSE"));
}

const names = Object.keys(ICONS);
const index = [];
const report = [];
for (const pack of PACKS) {
  const lines = [];
  let found = 0;
  if (pack.kind === "ri") {
    const avail = exportsOf(pack.mod);
    const picked = {};
    for (const n of names) {
      const hit = ICONS[n].flatMap((b) => pack.names(b, SOLID.has(n))).find((c) => avail.has(c));
      if (hit) picked[n] = hit;
    }
    const uniq = [...new Set(Object.values(picked))].sort();
    if (uniq.length) lines.push(`import { ${uniq.join(", ")} } from "react-icons/${pack.mod}";`);
    lines.push("", "export default {", ...Object.entries(picked).map(([n, c]) => `  ${n}: ${c},`), "};");
    found = Object.keys(picked).length;
  } else {
    const entries = [];
    for (const n of names) {
      let path;
      if (pack.kind === "ms") {
        const file = MATERIAL_BY_NAME[n];
        if (file && existsSync(join(ms, pack.style, `${file}.svg`))) path = `@material-symbols/svg-400/${pack.style}/${file}.svg?react`;
      } else {
        const file = PAPICONS[n];
        if (papiSrc && file) {
          const svg = readFileSync(join(papiSrc, "icons", `${file}.svg`), "utf8").replace(/fill="(black|#000|#000000)"/g, 'fill="currentColor"');
          writeFileSync(join(papiDir, `${file}.svg`), svg);
        }
        if (file && existsSync(join(papiDir, `${file}.svg`))) path = `../../../assets/icons/papicons/${file}.svg?react`;
      }
      if (path) entries.push([n, path]);
    }
    lines.push(...entries.map(([n, p]) => `import ${n} from "${p}";`));
    lines.push("", "export default {", ...entries.map(([n]) => `  ${n},`), "};");
    found = entries.length;
  }
  writeFileSync(join(outDir, `${pack.id}.ts`), `// Généré par scripts/gen-icon-packs.mjs — ne pas modifier à la main.\n${lines.join("\n")}\n`);
  index.push(`  { id: "${pack.id}", label: "${pack.label}", coverage: ${found} },`);
  report.push(`${pack.id.padEnd(26)} ${found}/${names.length}`);
}
writeFileSync(
  join(outDir, "index.ts"),
  `// Généré par scripts/gen-icon-packs.mjs — ne pas modifier à la main.\n// coverage : nombre d'icônes de l'app trouvées dans le pack (les autres retombent sur Material Symbols Rounded).\nexport const ICON_PACKS = [\n${index.join("\n")}\n] as const;\n`,
);
console.log(report.join("\n"));
