export type Platform = "web" | "desktop";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function getPlatform(): Platform {
  return isTauri() ? "desktop" : "web";
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
