export type Platform = "web" | "desktop";

type DesktopBaseDir = "appCache" | "appData";

/** Contrat exposé par `electron/preload/index.ts` sur `window.resonia` — seule surface
 *  atteignable depuis le renderer (`contextIsolation: true` interdit tout accès direct à
 *  Node/ipcRenderer). Garder synchronisé avec le preload à chaque évolution de l'un des deux. */
export interface ResoniaBridge {
  platform: "desktop";
  getVersion(): Promise<string>;
  store: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
  };
  blobStore: {
    open(baseDir: DesktopBaseDir, path: string): Promise<number>;
    write(handleId: number, position: number, data: Uint8Array): Promise<void>;
    close(handleId: number): Promise<void>;
    stat(baseDir: DesktopBaseDir, path: string): Promise<{ size: number } | null>;
    readFile(baseDir: DesktopBaseDir, path: string): Promise<Uint8Array | null>;
    remove(baseDir: DesktopBaseDir, path: string): Promise<void>;
  };
  netFetch(
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<{ status: number; statusText: string; ok: boolean; headers: Record<string, string>; body: Uint8Array }>;
  powerSave: {
    start(): Promise<void>;
    stop(): Promise<void>;
  };
  /** Preuve de concept AirPlay — voir lib/audio/airplay côté renderer et la section AirPlay de
   *  electron/main/index.ts. Web uniquement pas dispo : pas d'accès socket UDP/multicast brut
   *  hors d'un process Node, donc `window.resonia` uniquement (isElectron() le garde déjà). */
  airplay: {
    discover(): Promise<{ id: string; name: string; host: string; port: number }[]>;
    connect(host: string, port: number, airplay2: boolean, initialVolume: number): void;
    sendPcm(chunk: Uint8Array): void;
    setVolume(volume: number): Promise<void>;
    disconnect(): Promise<void>;
    reset(): Promise<void>;
    onEvent(cb: (event: { event: string; message?: string; detail?: unknown }) => void): () => void;
  };
  update: {
    check(beta: boolean): Promise<{ version: string; currentVersion: string; notes: string | null } | null>;
    download(): Promise<void>;
    install(): Promise<void>;
    onProgress(cb: (percent: number) => void): () => void;
  };
}

declare global {
  interface Window {
    resonia?: ResoniaBridge;
  }
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && Boolean(window.resonia);
}

export function getPlatform(): Platform {
  return isElectron() ? "desktop" : "web";
}

let nativeHlsSupport: boolean | null = null;

/** WebKit (Safari, et donc la webview macOS de l'app de bureau) lit nativement le HLS via
 *  <video src="....m3u8">, y compris le CMAF fragmenté utilisé par les pochettes animées
 *  d'Apple Music — mais échoue silencieusement (aucune frame affichée) si on lui donne
 *  directement le .mp4 fragmenté résolu en <video src>, contrairement à Blink/Gecko qui le
 *  lisent très bien tels quels mais ne savent pas lire un flux .m3u8 nativement (pas de HLS natif
 *  sans hls.js). Feature-detection car aucun user-agent sniffing n'est fiable entre WKWebView et
 *  Chrome/Firefox. */
export function supportsNativeHls(): boolean {
  if (nativeHlsSupport === null) {
    const video = document.createElement("video");
    nativeHlsSupport = video.canPlayType("application/vnd.apple.mpegurl") !== "";
  }
  return nativeHlsSupport;
}
