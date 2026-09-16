import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";

type DesktopBaseDir = "appCache" | "appData";

/** Surface exposée à `window.resonia` côté renderer — voir le type `ResoniaBridge` dans
 *  `src/lib/platform/index.ts` (source de vérité du contrat, à garder synchronisé avec ceci).
 *  `contextIsolation: true` interdit tout accès direct à `ipcRenderer`/Node depuis le
 *  renderer : ce pont est le seul chemin. */
contextBridge.exposeInMainWorld("resonia", {
  platform: "desktop",
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),

  store: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke("store:get", key),
    set: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke("store:set", key, value),
    remove: (key: string): Promise<void> => ipcRenderer.invoke("store:remove", key),
  },

  blobStore: {
    open: (baseDir: DesktopBaseDir, path: string): Promise<number> =>
      ipcRenderer.invoke("blobstore:open", baseDir, path),
    write: (handleId: number, position: number, data: Uint8Array): Promise<void> =>
      ipcRenderer.invoke("blobstore:write", handleId, position, data),
    close: (handleId: number): Promise<void> => ipcRenderer.invoke("blobstore:close", handleId),
    stat: (baseDir: DesktopBaseDir, path: string): Promise<{ size: number } | null> =>
      ipcRenderer.invoke("blobstore:stat", baseDir, path),
    readFile: (baseDir: DesktopBaseDir, path: string): Promise<Uint8Array | null> =>
      ipcRenderer.invoke("blobstore:readFile", baseDir, path),
    remove: (baseDir: DesktopBaseDir, path: string): Promise<void> =>
      ipcRenderer.invoke("blobstore:remove", baseDir, path),
  },

  netFetch: (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<{ status: number; statusText: string; ok: boolean; headers: Record<string, string>; body: Uint8Array }> =>
    ipcRenderer.invoke("net:fetch", url, init),

  powerSave: {
    start: (): Promise<void> => ipcRenderer.invoke("powersave:start"),
    stop: (): Promise<void> => ipcRenderer.invoke("powersave:stop"),
  },

  airplay: {
    discover: (): Promise<{ id: string; name: string; host: string; port: number }[]> =>
      ipcRenderer.invoke("airplay:discover"),
    connect: (host: string, port: number, airplay2: boolean, initialVolume: number): void =>
      ipcRenderer.send("airplay:connect", host, port, airplay2, initialVolume),
    // Fire-and-forget (voir le commentaire équivalent côté main/index.ts) : pas d'`invoke` sur
    // le chemin audio actif plusieurs fois par seconde.
    sendPcm: (chunk: Uint8Array): void => ipcRenderer.send("airplay:sendPcm", chunk),
    setVolume: (volume: number): Promise<void> => ipcRenderer.invoke("airplay:setVolume", volume),
    disconnect: (): Promise<void> => ipcRenderer.invoke("airplay:disconnect"),
    reset: (): Promise<void> => ipcRenderer.invoke("airplay:reset"),
    onEvent: (cb: (event: { event: string; message?: string; detail?: unknown }) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, data: { event: string; message?: string; detail?: unknown }) =>
        cb(data);
      ipcRenderer.on("airplay:event", listener);
      return () => ipcRenderer.removeListener("airplay:event", listener);
    },
  },

  update: {
    check: (
      beta: boolean,
    ): Promise<{ version: string; currentVersion: string; notes: string | null } | null> =>
      ipcRenderer.invoke("update:check", beta),
    download: (): Promise<void> => ipcRenderer.invoke("update:download"),
    install: (): Promise<void> => ipcRenderer.invoke("update:install"),
    // Contrairement au reste (requête/réponse via invoke), la progression est poussée par le
    // process principal au fil du téléchargement (événement `download-progress` d'electron-
    // updater) — un abonnement `ipcRenderer.on` est le seul moyen de la recevoir en continu.
    onProgress: (cb: (percent: number) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, percent: number) => cb(percent);
      ipcRenderer.on("update:progress", listener);
      return () => ipcRenderer.removeListener("update:progress", listener);
    },
  },
});
