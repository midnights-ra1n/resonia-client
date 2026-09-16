import { app, BrowserWindow, Menu, ipcMain, nativeTheme, net, powerSaveBlocker, screen, session, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { Bonjour } from "bonjour-service";
import type { Service as BonjourService } from "bonjour-service";
import { start as startAirplaySender } from "@lox-audioserver/node-airplay-sender";
import type { LoxAirplaySender } from "@lox-audioserver/node-airplay-sender";
import { dirname, join } from "node:path";
import { mkdir, open as fsOpen, readFile, stat, unlink, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";

// Doit être appelé avant TOUT accès à `app.getPath(...)` (utilisé plus bas pour l'état de
// fenêtre, le store, le blob store) : sans ça, Electron dérive le nom par défaut du champ
// "name" de package.json ("@resonia/client"), ce qui produisait des dossiers de données
// utilisateur littéralement nommés "@resonia/client" (visible dans le Finder/menu Application
// Support) au lieu de "Resonia" — la même identité que l'ancien build Tauri
// (productName "Resonia", identifiant com.resonia.client dans tauri.conf.json).
app.setName("Resonia");

// Resonia n'a pas de thème clair (voir index.css — fond #0A0A0A codé en dur partout) : sans
// ça, un système en mode clair rend le chrome natif (fond des boutons de fenêtre macOS, menus
// contextuels natifs, dialogues systèmes) clair alors que tout le contenu web est sombre —
// contraste visuel cassé exactement à la frontière entre les deux. Même intention que
// `"theme": "Dark"` dans l'ancien tauri.conf.json ; voir aussi le `<meta name="color-scheme">`
// dans index.html pour la partie rendue par le moteur web lui-même (scrollbars/contrôles
// natifs par défaut, indépendante de ce réglage).
nativeTheme.themeSource = "dark";

// Icônes réutilisées telles quelles depuis l'ancien build Tauri (src-tauri/icons/), copiées
// dans build/ pour rester indépendantes de src-tauri (supprimé en fin de migration) — voir
// aussi electron-builder.yml (Phase 4) qui les reprendra pour l'empaquetage.
const APP_ICON_PNG = join(app.getAppPath(), "build", "icon.png");

// Panneau "À propos de Resonia" natif (menu Resonia > À propos, voir `installApplicationMenu` —
// `role: "appMenu"` le câble automatiquement à cet item). `app.getVersion()` lit la version
// injectée par electron-builder à l'empaquetage (champ "version" de package.json) — même
// source que celle synchronisée par scripts/set-version.mjs pour l'ancien build Tauri, donc
// identique à ce qu'affichait tauri.conf.json.
app.setAboutPanelOptions({
  applicationName: "Resonia",
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  iconPath: APP_ICON_PNG,
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
    // Sans effet sur macOS empaqueté (l'icône du Dock vient du bundle .app, voir
    // electron-builder.yml en Phase 4) mais utile en dev et sur Windows/Linux, où l'icône de
    // fenêtre/barre des tâches est bien celle-ci — mêmes fichiers que l'ancien build Tauri.
    icon: APP_ICON_PNG,
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0A0A0A",
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

app.on("before-quit", () => {
  isQuitting = true;
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
  // En dev/preview (app non empaquetée), le Dock affiche par défaut l'icône générique
  // d'Electron — pas celle de `build/icon.png`. L'imposer explicitement ici évite de confondre
  // Resonia avec n'importe quelle autre app Electron ouverte en parallèle pendant les tests.
  // Uniquement en dev : un .app packagé (electron-builder, `mac.icon`) a déjà la bonne icône de
  // Dock via son propre bundle — appeler ceci en prod n'apporterait rien.
  if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(APP_ICON_PNG);

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
    try {
      storeData = JSON.parse(await readFile(storePath, "utf8"));
    } catch {
      storeData = {};
    }
    return storeData!;
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

  ipcMain.handle("store:get", async (_e, key: string) => (await loadStoreData())[key] ?? null);
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
      const host = service.referer?.address ?? service.addresses?.[0];
      if (!host) {
        console.warn("[airplay] Service _raop._tcp sans adresse résolue, ignoré", service.name);
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
    (_e, host: string, port: number, airplay2: boolean) => {
      airplaySender?.stop();
      airplaySender = startAirplaySender({ host, port, airplay2, name: "Resonia" }, (event) => {
        mainWindow?.webContents.send("airplay:event", event);
      });
    },
  );

  // `.on`/`ipcRenderer.send` (fire-and-forget), pas `.handle`/`invoke` : ce canal reçoit un
  // chunk PCM plusieurs fois par seconde tant qu'un flux AirPlay est actif — attendre un
  // aller-retour de promesse par chunk ajouterait une latence inutile sur le chemin audio.
  ipcMain.on("airplay:sendPcm", (_e, chunk: Uint8Array) => {
    airplaySender?.sendPcm(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  });

  ipcMain.handle("airplay:setVolume", (_e, volume: number) => {
    airplaySender?.setVolume(volume);
  });

  ipcMain.handle("airplay:disconnect", () => {
    airplaySender?.stop();
    airplaySender = null;
  });
}
