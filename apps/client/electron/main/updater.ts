import { execFile, spawn } from "node:child_process";
import { accessSync, constants, existsSync, writeFileSync } from "node:fs";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { app, dialog, ipcMain, type BrowserWindow, type MessageBoxOptions } from "electron";
import { AppUpdater, autoUpdater, type ProgressInfo, type UpdateDownloadedEvent } from "electron-updater";
import type { DownloadUpdateOptions } from "electron-updater/out/AppUpdater.js";

const execFileAsync = promisify(execFile);

// ---- Mises à jour : vérification, téléchargement en arrière-plan, installation à la fermeture.
//
// Une fois téléchargée, une mise à jour s'installe d'elle-même à la prochaine fermeture de l'app
// (`autoInstallOnAppQuit`) : au démarrage suivant, c'est la nouvelle version qui se lance. Le
// bouton « Redémarrer » de l'UI fait la même chose tout de suite (`update:install`).
//
//   - Windows : installeur NSIS lancé en mode silencieux (/S) par electron-updater. Seule une
//     invite UAC peut apparaître, si l'app a été installée pour tous les utilisateurs.
//   - Linux   : AppImage remplacée sur place ; .deb/.rpm installés via pkexec (mot de passe).
//   - macOS   : voir MacBundleUpdater ci-dessous — l'updater natif (Squirrel.Mac) est inutilisable.

/** Remplacement de l'updater natif macOS d'electron-updater. Squirrel.Mac exige que la nouvelle
 *  version satisfasse l'exigence de signature (« designated requirement ») de l'app en cours :
 *  avec une signature ad hoc (nos builds ne sont pas signés par un certificat Apple), cette
 *  exigence est l'empreinte exacte du binaire, qui change à chaque build — Squirrel refuse donc
 *  TOUTE mise à jour, et `quitAndInstall` ne fait rien.
 *
 *  On garde tout le téléchargement d'electron-updater (sha512, téléchargement différentiel à
 *  partir du .zip précédent, cache), mais l'installation est faite par un script détaché qui
 *  attend la fin du process, remplace le bundle .app puis relance l'app si demandé. Si le dossier
 *  de l'app n'est pas modifiable par l'utilisateur, macOS demande le mot de passe administrateur
 *  (boîte de dialogue système standard via osascript). */
class MacBundleUpdater extends AppUpdater {
  private stagedApp: string | null = null;
  private installStarted = false;
  /** Texte de l'invite de mot de passe macOS, traduit par le renderer (voir `update:download`). */
  adminPrompt = "Resonia wants to install an update.";

  constructor() {
    super(undefined);
  }

  // `httpExecutor` existe bien sur AppUpdater mais n'est pas déclaré dans ses types publics.
  private get http() {
    return (this as unknown as { httpExecutor: { download(url: URL, dest: string, options: unknown): Promise<string> } })
      .httpExecutor;
  }

  protected async doDownloadUpdate(options: DownloadUpdateOptions): Promise<string[]> {
    const { provider, info } = options.updateInfoAndProvider;
    const isArm64File = (url: URL) => url.pathname.includes("arm64");
    const zip = provider
      .resolveFiles(info)
      .find((file) => file.url.pathname.endsWith(".zip") && isArm64File(file.url) === (process.arch === "arm64"));
    if (!zip) throw new Error(`No macOS .zip for ${process.arch} in update ${info.version}`);

    const CACHED_ZIP = "update.zip";
    return this.executeDownload({
      fileExtension: "zip",
      fileInfo: zip,
      downloadUpdateOptions: options,
      task: async (destination, downloadOptions) => {
        const cacheDir = this.downloadedUpdateHelper!.cacheDir;
        let fullDownload = true;
        if (existsSync(join(cacheDir, CACHED_ZIP)) && !options.disableDifferentialDownload) {
          fullDownload = await this.differentialDownloadInstaller(zip, options, destination, provider, CACHED_ZIP);
        }
        if (fullDownload) await this.http.download(zip.url, destination, downloadOptions);
      },
      done: async (event: UpdateDownloadedEvent) => {
        const cacheDir = this.downloadedUpdateHelper!.cacheDir;
        // Base du prochain téléchargement différentiel.
        await copyFile(event.downloadedFile, join(cacheDir, CACHED_ZIP)).catch(() => {});
        this.stagedApp = await stageAppBundle(event.downloadedFile, join(cacheDir, "staged"));
        this.dispatchUpdateDownloaded(event);
        return [];
      },
    });
  }

  quitAndInstall(): void {
    if (this.startInstaller(true)) app.quit();
  }

  /** Appelé à la fermeture de l'app : installe la mise à jour téléchargée, sans relancer. */
  installOnQuit(): void {
    if (this.autoInstallOnAppQuit) this.startInstaller(false);
  }

  private startInstaller(relaunch: boolean): boolean {
    if (!this.stagedApp || this.installStarted) return false;
    const target = resolve(app.getPath("exe"), "../../..");
    if (!target.endsWith(".app")) {
      this.dispatchError(new Error(`Unexpected app location: ${target}`));
      return false;
    }
    // App lancée depuis le .dmg monté ou depuis Téléchargements (« App Translocation » de
    // Gatekeeper) : bundle en lecture seule, il faut d'abord la ranger dans Applications.
    if (target.includes("/AppTranslocation/") || (target.startsWith("/Volumes/") && !isWritable(dirname(target)))) {
      this.dispatchError(new Error("Move Resonia to the Applications folder to install updates."));
      return false;
    }

    const script = join(dirname(dirname(this.stagedApp)), "install-update.sh");
    writeFileSync(script, MAC_INSTALL_SCRIPT, { mode: 0o755 });
    spawn("/bin/sh", [script, String(process.pid), target, this.stagedApp, relaunch ? "1" : "0", this.adminPrompt], {
      detached: true,
      stdio: "ignore",
    }).unref();
    this.installStarted = true;
    return true;
  }
}

function isWritable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Décompresse le .app de la mise à jour, une fois pour toutes au téléchargement : la fermeture
 *  de l'app reste instantanée, le script d'installation n'a plus qu'à copier le bundle. */
async function stageAppBundle(zipFile: string, stagingDir: string): Promise<string> {
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });
  // `ditto` plutôt qu'une lib JS : conserve liens symboliques, permissions et attributs étendus
  // du bundle (indispensables à la signature ad hoc des frameworks Electron).
  await execFileAsync("/usr/bin/ditto", ["-x", "-k", zipFile, stagingDir]);
  const bundle = (await readdir(stagingDir)).find((name) => name.endsWith(".app"));
  if (!bundle) throw new Error("No .app bundle in the downloaded update");
  return join(stagingDir, bundle);
}

// Arguments : pid de l'app, bundle à remplacer, bundle de la mise à jour, relancer (1/0), texte de
// l'invite administrateur. Le bundle est copié à côté de la cible puis échangé par deux `mv`
// (renommages atomiques sur le même volume) : en cas d'échec, l'ancienne version est remise.
const MAC_INSTALL_SCRIPT = `#!/bin/sh
pid="$1"; target="$2"; staged="$3"; relaunch="$4"; prompt="$5"
while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done

swap='t="$1"; s="$2"
rm -rf "$t.updating" "$t.old"
/usr/bin/ditto "$s" "$t.updating" || exit 1
/usr/bin/xattr -dr com.apple.quarantine "$t.updating" 2>/dev/null
mv "$t" "$t.old" || exit 1
if mv "$t.updating" "$t"; then rm -rf "$t.old"; else mv "$t.old" "$t"; exit 1; fi'

if [ -w "$(dirname "$target")" ] && [ -O "$target" ]; then
  /bin/sh -c "$swap" swap "$target" "$staged"
else
  /usr/bin/osascript \\
    -e 'on run argv' \\
    -e 'do shell script "/bin/sh -c " & quoted form of (item 1 of argv) & " swap " & quoted form of (item 2 of argv) & " " & quoted form of (item 3 of argv) with prompt (item 4 of argv) with administrator privileges' \\
    -e 'end run' "$swap" "$target" "$staged" "$prompt"
fi
status=$?

[ "$status" -eq 0 ] && rm -rf "$(dirname "$staged")"
[ "$relaunch" = 1 ] && /usr/bin/open "$target"
exit "$status"
`;

/** Notes de version en texte brut. Le provider GitHub les fournit en HTML (corps de la release,
 *  rendu depuis le Markdown du CHANGELOG) : `<li>` devient une puce, les blocs un saut de ligne. */
export function releaseNotesToText(html: string): string {
  return html
    // Les retours à la ligne du HTML ne comptent pas : seules les balises structurent le texte.
    .replace(/\s+/g, " ")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<br\s*\/?>|<\/(li|p|div|h[1-6]|ul|ol|pre)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
      const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      const key = code.toLowerCase();
      if (key in named) return named[key];
      const n = key.startsWith("#x") ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : entity;
    })
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface UpdatePromptStrings {
  title: string;
  message: string;
  detail: string;
  restart: string;
  later: string;
}

/** Pop-up de mise à jour avec les composants natifs du système : boîte de dialogue Windows
 *  (TaskDialog), feuille macOS (NSAlert) ou GTK sous Linux — et Qt via kdialog sous KDE Plasma,
 *  où une boîte GTK détonnerait. Renvoie true si l'utilisateur choisit de redémarrer. */
async function showUpdatePrompt(window: BrowserWindow | null, strings: UpdatePromptStrings): Promise<boolean> {
  if (process.platform === "linux" && /kde/i.test(process.env["XDG_CURRENT_DESKTOP"] ?? "")) {
    const answer = await kdialogYesNo(strings);
    if (answer !== null) return answer;
  }
  const options: MessageBoxOptions = {
    type: "info",
    title: strings.title,
    message: strings.message,
    detail: strings.detail,
    buttons: [strings.restart, strings.later],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
  // Feuille attachée à la fenêtre si elle est visible ; sinon (fenêtre masquée sous macOS),
  // boîte indépendante — une feuille sur une fenêtre masquée resterait invisible.
  const { response } =
    window && window.isVisible() ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
  return response === 0;
}

/** null si kdialog est absent ou a échoué : on retombe alors sur la boîte GTK d'Electron. */
function kdialogYesNo(strings: UpdatePromptStrings): Promise<boolean | null> {
  return new Promise((done) => {
    const child = spawn(
      "kdialog",
      [
        "--title",
        strings.title,
        "--yes-label",
        strings.restart,
        "--no-label",
        strings.later,
        "--yesno",
        `${strings.message}\n\n${strings.detail}`,
      ],
      { stdio: "ignore" },
    );
    child.on("error", () => done(null));
    child.on("exit", (code) => done(code === 0 ? true : code === 1 ? false : null));
  });
}

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
}

export function registerUpdater(getWindow: () => BrowserWindow | null): void {
  const macUpdater = process.platform === "darwin" ? new MacBundleUpdater() : null;
  const updater: AppUpdater = macUpdater ?? autoUpdater;

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.autoRunAppAfterInstall = true;

  if (macUpdater) app.on("before-quit", () => macUpdater.installOnQuit());

  updater.on("download-progress", (progress: ProgressInfo) => {
    const payload: UpdateProgress = {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    };
    getWindow()?.webContents.send("update:progress", payload);
  });
  updater.on("error", (err) => {
    console.error("[updater] Erreur electron-updater", err);
  });

  ipcMain.handle(
    "update:check",
    async (_e, beta: boolean): Promise<{ version: string; currentVersion: string; notes: string | null } | null> => {
      // Le canal beta cible les releases GitHub marquées prerelease (voir le workflow de release).
      updater.channel = beta ? "beta" : "latest";
      updater.allowPrerelease = beta;
      // Le setter de `channel` autorise les retours en arrière : jamais voulu ici, surtout avec
      // une installation automatique (une beta récente « mise à jour » vers une stable plus ancienne).
      updater.allowDowngrade = false;
      try {
        const result = await updater.checkForUpdates();
        if (!result?.isUpdateAvailable) return null;
        const notes = result.updateInfo.releaseNotes;
        const raw = typeof notes === "string" ? notes : (notes?.[0]?.note ?? null);
        return {
          version: result.updateInfo.version,
          currentVersion: app.getVersion(),
          notes: raw ? releaseNotesToText(raw) : null,
        };
      } catch (err) {
        console.error("[updater] Vérification de mise à jour impossible", err);
        return null;
      }
    },
  );

  ipcMain.handle("update:download", async (_e, adminPrompt?: string) => {
    if (macUpdater && adminPrompt) macUpdater.adminPrompt = adminPrompt;
    await updater.downloadUpdate();
  });

  // Silencieux (pas d'assistant NSIS) puis relance de l'app.
  ipcMain.handle("update:install", () => updater.quitAndInstall(true, true));

  ipcMain.handle("update:prompt", (_e, strings: UpdatePromptStrings) => showUpdatePrompt(getWindow(), strings));
}
