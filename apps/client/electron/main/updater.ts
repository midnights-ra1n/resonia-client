import { execFile, spawn } from "node:child_process";
import { accessSync, constants, existsSync, rmSync, writeFileSync } from "node:fs";
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
  /** Texte de la fenêtre de progression affichée pendant l'installation (voir `update:install`). */
  installingText = "Updating…";

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

    const cacheDir = dirname(dirname(this.stagedApp));
    const script = join(cacheDir, "install-update.sh");
    writeFileSync(script, MAC_INSTALL_SCRIPT, { mode: 0o755 });
    writeFileSync(join(cacheDir, "install-progress.js"), MAC_PROGRESS_WINDOW);
    spawn(
      "/bin/sh",
      [
        script,
        String(process.pid),
        target,
        this.stagedApp,
        relaunch ? "1" : "0",
        this.adminPrompt,
        this.installingText,
        app.name,
        progressFiles().done,
      ],
      { detached: true, stdio: "ignore" },
    ).unref();
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
// l'invite administrateur, texte et titre de la fenêtre de progression, fichier signalant que la
// nouvelle version est affichée (voir closeInstallProgress).
//
// Au redémarrage demandé, la fenêtre de progression est lancée tout de suite, PENDANT la fermeture
// de l'app : au premier lancement d'osascript (toujours le cas ici), elle met jusqu'à ~2,5 s à
// s'afficher (mesuré), alors que la copie est instantanée (clone APFS sur le même volume). La
// relance attend qu'elle soit affichée (fichier `progress-ready`, 5 s max) puis 0,5 s — l'ordre
// reste « l'app se ferme, la progression s'affiche, la nouvelle version s'ouvre » — et la fenêtre
// se ferme dès que la nouvelle version affiche la sienne (15 s max).
//
// Le bundle est copié à côté de la cible puis échangé par deux `mv` (renommages atomiques sur le
// même volume) : en cas d'échec, l'ancienne version est remise.
const MAC_INSTALL_SCRIPT = `#!/bin/sh
pid="$1"; target="$2"; staged="$3"; relaunch="$4"; prompt="$5"; progress_text="$6"; app_name="$7"; done_file="$8"
ui=""
ready="$(dirname "$0")/progress-ready"
if [ "$relaunch" = 1 ]; then
  rm -f "$ready"
  /usr/bin/osascript -l JavaScript "$(dirname "$0")/install-progress.js" "$progress_text" "$app_name" "$ready" >/dev/null 2>&1 &
  ui=$!
fi
while kill -0 "$pid" 2>/dev/null; do sleep 0.1; done

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
if [ "$relaunch" = 1 ]; then
  i=0; while [ ! -f "$ready" ] && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
  sleep 0.5
  /usr/bin/open "$target"
  i=0; while [ ! -f "$done_file" ] && [ "$i" -lt 150 ]; do sleep 0.1; i=$((i + 1)); done
  kill "$ui" 2>/dev/null
  rm -f "$ready" "$done_file"
fi
exit "$status"
`;

// Fenêtre de progression native (NSPanel + NSProgressIndicator indéterminé) en JavaScript for
// Automation : aucun binaire à embarquer, osascript est présent sur tout macOS. Arguments : texte,
// titre, fichier créé une fois la fenêtre affichée (signal pour le script d'installation). Tourne jusqu'à ce que le script d'installation la termine (kill). Politique « accessory » :
// pas d'icône dans le Dock pour cette fenêtre de quelques secondes. macOS refuse souvent d'activer
// un process lancé en arrière-plan : `setHidesOnDeactivate(false)` est indispensable, un NSPanel
// d'une app inactive restant sinon masqué.
const MAC_PROGRESS_WINDOW = `ObjC.import("Cocoa");
function run(argv) {
  var app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  var panel = $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect(0, 0, 340, 92), $.NSWindowStyleMaskTitled, $.NSBackingStoreBuffered, false);
  panel.setTitle(argv[1]);
  panel.setHidesOnDeactivate(false);
  var label = $.NSTextField.labelWithString(argv[0]);
  label.setFrame($.NSMakeRect(20, 50, 300, 20));
  var bar = $.NSProgressIndicator.alloc.initWithFrame($.NSMakeRect(20, 22, 300, 20));
  bar.setStyle($.NSProgressIndicatorStyleBar);
  bar.setIndeterminate(true);
  bar.startAnimation($());
  panel.contentView.addSubview(label);
  panel.contentView.addSubview(bar);
  panel.center;
  panel.setLevel($.NSFloatingWindowLevel);
  panel.makeKeyAndOrderFront($());
  app.activateIgnoringOtherApps(true);
  $("").writeToFileAtomicallyEncodingError(argv[2], true, $.NSUTF8StringEncoding, $());
  app.run;
}
`;

// ---- Fenêtre « Installation de la mise à jour… », toutes plateformes ----
//
// Au clic sur « Redémarrer », la fenêtre de l'app disparaît aussitôt et une fenêtre native du
// système (barre de progression indéterminée) prend le relais jusqu'à ce que la nouvelle version
// affiche la sienne : elle crée alors `update-progress.done` (closeInstallProgress), que la fenêtre
// de progression attend pour se fermer — sans délai fixe, ni trop tôt ni trop tard. macOS : voir
// MAC_INSTALL_SCRIPT ; Windows : WinForms via PowerShell ; Linux : kdialog (KDE) ou zenity.

function progressFiles(): { pending: string; done: string } {
  const dir = app.getPath("userData");
  return { pending: join(dir, "update-progress.pending"), done: join(dir, "update-progress.done") };
}

/** Ferme la fenêtre de progression : appelé quand la fenêtre de la nouvelle version s'affiche, ou
 *  quand l'installation n'a finalement pas eu lieu. Sans installation en cours, ne fait rien. */
export function closeInstallProgress(): void {
  const { pending, done } = progressFiles();
  if (!existsSync(pending)) return;
  rmSync(pending, { force: true });
  writeFileSync(done, "");
}

function showInstallProgress(text: string): void {
  const { pending, done } = progressFiles();
  rmSync(done, { force: true });
  writeFileSync(pending, "");
  // macOS : lancée par le script d'installation lui-même (voir MacBundleUpdater).
  if (process.platform === "win32") {
    const script = join(app.getPath("userData"), "update-progress.ps1");
    writeFileSync(script, WIN_PROGRESS_SCRIPT);
    spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script, "-Text", text, "-Title", app.name, "-Done", done],
      { detached: true, stdio: "ignore", windowsHide: true },
    ).unref();
  } else if (process.platform === "linux") {
    const script = join(app.getPath("userData"), "update-progress.sh");
    writeFileSync(script, LINUX_PROGRESS_SCRIPT, { mode: 0o755 });
    // Hors AppImage : ses bibliothèques embarquées casseraient zenity/kdialog du système.
    const env = { ...process.env };
    delete env["LD_LIBRARY_PATH"];
    delete env["LD_PRELOAD"];
    spawn("/bin/sh", [script, done, text, app.name], { detached: true, stdio: "ignore", env }).unref();
  }
}

// Fenêtre WinForms (contrôles Win32 natifs, style visuel du système) : texte + barre « marquee »
// animée en continu. Se ferme à l'apparition du fichier -Done, ou au bout de 3 min (relance ratée).
// Script en ASCII : les textes traduits arrivent en arguments (ligne de commande Unicode).
const WIN_PROGRESS_SCRIPT = `param([string]$Text, [string]$Title, [string]$Done)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object System.Windows.Forms.Form
$form.Text = $Title
$form.Font = [System.Drawing.SystemFonts]::MessageBoxFont
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.ControlBox = $false
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.TopMost = $true
$form.ClientSize = New-Object System.Drawing.Size(340, 92)
$label = New-Object System.Windows.Forms.Label
$label.Text = $Text
$label.AutoSize = $true
$label.Location = New-Object System.Drawing.Point(20, 20)
$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
$bar.MarqueeAnimationSpeed = 30
$bar.Location = New-Object System.Drawing.Point(20, 52)
$bar.Size = New-Object System.Drawing.Size(300, 20)
$form.Controls.Add($label)
$form.Controls.Add($bar)
$start = Get-Date
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 150
$timer.Add_Tick({
  if ((Test-Path -LiteralPath $Done) -or ((Get-Date) - $start).TotalMinutes -gt 3) { $timer.Stop(); $form.Close() }
})
$timer.Start()
[void]$form.ShowDialog()
Remove-Item -LiteralPath $Done -ErrorAction SilentlyContinue
`;

// Arguments : fichier -done, texte, titre. kdialog sous KDE Plasma (Qt, barre « occupée » quand le
// total vaut 0), zenity ailleurs (GTK, --pulsate) ; ni l'un ni l'autre : pas de fenêtre, la mise à
// jour se fait quand même. Lancé détaché (groupe de process à lui) : \`kill 0\` ferme tout à la fin.
const LINUX_PROGRESS_SCRIPT = `#!/bin/sh
done_file="$1"; text="$2"; title="$3"; ref=""
case "$XDG_CURRENT_DESKTOP" in
  *KDE*|*kde*) command -v kdialog >/dev/null 2>&1 && ref=$(kdialog --title "$title" --progressbar "$text" 0 2>/dev/null) ;;
esac
if [ -z "$ref" ] && command -v zenity >/dev/null 2>&1; then
  sleep 600 | zenity --progress --pulsate --no-cancel --title="$title" --text="$text" >/dev/null 2>&1 &
fi
i=0; while [ ! -f "$done_file" ] && [ "$i" -lt 1800 ]; do sleep 0.1; i=$((i + 1)); done
rm -f "$done_file"
[ -n "$ref" ] && dbus-send --session --type=method_call --dest="\${ref%% *}" "\${ref#* }" org.kde.kdialog.ProgressDialog.close 2>/dev/null
kill 0
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

  // Silencieux (pas d'assistant NSIS) puis relance de l'app. La fenêtre disparaît tout de suite :
  // l'installation .deb/.rpm (pkexec + dpkg/rpm) se fait de façon SYNCHRONE avant la fermeture,
  // l'app resterait sinon figée à l'écran. Le court délai laisse la fenêtre se masquer et la
  // fenêtre de progression démarrer avant ce blocage.
  ipcMain.handle("update:install", (_e, installingText = "Updating…") => {
    if (macUpdater) macUpdater.installingText = installingText;
    let quitting = false;
    app.once("before-quit", () => (quitting = true));
    getWindow()?.hide();
    showInstallProgress(installingText);
    setTimeout(() => {
      updater.quitAndInstall(true, true);
      // Installation refusée ou impossible (erreur signalée par electron-updater) : on revient.
      setTimeout(() => {
        if (quitting) return;
        closeInstallProgress();
        getWindow()?.show();
      }, 1500);
    }, 100);
  });

  ipcMain.handle("update:prompt", (_e, strings: UpdatePromptStrings) => showUpdatePrompt(getWindow(), strings));
}
