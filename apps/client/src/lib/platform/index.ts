export type Platform = "web" | "desktop";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function getPlatform(): Platform {
  return isTauri() ? "desktop" : "web";
}
