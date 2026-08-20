const DEBUG_ENABLED_KEY = "resonia:debug:audio";

function isEnabled(): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem(DEBUG_ENABLED_KEY) === "1";
}

export function setAudioDebugEnabled(enabled: boolean) {
  localStorage.setItem(DEBUG_ENABLED_KEY, enabled ? "1" : "0");
}

export function debugLog(event: string, data: Record<string, unknown> = {}) {
  if (!isEnabled()) return;
  const t = performance.now().toFixed(1);
  console.log(`%c[audio ${t}ms] ${event}`, "color:#10b981;font-weight:bold", data);
}
