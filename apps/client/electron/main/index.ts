import { app, BrowserWindow, Menu, ipcMain, nativeTheme, net, powerSaveBlocker, screen, session, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { Bonjour } from "bonjour-service";
import type { Service as BonjourService } from "bonjour-service";
import { start as startAirplaySender } from "@lox-audioserver/node-airplay-sender";
import type { LoxAirplaySender } from "@lox-audioserver/node-airplay-sender";
import { dirname, join } from "node:path";
import { networkInterfaces } from "node:os";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, open as fsOpen, readFile, stat, unlink, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";

// Doit être appelé avant TOUT accès à `app.getPath(...)` (utilisé plus bas pour l'état de
// fenêtre, le store, le blob store) : sans ça, Electron dérive le nom par défaut du champ
// "name" de package.json ("@resonia/client"), ce qui produisait des dossiers de données
// utilisateur littéralement nommés "@resonia/client" (visible dans le Finder/menu Application
// Support) au lieu de "Resonia" — la même identité que l'ancien build Tauri
// (productName "Resonia", identifiant com.resonia.client dans tauri.conf.json).
app.setName("Resonia");

// Resonia n'a pas de thème clair (voir index.css — fond #0C0B0A, palette Carotte partout) : sans
// ça, un système en mode clair rend le chrome natif (fond des boutons de fenêtre macOS, menus
// contextuels natifs, dialogues systèmes) clair alors que tout le contenu web est sombre —
// contraste visuel cassé exactement à la frontière entre les deux. Même intention que
// `"theme": "Dark"` dans l'ancien tauri.conf.json ; voir aussi le `<meta name="color-scheme">`
// dans index.html pour la partie rendue par le moteur web lui-même (scrollbars/contrôles
// natifs par défaut, indépendante de ce réglage).
nativeTheme.themeSource = "dark";

// Icône de fenêtre/barre des tâches Windows/Linux uniquement. Sur macOS, AUCUNE icône n'est imposée
// à l'exécution : celle du Dock, de Cmd+Tab et du panneau « À propos » vient du bundle, compilée
// depuis build/Resonia.icon (Assets.car, voir electron-builder.yml) — la seule source qui porte
// les effets Liquid Glass (reflets, variantes claire/sombre/teintée). Une image PNG passée à
// `dock.setIcon`/`iconPath` la remplaçait par une version plate.
const isMac = process.platform === "darwin";
const APP_ICON_PNG = isMac ? undefined : join(app.getAppPath(), "build", "icons", "128x128@2x.png");

// Panneau "À propos de Resonia" natif (menu Resonia > À propos, voir `installApplicationMenu` —
// `role: "appMenu"` le câble automatiquement à cet item). `app.getVersion()` lit la version
// injectée par electron-builder à l'empaquetage (champ "version" de package.json) — même
// source que celle synchronisée par scripts/set-version.mjs pour l'ancien build Tauri, donc
// identique à ce qu'affichait tauri.conf.json.
app.setAboutPanelOptions({
  applicationName: "Resonia",
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  ...(APP_ICON_PNG ? { iconPath: APP_ICON_PNG } : {}),
  copyright: "Copyright © Resonia",
});

// Défensif seulement : sous Electron, le backend audio Linux de Chromium (PulseAudio direct,
// contrairement à GStreamer côté WebKitGTK de l'ancien shell Tauri) peut lui aussi consulter
// cette variable pour dimensionner son tampon de sortie face à PipeWire. Les deux autres
// workarounds Tauri (WEBKIT_DISABLE_DMABUF_RENDERER, GTK_THEME) n'ont plus de sens ici — pas
// de WebKitGTK, pas de widgets GTK natifs à thémer sous Electron.
if (process.platform === "linux" && !process.env["PULSE_LATENCY_MSEC"]) {
  process.env["PULSE_LATENCY_MSEC"] = "60";
}

// Une connexion HTTP/1.1 par requête au lieu d'un seul tuyau HTTP/2 (ou QUIC/HTTP/3, annoncé par
// beaucoup de reverse proxies via `alt-svc`) partagé par TOUTES les requêtes vers le serveur. Mesuré
// sur une instance Navidrome derrière un proxy qui plafonne le débit PAR CONNEXION (~55 Ko/s) :
// en HTTP/2, flux audio, pochettes, API et préchargement se partageaient ces 55 Ko/s — l'AAC 256
// (32 Ko/s) calait dès qu'une grille de pochettes se chargeait, et chaque pochette attendait son
// tour. En HTTP/1.1, Chromium ouvre jusqu'à 6 connexions par hôte, chacune avec son propre débit :
// le flux de lecture garde la sienne. Coût : une poignée de main TLS par connexion ouverte, amortie
// par le keep-alive. Doit être posé avant `app.whenReady()` (lu au démarrage du service réseau).
app.commandLine.appendSwitch("disable-http2");
app.commandLine.appendSwitch("disable-quic");

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

// ---- Instance unique : la seconde tentative de lancement réactive la fenêtre existante
// plutôt que d'ouvrir une seconde instance (même comportement que tauri_plugin_single_instance).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });
}

// ---- État de fenêtre persistant (taille/position/maximisation) ----
interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const DEFAULT_WINDOW_STATE: WindowState = { width: 1280, height: 800, maximized: false };

function windowStatePath(): string {
  return join(app.getPath("userData"), "window-state.json");
}

async function loadWindowState(): Promise<WindowState> {
  try {
    const raw = JSON.parse(await readFile(windowStatePath(), "utf8")) as WindowState;
    // Une position hors de tout écran actuellement connu (moniteur externe débranché depuis
    // la dernière session) rendrait la fenêtre inatteignable : on retombe alors sur le
    // centrage par défaut plutôt que de piéger l'utilisateur derrière une fenêtre invisible.
    if (raw.x !== undefined && raw.y !== undefined) {
      const onKnownDisplay = screen
        .getAllDisplays()
        .some(
          (d) =>
            raw.x! >= d.bounds.x &&
            raw.x! < d.bounds.x + d.bounds.width &&
            raw.y! >= d.bounds.y &&
            raw.y! < d.bounds.y + d.bounds.height,
        );
      if (!onKnownDisplay) {
        delete raw.x;
        delete raw.y;
      }
    }
    return { ...DEFAULT_WINDOW_STATE, ...raw };
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
}

let saveWindowStateTimer: NodeJS.Timeout | null = null;
function scheduleSaveWindowState() {
  if (!mainWindow || saveWindowStateTimer) return;
  saveWindowStateTimer = setTimeout(() => {
    saveWindowStateTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const bounds = mainWindow.getBounds();
    const state: WindowState = { ...bounds, maximized: mainWindow.isMaximized() };
    void writeFile(windowStatePath(), JSON.stringify(state)).catch(() => {});
  }, 500);
}

/** N'ouvre dans le navigateur système QUE des liens http(s) — jamais tel quel une URL arbitraire
 *  (voir `setWindowOpenHandler`/`will-navigate` ci-dessous) : `shell.openExternal` délègue au
 *  gestionnaire de protocole par défaut de l'OS, et un schéma non http(s) piloté par un contenu
 *  distant (lien dans une page de paroles, réponse d'un serveur Navidrome compromis...) pourrait
 *  y déclencher autre chose qu'une simple ouverture de navigateur (exécution d'un gestionnaire de
 *  protocole tiers enregistré sur la machine). */
function openExternalIfHttp(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) void shell.openExternal(url);
}

async function createWindow() {
  const state = await loadWindowState();

  mainWindow = new BrowserWindow({
    title: "Resonia",
    // Windows/Linux : icône de fenêtre/barre des tâches. macOS : non définie, voir APP_ICON_PNG.
    ...(APP_ICON_PNG ? { icon: APP_ICON_PNG } : {}),
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0C0B0A",
    // Affiché seulement sur "ready-to-show" : évite le flash blanc / la peinture
    // supplémentaire d'une fenêtre visible avant que le renderer ait quoi que ce soit à montrer.
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Le vérificateur orthographique de Chromium tourne dans un process utilitaire à part
      // et consomme CPU/RAM en continu — inutile pour une UI qui n'a pas de champ de texte
      // libre significatif (recherche, noms de playlist).
      spellcheck: false,
      // Lecteur de musique : la fenêtre est souvent masquée (fermer = masquer sur macOS) ou
      // derrière d'autres pendant l'écoute. Le bridage d'arrière-plan de Chromium y retardait
      // timers et callbacks (reprise du contexte audio, préchargement, enchaînement de piste)
      // jusqu'à faire attendre ou caler la lecture. Sans coût au repos : le renderer n'a plus
      // aucun timer périodique hors lecture.
      backgroundThrottling: false,
      devTools: isDev,
    },
  });

  if (state.maximized) mainWindow.maximize();

  // Filet de sécurité permanent, pas seulement un diagnostic ponctuel : une erreur dans le
  // preload (contextBridge, IPC...) est normalement invisible en production — `devTools` y est
  // désactivé (voir plus haut), et l'erreur n'atterrit que dans la console DevTools du
  // renderer, jamais dans les logs du process principal. Sans elle, un preload cassé se
  // manifeste uniquement comme "l'app ne se comporte pas comme une app de bureau" (cache,
  // réglages desktop...) sans aucune piste exploitable.
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("[preload] échec de chargement :", preloadPath, error);
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("resize", scheduleSaveWindowState);
  mainWindow.on("move", scheduleSaveWindowState);

  // ---- Durcissement navigation (checklist sécurité Electron : "Disable or limit navigation" /
  // "Disable or limit creation of new windows") — l'app n'a jamais besoin de naviguer hors de son
  // propre index.html (SPA, React Router en history API, jamais une vraie navigation) ni
  // d'ouvrir de fenêtre enfant : tout ce qui déclencherait l'un ou l'autre est soit une action
  // utilisateur légitime (lien externe dans les paroles, le changelog de mise à jour...), qu'on
  // ouvre dans le navigateur système, soit un comportement qu'on ne veut jamais autoriser. ----
  const appUrl = process.env["ELECTRON_RENDERER_URL"] ?? `file://${join(__dirname, "../renderer/index.html")}`;
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url === appUrl) return; // rechargement de la page elle-même, inoffensif
    event.preventDefault();
    openExternalIfHttp(url);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfHttp(url);
    return { action: "deny" };
  });

  // Comportement natif macOS : fermer la fenêtre la masque (l'app reste dans le Dock, la
  // lecture continue) plutôt que de quitter — seul Cmd+Q (before-quit) quitte réellement.
  mainWindow.on("close", (e) => {
    if (process.platform === "darwin" && !isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    await mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// Délai au-delà duquel une fermeture demandée est FORCÉE. Une fermeture normale prend une fraction
// de seconde ; si un process enfant (renderer, GPU, audio) est planté ou figé, Electron peut sinon
// attendre indéfiniment sa réponse — l'app « ne répond plus » et le process principal tourne à vide
// en saturant un cœur, jusqu'à un arrêt forcé depuis le Moniteur d'activité.
const QUIT_WATCHDOG_MS = 4000;
let quitWatchdog: NodeJS.Timeout | null = null;

app.on("before-quit", () => {
  isQuitting = true;
  quitWatchdog ??= setTimeout(() => {
    console.warn("[app] Fermeture bloquée — arrêt forcé");
    app.exit(0);
  }, QUIT_WATCHDOG_MS);
});

/** Les fichiers de l'app sont-ils encore lisibles ? Faux si elle a été lancée depuis un volume qui
 *  vient d'être éjecté ou déconnecté (disque externe, image disque montée) : le système ne peut
 *  alors plus relire le code des process, qui plantent tous (SIGBUS) — rien ne peut plus
 *  fonctionner, ni même se fermer proprement. */
function appBundleReachable(): boolean {
  try {
    return existsSync(app.getAppPath());
  } catch {
    return false;
  }
}

// Process enfant planté : si c'est parce que l'app elle-même est devenue illisible, quitter tout de
// suite plutôt que de laisser le process principal tourner à vide (CPU saturé).
app.on("child-process-gone", (_event, details) => {
  if (details.reason === "clean-exit") return;
  console.error("[app] Process enfant arrêté :", details.type, details.reason, details.exitCode);
  if (!appBundleReachable()) app.exit(1);
});
app.on("render-process-gone", (_event, _webContents, details) => {
  if (details.reason === "clean-exit") return;
  console.error("[app] Renderer arrêté :", details.reason, details.exitCode);
  if (isQuitting) app.exit(0);
  else if (!appBundleReachable()) app.exit(1);
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (mainWindow) mainWindow.show();
  else void createWindow();
});

/** Sans menu applicatif explicite, macOS affiche en gras dans la barre de menu le nom du
 *  BUNDLE réel (`Electron.app` tel que téléchargé dans node_modules en dev — jamais renommé
 *  tant qu'aucun build electron-builder n'a produit un vrai `Resonia.app` distinct), pas
 *  `app.name` : `app.setName("Resonia")` seul ne suffit pas à corriger ce titre-là (il corrige
 *  en revanche `app.getPath(...)`, déjà vérifié). `role: "appMenu"` reconstruit tout le menu
 *  standard macOS (À propos/Services/Masquer/Quitter) avec le libellé explicite ci-dessous —
 *  c'est CE menu, pas `app.setName`, qui pilote le titre affiché. `editMenu`/`windowMenu`
 *  restaurent Cmd+C/V/Z et le sous-menu Fenêtre qu'un menu personnalisé fait perdre par
 *  défaut (utiles même sans champ de texte riche : recherche, renommage de playlist). Sans
 *  effet sur Windows/Linux (pas de barre de menu globale équivalente) — les mêmes icônes de
 *  fenêtre/barre des tâches posées plus haut suffisent là-bas. */
function installApplicationMenu() {
  if (process.platform !== "darwin") {
    // Pas de barre de menu native sur Windows/Linux : le chrome de l'app est entièrement
    // custom (voir PlayerSectionRight.tsx et consorts, façon Spotify) — le menu par défaut
    // d'Electron (Fichier/Édition/Affichage/Fenêtre générique, DevTools...) n'a aucune action
    // utile ici et ne fait qu'ajouter une barre visuelle hors design + un peu de mémoire pour
    // rien.
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: "Resonia", role: "appMenu" },
      { role: "editMenu" },
      { role: "windowMenu" },
    ]),
  );
}

void app.whenReady().then(() => {
  installApplicationMenu();

  // Checklist sécurité Electron ("Verify permission requests"/"Enable Sandboxing") : l'app n'a
  // besoin d'aucune permission navigateur (caméra, micro, géoloc, notifications...) — refuser
  // tout par défaut plutôt que de laisser Chromium afficher sa boîte de dialogue native pour une
  // demande qui, de toute façon, n'a aucun code côté renderer prêt à exploiter l'accord.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  registerIpcHandlers();
  void createWindow();
});

// ==================== IPC ====================

type DesktopBaseDir = "appCache" | "appData";

function resolveBaseDir(baseDir: DesktopBaseDir): string {
  // Electron n'expose pas de répertoire "cache" OS dédié via `app.getPath` (contrairement à
  // `BaseDirectory.AppCache` côté plugin Tauri `fs`, résolu vers `~/Library/Caches/...` etc.) —
  // seuls des noms fixes comme `userData`/`temp` existent. Un sous-dossier `Cache` sous
  // `userData` (déjà namespacé par app) est le choix pragmatique le plus portable ; Electron
  // lui-même y range son propre cache réseau (`Cache`/`GPUCache`) selon le même principe. Pas
  // purgé automatiquement par l'OS comme le serait un vrai dossier cache système — le budget/
  // LRU applicatif (cacheStore.ts) reste donc l'unique garde-fou contre une croissance illimitée,
  // exactement comme c'était déjà le cas côté Tauri en pratique.
  return baseDir === "appData" ? app.getPath("userData") : join(app.getPath("userData"), "Cache");
}

function resolvePath(baseDir: DesktopBaseDir, relativePath: string): string {
  return join(resolveBaseDir(baseDir), relativePath);
}

function registerIpcHandlers() {
  ipcMain.handle("app:getVersion", () => app.getVersion());

  // ---- store clé/valeur (paramètres, pitch, etc.) — équivalent de tauri-plugin-store ----
  const storePath = join(app.getPath("userData"), "resonia-storage.json");
  let storeData: Record<string, unknown> | null = null;
  let storeSaveTimer: NodeJS.Timeout | null = null;

  async function loadStoreData(): Promise<Record<string, unknown>> {
    if (storeData) return storeData;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(await readFile(storePath, "utf8"));
    } catch {
      parsed = {};
    }
    // Une lecture synchrone (`store:getSync`) a pu charger le fichier pendant l'attente : la garder,
    // sans quoi les écritures faites entre-temps sur cette copie seraient perdues.
    storeData ??= parsed;
    return storeData;
  }

  // Débounce : le cache audio persiste ses métadonnées à chaque chunk téléchargé (~256 Ko) —
  // sans lui, chaque écriture sérialiserait + réécrirait le fichier de stockage partagé en
  // entier, gelant l'UI en téléchargement actif (même raison que côté Tauri, voir l'ancien
  // tauriStoreAdapter.ts).
  function scheduleStoreSave() {
    if (storeSaveTimer) return;
    storeSaveTimer = setTimeout(() => {
      storeSaveTimer = null;
      void writeFile(storePath, JSON.stringify(storeData)).catch(() => {});
    }, 1000);
  }

  // Écriture en attente (débounce d'1 s ci-dessus) faite tout de suite à la fermeture : sans ça, les
  // derniers réglages/métadonnées modifiés juste avant de quitter étaient perdus.
  app.on("will-quit", () => {
    if (!storeSaveTimer || !storeData) return;
    clearTimeout(storeSaveTimer);
    storeSaveTimer = null;
    try {
      writeFileSync(storePath, JSON.stringify(storeData));
    } catch {
      /* disque indisponible : rien de plus à faire à la fermeture */
    }
  });

  ipcMain.handle("store:get", async (_e, key: string) => (await loadStoreData())[key] ?? null);
  // Lecture synchrone au démarrage du renderer (voir `getSync` dans le preload). Le fichier est
  // lu ici de façon synchrone s'il ne l'a pas encore été : quelques Ko, une seule fois.
  ipcMain.on("store:getSync", (event, key: string) => {
    if (!storeData) {
      try {
        storeData = JSON.parse(readFileSync(storePath, "utf8"));
      } catch {
        storeData = {};
      }
    }
    event.returnValue = storeData![key] ?? null;
  });
  ipcMain.handle("store:set", async (_e, key: string, value: unknown) => {
    const data = await loadStoreData();
    data[key] = value;
    scheduleStoreSave();
  });
  ipcMain.handle("store:remove", async (_e, key: string) => {
    const data = await loadStoreData();
    delete data[key];
    scheduleStoreSave();
  });

  // ---- blob store fs (cache audio + téléchargements) — équivalent de tauri-plugin-fs ----
  const openHandles = new Map<number, FileHandle>();
  let nextHandleId = 1;

  async function openForWrite(filePath: string): Promise<FileHandle> {
    // `create: true` sans troncature côté Tauri se traduit ici par : ouvrir en lecture/
    // écriture si le fichier existe déjà (reprise de téléchargement), sinon le créer. `a+`
    // n'est PAS utilisable pour une écriture positionnée (O_APPEND ignore la position fournie
    // sous Linux) — d'où ce essai/repli plutôt qu'un flag unique.
    try {
      return await fsOpen(filePath, "r+");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return fsOpen(filePath, "w+");
      throw err;
    }
  }

  ipcMain.handle("blobstore:open", async (_e, baseDir: DesktopBaseDir, relativePath: string) => {
    const filePath = resolvePath(baseDir, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    const handle = await openForWrite(filePath);
    const id = nextHandleId++;
    openHandles.set(id, handle);
    return id;
  });
  ipcMain.handle("blobstore:write", async (_e, handleId: number, position: number, data: Uint8Array) => {
    const handle = openHandles.get(handleId);
    if (!handle) throw new Error("blobstore: descripteur de fichier inconnu");
    await handle.write(data, 0, data.byteLength, position);
  });
  ipcMain.handle("blobstore:close", async (_e, handleId: number) => {
    const handle = openHandles.get(handleId);
    openHandles.delete(handleId);
    await handle?.close();
  });
  ipcMain.handle("blobstore:stat", async (_e, baseDir: DesktopBaseDir, relativePath: string) => {
    try {
      const info = await stat(resolvePath(baseDir, relativePath));
      return { size: info.size };
    } catch {
      return null;
    }
  });
  ipcMain.handle("blobstore:readFile", async (_e, baseDir: DesktopBaseDir, relativePath: string) => {
    try {
      return await readFile(resolvePath(baseDir, relativePath));
    } catch {
      return null;
    }
  });
  ipcMain.handle("blobstore:remove", async (_e, baseDir: DesktopBaseDir, relativePath: string) => {
    try {
      await unlink(resolvePath(baseDir, relativePath));
    } catch {
      /* déjà absent, rien à faire */
    }
  });

  // ---- fetch non soumis au CORS du renderer — équivalent de tauri-plugin-http. Utilisé par
  // le cache de pochettes, les paroles (LRCLIB), les pochettes animées (API m8tec) et le test
  // de connectivité des réglages : certains hôtes tiers ne renvoient pas d'en-tête CORS pour
  // notre origine. `net.fetch` tourne sur la pile réseau du process principal, jamais soumise
  // à la politique CORS d'un contexte renderer. ----
  ipcMain.handle(
    "net:fetch",
    async (_e, url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
      // `net.fetch` tourne dans le process principal, privilégié : sans cette validation, un
      // renderer compromis (XSS via une réponse serveur, des paroles ou une pochette animée
      // malveillantes) pourrait demander la lecture d'un `file://` arbitraire sur la machine et
      // en récupérer le contenu via cet IPC — jamais possible depuis un `fetch()` sandboxé du
      // renderer lui-même, mais ce pont contourne justement cette protection par conception
      // (c'est son but pour http/https). On ne l'autorise donc que pour http/https.
      if (!/^https?:\/\//i.test(url)) {
        throw new Error(`net:fetch refuse un schéma non http(s) : ${url}`);
      }
      const res = await net.fetch(url, {
        method: init?.method,
        headers: init?.headers,
        body: init?.body,
      });
      const body = Buffer.from(await res.arrayBuffer());
      return {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        headers: Object.fromEntries(res.headers.entries()),
        body,
      };
    },
  );

  // ---- Téléchargements du cache audio (voir BlobStore.download côté renderer). Faits ici plutôt que
  // dans le renderer pour trois raisons, toutes mesurées sur un serveur Navidrome derrière un proxy
  // qui plafonne le débit PAR CONNEXION (~50 Ko/s) :
  //   - session réseau dédiée → son propre groupe de connexions : Chromium n'en ouvre que 6 par hôte
  //     et par session, celles du renderer restent libres pour la lecture et les pochettes ;
  //   - plusieurs plages téléchargées en parallèle (quand le serveur répond 206 avec une taille
  //     exacte, typiquement le fichier original) : les débits par connexion s'additionnent ;
  //   - écriture directe à la bonne position du fichier : aucun octet ne traverse l'IPC. ----
  const DOWNLOAD_SEGMENTS = 3;
  const MIN_SEGMENT_BYTES = 1024 * 1024;
  const DOWNLOAD_STALL_TIMEOUT_MS = 20_000;
  const DOWNLOAD_MAX_RETRIES = 3;
  const DOWNLOAD_PROGRESS_INTERVAL_MS = 250;
  // Connexion lente : mesuré sur un serveur réel, environ une connexion TCP sur sept à dix tombe à
  // ~40-50 Ko/s au lieu de 0,4 à 1,4 Mo/s, et le reste. Après SLOW_CHECK_AFTER_MS de réception,
  // une plage nettement plus lente que le meilleur débit déjà vu sur ce serveur est relancée :
  // interrompre une réponse HTTP/1.1 en cours ferme sa socket, la reprise part sur une autre.
  const SLOW_CHECK_AFTER_MS = 3000;
  const SLOW_MAX_BYTES_PER_SEC = 128 * 1024;
  const SLOW_RATIO = 4;
  const MAX_SLOW_RECONNECTS = 2;
  // Meilleur débit observé par hôte (octets/s) — référence pour juger une connexion lente sans
  // jamais boucler sur un serveur simplement lent partout.
  const bestRateByHost = new Map<string, number>();

  class SlowConnectionError extends Error {
    constructor(rate: number) {
      super(`Connexion lente (${Math.round(rate / 1024)} Ko/s), relance sur une autre connexion`);
    }
  }

  let downloadSession: Electron.Session | null = null;
  const getDownloadSession = () => (downloadSession ??= session.fromPartition("resonia-downloads"));
  const activeDownloads = new Map<number, AbortController>();
  // Pause douce (voir SuspendSignal côté renderer) : les réponses de ces téléchargements ne sont
  // plus lues — le contrôle de flux TCP fait cesser l'envoi côté serveur — sans fermer les
  // connexions ni perdre les plages en cours. Peut arriver avant `download:run` (même ordre IPC).
  const suspendedDownloads = new Set<number>();
  const resumeWaiters = new Map<number, Set<() => void>>();

  class DownloadHttpError extends Error {
    readonly status: number;
    constructor(status: number) {
      super(`Requête de flux échouée (${status})`);
      this.status = status;
    }
  }

  interface DownloadSegment {
    start: number;
    end: number; // exclusif ; Infinity tant que la taille est inconnue
    done: number;
  }

  function isRetryable(err: unknown): boolean {
    if (err instanceof DownloadHttpError) return err.status >= 500 || err.status === 408 || err.status === 429;
    return true;
  }

  function sleepUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error("aborted"));
      const timer = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      }, { once: true });
    });
  }

  async function runDownload(
    id: number,
    opts: { baseDir: DesktopBaseDir; path: string; url: string; from: number; maxSegments?: number },
    sendProgress: (bytes: number, total: number, received: number) => void,
  ): Promise<{ complete: boolean; bytes: number; total: number; error: string | null }> {
    // Même garde que `net:fetch` : ce process est privilégié, jamais de schéma autre que http(s).
    if (!/^https?:\/\//i.test(opts.url)) throw new Error("download:run refuse un schéma non http(s)");
    if (opts.baseDir !== "appCache" && opts.baseDir !== "appData") throw new Error("download:run : dossier inconnu");

    const userAbort = new AbortController();
    activeDownloads.set(id, userAbort);
    // Annule aussi les autres plages dès qu'une échoue définitivement.
    const internal = new AbortController();
    userAbort.signal.addEventListener("abort", () => internal.abort(), { once: true });

    const filePath = resolvePath(opts.baseDir, opts.path);
    await mkdir(dirname(filePath), { recursive: true });
    const fh = await openForWrite(filePath);
    // Plages parallèles d'un run précédent interrompu : tout ce qui suit le point de reprise
    // (préfixe contigu, voir TrackDownloader.resumePosition) peut contenir des trous — on le jette
    // pour que la taille du fichier ne soit jamais prise pour une progression réelle.
    await fh.truncate(opts.from);

    /** Attend la fin d'une pause douce ; rejette si le téléchargement est annulé entre-temps. */
    function waitWhileSuspended(): Promise<void> {
      if (!suspendedDownloads.has(id)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        let waiters = resumeWaiters.get(id);
        if (!waiters) resumeWaiters.set(id, (waiters = new Set()));
        const onAbort = () => {
          waiters!.delete(wake);
          reject(new Error("aborted"));
        };
        const wake = () => {
          internal.signal.removeEventListener("abort", onAbort);
          resolve();
        };
        waiters.add(wake);
        if (internal.signal.aborted) onAbort();
        else internal.signal.addEventListener("abort", onAbort, { once: true });
      });
    }

    let total = -1;
    let segments: DownloadSegment[] = [{ start: opts.from, end: Infinity, done: 0 }];
    let received = 0;
    let lastProgressAt = 0;

    // Point de reprise : octets contigus écrits depuis le début du fichier.
    const contiguous = () => {
      let pos = opts.from;
      for (const seg of segments) {
        if (seg.start > pos) break;
        pos = Math.max(pos, seg.start + seg.done);
        if (seg.start + seg.done < seg.end) break;
      }
      return pos;
    };
    const report = (force = false) => {
      const now = Date.now();
      if (!force && now - lastProgressAt < DOWNLOAD_PROGRESS_INTERVAL_MS) return;
      lastProgressAt = now;
      sendProgress(contiguous(), total, received);
      received = 0;
    };

    /** Une requête, avec délai d'inactivité réarmé à chaque morceau reçu. */
    async function request(range: string) {
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      internal.signal.addEventListener("abort", onAbort, { once: true });
      if (internal.signal.aborted) ctrl.abort();
      let stalled = false;
      let timer: NodeJS.Timeout | null = null;
      const arm = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          stalled = true;
          ctrl.abort();
        }, DOWNLOAD_STALL_TIMEOUT_MS);
      };
      const disarm = () => {
        if (timer) clearTimeout(timer);
        timer = null;
      };
      const dispose = () => {
        disarm();
        internal.signal.removeEventListener("abort", onAbort);
      };
      try {
        await waitWhileSuspended();
      } catch (err) {
        dispose();
        throw err;
      }
      arm();
      try {
        const res = await getDownloadSession().fetch(opts.url, { headers: { Range: range }, signal: ctrl.signal });
        return { res, arm, disarm, dispose, stalled: () => stalled };
      } catch (err) {
        dispose();
        throw stalled ? new Error("Délai réseau dépassé") : err;
      }
    }

    /** Lit le corps et l'écrit à la position de la plage, jusqu'à sa fin (ou celle du flux).
     *  `skip` : octets à ignorer en tête (serveur qui a ignoré la plage demandée et répond 200). */
    const host = new URL(opts.url).host;

    async function pump(
      req: Awaited<ReturnType<typeof request>>,
      seg: DownloadSegment,
      skip: number,
      mayReconnect: boolean,
    ): Promise<"eof" | "limit"> {
      if (!req.res.body) throw new Error("Réponse sans corps");
      const reader = req.res.body.getReader();
      // Fenêtre de mesure du débit (voir SLOW_CHECK_AFTER_MS), remise à zéro après une pause.
      let windowStart = Date.now();
      let windowBytes = 0;
      let rateChecked = !mayReconnect;
      // Plage terminée avant la fenêtre de mesure (connexion rapide) : son débit sert quand même de
      // référence.
      const recordRate = () => {
        const elapsed = Date.now() - windowStart;
        if (elapsed < 500 || windowBytes === 0) return;
        const rate = (windowBytes * 1000) / elapsed;
        if (rate > (bestRateByHost.get(host) ?? 0)) bestRateByHost.set(host, rate);
      };
      try {
        for (;;) {
          let result: Awaited<ReturnType<typeof reader.read>>;
          if (suspendedDownloads.has(id)) {
            // Pas de délai d'inactivité pendant une pause volontaire.
            req.disarm();
            await waitWhileSuspended();
            req.arm();
            windowStart = Date.now();
            windowBytes = 0;
          }
          try {
            result = await reader.read();
          } catch (err) {
            throw req.stalled() ? new Error("Délai réseau dépassé") : err;
          }
          req.arm();
          if (result.done) {
            recordRate();
            return "eof";
          }
          let chunk = result.value;
          if (skip > 0) {
            const dropped = Math.min(skip, chunk.byteLength);
            skip -= dropped;
            chunk = chunk.subarray(dropped);
          }
          const remaining = seg.end - (seg.start + seg.done);
          if (chunk.byteLength > remaining) chunk = chunk.subarray(0, remaining);
          if (chunk.byteLength > 0) {
            await fh.write(chunk, 0, chunk.byteLength, seg.start + seg.done);
            seg.done += chunk.byteLength;
            received += chunk.byteLength;
            windowBytes += chunk.byteLength;
            report();
          }
          const elapsed = Date.now() - windowStart;
          if (!rateChecked && elapsed >= SLOW_CHECK_AFTER_MS && seg.start + seg.done < seg.end) {
            rateChecked = true;
            const rate = (windowBytes * 1000) / elapsed;
            const best = bestRateByHost.get(host) ?? 0;
            if (rate > best) bestRateByHost.set(host, rate);
            // Débit de référence inconnu : une seule relance exploratoire (voir runSegment).
            if (rate < SLOW_MAX_BYTES_PER_SEC && (best === 0 || rate * SLOW_RATIO < best)) {
              void reader.cancel().catch(() => {});
              throw new SlowConnectionError(rate);
            }
          }
          if (seg.start + seg.done >= seg.end) {
            recordRate();
            void reader.cancel().catch(() => {});
            return "limit";
          }
        }
      } finally {
        req.dispose();
      }
    }

    async function runSegment(seg: DownloadSegment, initial?: Awaited<ReturnType<typeof request>>) {
      let attempt = 0;
      let slowReconnects = 0;
      let pending = initial;
      while (seg.start + seg.done < seg.end) {
        const doneBefore = seg.done;
        try {
          const from = seg.start + seg.done;
          const req = pending ?? (await request(seg.end === Infinity ? `bytes=${from}-` : `bytes=${from}-${seg.end - 1}`));
          pending = undefined;
          const { status } = req.res;
          if (status === 416) {
            req.dispose();
            if (seg.end !== Infinity) throw new DownloadHttpError(416);
            seg.end = from; // plus rien à lire : fin normale
            break;
          }
          if (status !== 200 && status !== 206) {
            req.dispose();
            throw new DownloadHttpError(status);
          }
          // Flux transcodé (200, plages ignorées) : une relance repartirait de l'octet 0 et
          // relancerait le transcodage — on ne relance que les réponses partielles (206).
          const mayReconnect =
            status === 206 && slowReconnects < MAX_SLOW_RECONNECTS && (slowReconnects === 0 || (bestRateByHost.get(host) ?? 0) > 0);
          const outcome = await pump(req, seg, status === 200 ? from : 0, mayReconnect);
          if (outcome === "eof") {
            if (seg.end === Infinity) seg.end = seg.start + seg.done; // taille révélée par la fin du flux
            else if (seg.start + seg.done < seg.end) throw new Error("Flux interrompu avant la fin de la plage");
          }
        } catch (err) {
          if (internal.signal.aborted) throw err;
          if (err instanceof SlowConnectionError) {
            slowReconnects++;
            continue; // relance immédiate, sur une nouvelle connexion
          }
          if (seg.done > doneBefore) attempt = 0; // seuls des échecs consécutifs comptent
          if (!isRetryable(err) || attempt >= DOWNLOAD_MAX_RETRIES) throw err;
          attempt++;
          await sleepUnlessAborted(500 * 2 ** (attempt - 1), internal.signal);
        }
      }
    }

    try {
      const first = await request(`bytes=${opts.from}-`);
      const contentRange = first.res.headers.get("content-range");
      const announced = first.res.status === 206 && contentRange ? Number(contentRange.split("/")[1]) : NaN;
      if (Number.isFinite(announced) && announced > opts.from) {
        // Taille exacte et plages acceptées : découpage en plages parallèles.
        total = announced;
        const remaining = total - opts.from;
        const maxSegments = Math.max(1, Math.min(DOWNLOAD_SEGMENTS, Math.floor(opts.maxSegments ?? DOWNLOAD_SEGMENTS)));
        const count = Math.max(1, Math.min(maxSegments, Math.floor(remaining / MIN_SEGMENT_BYTES)));
        const size = Math.ceil(remaining / count);
        segments = Array.from({ length: count }, (_, i) => ({
          start: opts.from + i * size,
          end: Math.min(total, opts.from + (i + 1) * size),
          done: 0,
        }));
        await Promise.all(segments.map((seg, i) => runSegment(seg, i === 0 ? first : undefined)));
      } else {
        // 200 (fichier transcodé à la volée, plages ignorées), 416 ou taille inconnue : séquentiel.
        await runSegment(segments[0], first);
      }
      const bytes = contiguous();
      if (total < 0) total = bytes;
      report(true);
      return { complete: bytes >= total, bytes, total, error: null };
    } catch (err) {
      internal.abort();
      return {
        complete: false,
        bytes: contiguous(),
        total,
        error: userAbort.signal.aborted ? null : (err as Error).message ?? String(err),
      };
    } finally {
      activeDownloads.delete(id);
      suspendedDownloads.delete(id);
      resumeWaiters.delete(id);
      await fh.close().catch(() => {});
    }
  }

  ipcMain.handle(
    "download:run",
    (event, id: number, opts: { baseDir: DesktopBaseDir; path: string; url: string; from: number; maxSegments?: number }) =>
      runDownload(id, opts, (bytes, total, received) => {
        if (!event.sender.isDestroyed()) event.sender.send("download:progress", id, bytes, total, received);
      }),
  );
  ipcMain.on("download:abort", (_e, id: number) => activeDownloads.get(id)?.abort());
  ipcMain.on("download:suspend", (_e, id: number, suspended: boolean) => {
    if (suspended) {
      suspendedDownloads.add(id);
      return;
    }
    suspendedDownloads.delete(id);
    const waiters = resumeWaiters.get(id);
    resumeWaiters.delete(id);
    waiters?.forEach((wake) => wake());
  });

  // ---- powerSaveBlocker : n'empêche que la mise en veille de L'APP (pas l'écran), tenu
  // uniquement pendant une lecture active — jamais en idle. Démarré/arrêté par le renderer
  // sur les événements de lecture réels du moteur gapless (voir gaplessEngine.ts). ----
  let powerSaveBlockerId: number | null = null;
  ipcMain.handle("powersave:start", () => {
    if (powerSaveBlockerId === null) powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  });
  ipcMain.handle("powersave:stop", () => {
    if (powerSaveBlockerId !== null) {
      powerSaveBlocker.stop(powerSaveBlockerId);
      powerSaveBlockerId = null;
    }
  });

  // ---- electron-updater : vérifie/télécharge/installe les mises à jour depuis les releases
  // GitHub — remplace l'ancien mécanisme Tauri (commande Rust check_for_update + minisign).
  // `autoDownload`/`autoInstallOnAppQuit` à false : le téléchargement et l'installation
  // restent entièrement pilotés par l'utilisateur via l'UI (voir UpdateNotifier.tsx), jamais
  // en arrière-plan silencieux — même comportement observable qu'avant (vérif au lancement si
  // le réglage est activé, installation seulement après téléchargement complet confirmé). ----
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update:progress", Math.round(progress.percent));
  });
  autoUpdater.on("error", (err) => {
    console.error("[updater] Erreur electron-updater", err);
  });

  ipcMain.handle(
    "update:check",
    async (_e, beta: boolean): Promise<{ version: string; currentVersion: string; notes: string | null } | null> => {
      // Canal choisi à l'exécution (réglage utilisateur) — même intention que le double
      // endpoint stable/beta de l'ancien tauri.conf.json/tauri.beta.conf.json, mais un seul
      // mécanisme ici : le canal change simplement quelle release GitHub est ciblée (voir
      // electron-builder.yml — les releases beta y sont marquées prerelease).
      autoUpdater.channel = beta ? "beta" : "latest";
      autoUpdater.allowPrerelease = beta;
      try {
        const result = await autoUpdater.checkForUpdates();
        if (!result || result.updateInfo.version === app.getVersion()) return null;
        const notes = result.updateInfo.releaseNotes;
        return {
          version: result.updateInfo.version,
          currentVersion: app.getVersion(),
          // `notes` provient du corps de la release GitHub, comme côté Tauri — string dans le
          // cas usuel (provider GitHub), tableau seulement pour un provider générique multi-
          // versions que ce projet n'utilise pas.
          notes: typeof notes === "string" ? notes : (notes?.[0]?.note ?? null),
        };
      } catch (err) {
        console.error("[updater] Vérification de mise à jour impossible", err);
        return null;
      }
    },
  );

  ipcMain.handle("update:download", async () => {
    await autoUpdater.downloadUpdate();
  });

  ipcMain.handle("update:install", () => {
    autoUpdater.quitAndInstall();
  });

  // ---- AirPlay (preuve de concept — voir src/lib/audio/airplay côté renderer pour le
  // prélèvement audio Web Audio -> PCM -> IPC). Découverte mDNS (_raop._tcp, le service que
  // TOUT récepteur AirPlay annonce pour la réception audio RAOP, v1 comme v2) via
  // `bonjour-service` (implémentation mDNS pure JS — fonctionne sans le service Bonjour
  // d'Apple installé, y compris sur Windows), puis envoi RAOP via
  // `@lox-audioserver/node-airplay-sender` (pure JS aussi, aucun module natif). Les deux
  // tournent forcément côté process principal : un renderer sandboxé n'a pas accès aux sockets
  // UDP/multicast bruts qu'exigent la découverte et le flux RAOP. Un seul récepteur actif à la
  // fois pour cette preuve de concept — pas de synchronisation multi-pièces. ----
  let airplayBonjour: Bonjour | null = null;
  let airplaySender: LoxAirplaySender | null = null;

  function getAirplayBonjour(): Bonjour {
    if (!airplayBonjour) {
      // `errorCallback` : sans lui, `Server` retombe sur `(err) => { throw err }` (défaut de la
      // lib) — une erreur socket (permission réseau local refusée, interface indisponible...)
      // planterait le process principal en silence côté utilisateur (aucune UI ne verrait
      // jamais l'exception). Les `warning` (échec d'ajout à un groupe multicast sur UNE
      // interface parmi plusieurs, típiquement inoffensif) ne remontent nulle part par défaut
      // dans bonjour-service : on les logge nous-mêmes sur l'EventEmitter mDNS sous-jacent pour
      // pouvoir diagnostiquer une découverte qui ne trouve rien (voir le retour utilisateur).
      airplayBonjour = new Bonjour({}, (err: unknown) => console.error("[airplay] Erreur mDNS", err));
      const rawMdns = (airplayBonjour as unknown as { server: { mdns: NodeJS.EventEmitter } }).server.mdns;
      rawMdns.on("warning", (err: unknown) => console.warn("[airplay] Avertissement mDNS", err));
      rawMdns.on("ready", () => console.log("[airplay] Socket mDNS prêt (multicast rejoint)"));
    }
    return airplayBonjour;
  }

  interface AirplayDiscovered {
    id: string;
    name: string;
    host: string;
    port: number;
  }

  ipcMain.handle("airplay:discover", async (): Promise<AirplayDiscovered[]> => {
    const bonjour = getAirplayBonjour();
    const found = new Map<string, AirplayDiscovered>();

    function displayNameFor(service: BonjourService): string {
      // Nom d'instance mDNS typique : "AABBCCDDEEFF@Salon._raop._tcp.local" — le préfixe
      // hexadécimal avant "@" est un identifiant matériel, jamais destiné à l'affichage.
      const displayName = service.name.replace(/^[0-9A-Fa-f]+@/, "");
      return displayName || service.name;
    }

    // Si le récepteur AirPlay intégré de macOS est activé (Réglages > Partage), CETTE machine
    // s'annonce elle-même en `_raop._tcp` — sans ce filtre elle apparaîtrait dans sa propre
    // liste Connect, un choix qui n'a jamais de sens (streamer vers soi-même) et qui échoue de
    // toute façon (port RAOP non écouté par le récepteur système d'Apple).
    const localAddresses = new Set(
      Object.values(networkInterfaces())
        .flat()
        .filter((iface): iface is NonNullable<typeof iface> => !!iface)
        .map((iface) => iface.address),
    );

    // `_raop._tcp` : service RAOP historique, celui dont ce client a besoin (host+port RTSP)
    // pour émettre — annoncé par tout récepteur compatible RAOP, AirPlay 1 comme 2.
    // `_airplay._tcp` : service de contrôle/découverte AirPlay 2 — certains récepteurs
    // (notamment des tiers non-Apple) n'annoncent QUE celui-ci sans `_raop._tcp` du tout ;
    // scanné en parallèle uniquement pour journaliser ce cas et aider au diagnostic (voir le
    // commentaire plus bas), jamais utilisé seul pour construire une entrée connectable — cette
    // preuve de concept ne sait parler QUE RAOP, pas le protocole de contrôle AirPlay 2 complet.
    let raopCount = 0;
    let airplayOnlyCount = 0;
    const raopBrowser = bonjour.find({ type: "raop", protocol: "tcp" }, (service: BonjourService) => {
      raopCount++;
      // `addresses` (résolu via les enregistrements A/AAAA que l'appareil publie lui-même pour
      // son propre nom d'hôte) est la source fiable — c'est ce qu'un vrai client RAOP est censé
      // utiliser (SRV -> hostname -> A/AAAA), CONTRAIREMENT à `referer.address` (l'adresse
      // SOURCE du paquet mDNS reçu, donc dépendante du chemin réseau emprunté) : avec un VPN
      // actif, ce dernier peut pointer vers l'interface du VPN plutôt que vers l'appareil réel.
      // Mais `addresses` mélange IPv4 ET IPv6 SANS ordre de préférence garanti (souvent IPv6
      // d'abord en pratique, y compris des adresses "link-local" fe80:: inutilisables telles
      // quelles) — le socket UDP du sender RAOP est IPv4 uniquement, lui envoyer une IPv6
      // échoue silencieusement en boucle (`send EINVAL`) sans jamais lever d'erreur visible côté
      // "connexion établie". On filtre donc explicitement une adresse IPv4 dans `addresses`,
      // repli sur `referer.address` seulement si l'appareil n'en publie vraiment aucune.
      const ipv4Pattern = /^\d{1,3}(\.\d{1,3}){3}$/;
      const host = service.addresses?.find((addr) => ipv4Pattern.test(addr)) ?? service.referer?.address;
      console.log("[airplay] Service _raop._tcp", service.name, {
        addresses: service.addresses,
        refererAddress: service.referer?.address,
        chosen: host,
      });
      if (!host) {
        console.warn("[airplay] Service _raop._tcp sans adresse résolue, ignoré", service.name);
        return;
      }
      if (localAddresses.has(host)) {
        console.log("[airplay] Service _raop._tcp ignoré (c'est cette machine elle-même)", service.name, host);
        return;
      }
      const id = `${host}:${service.port}`;
      found.set(id, { id, name: displayNameFor(service), host, port: service.port });
    });
    const airplayBrowser = bonjour.find({ type: "airplay", protocol: "tcp" }, () => {
      airplayOnlyCount++;
    });

    // Fenêtre de scan fixe plutôt qu'un flux d'événements continu : suffisant pour une preuve
    // de concept (le réseau local d'un utilisateur a rarement plus de quelques récepteurs), et
    // bien plus simple côté renderer (un seul aller-retour au lieu d'un abonnement à maintenir).
    await new Promise((resolve) => setTimeout(resolve, 4000));
    raopBrowser.stop();
    airplayBrowser.stop();
    console.log(
      `[airplay] Scan terminé : ${raopCount} service(s) _raop._tcp, ${airplayOnlyCount} service(s) _airplay._tcp au total.`,
    );
    return Array.from(found.values());
  });

  ipcMain.on(
    "airplay:connect",
    (_e, host: string, port: number, airplay2: boolean, initialVolume: number) => {
      airplaySender?.stop();
      airplaySender = startAirplaySender(
        {
          host,
          port,
          airplay2,
          // Sans ce champ, la lib retombe sur son propre défaut (50/100) — bien plus bas que le
          // volume réel de l'app au moment de la connexion (voir connectAirplayDevice côté
          // playerStore.ts, qui envoie le volume courant du lecteur), perçu comme "le son sort
          // très bas" alors que rien n'est cassé côté flux audio lui-même.
          volume: initialVolume,
          name: "Resonia",
          debug: true,
          // Réduit le buffer de gigue par défaut de la lib (`packets_in_buffer: 260`, ~2,1s —
          // voir son utils/config.ts) à environ 1s : coupe d'autant le délai entre une action
          // (pause, seek) côté app et son effet réel sur le récepteur. Compromis assumé : moins
          // de marge pour absorber les à-coups du réseau local, donc plus sensible à un Wi-Fi
          // chargé — à remonter si ça aggrave les micro-coupures plutôt que la latence perçue.
          config: { packets_in_buffer: 130, stream_latency: 100 },
          // Sans ce callback, TOUS les messages de diagnostic internes de la lib (code
          // d'erreur renvoyé par le récepteur, backoff, contenu du TLV de pairing...) partent
          // dans le vide — silencieux, jamais vus nulle part. Indispensable pour diagnostiquer
          // un échec de pairing AirPlay 2 (voir "pair_failed").
          log: (level, message, data) => console.log(`[airplay:sender:${level}]`, message, data ?? ""),
        },
        (event) => {
          console.log("[airplay:event]", event);
          mainWindow?.webContents.send("airplay:event", event);
        },
      );
    },
  );

  // `.on`/`ipcRenderer.send` (fire-and-forget), pas `.handle`/`invoke` : ce canal reçoit un
  // chunk PCM plusieurs fois par seconde tant qu'un flux AirPlay est actif — attendre un
  // aller-retour de promesse par chunk ajouterait une latence inutile sur le chemin audio. Pas
  // de scan par échantillon ici (retiré après diagnostic initial, voir historique) : coûteux à
  // ce rythme d'appel et sans intérêt une fois le pipeline audio validé bout en bout.
  let sendPcmCount = 0;
  ipcMain.on("airplay:sendPcm", (_e, chunk: Uint8Array) => {
    sendPcmCount++;
    if (sendPcmCount === 1 || sendPcmCount % 200 === 0) {
      console.log(`[airplay:sendPcm] appel #${sendPcmCount}, ${chunk.byteLength} octets`);
    }
    airplaySender?.sendPcm(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  });

  ipcMain.handle("airplay:setVolume", (_e, volume: number) => {
    airplaySender?.setVolume(volume);
  });

  ipcMain.handle("airplay:disconnect", () => {
    airplaySender?.stop();
    airplaySender = null;
  });

  // Vide le buffer circulaire de la lib (~2,1s d'audio bufferisés en avance pour absorber la
  // gigue réseau, voir config.ts:packets_in_buffer) sans fermer la session RTSP — appelé sur
  // pause côté playerStore.ts. Sans ça, une pause laisse ces ~2s d'audio déjà en file continuer
  // de jouer sur le récepteur (puis du silence zero-fill jusqu'à la reprise), perçu comme "le
  // son met du temps à s'arrêter".
  ipcMain.handle("airplay:reset", () => {
    airplaySender?.reset();
  });
}
