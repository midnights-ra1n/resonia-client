import { contextBridge, ipcRenderer } from "electron";

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
});
