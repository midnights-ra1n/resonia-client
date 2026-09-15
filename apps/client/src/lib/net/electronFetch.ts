/** `fetch` passant par le process principal Electron (`net.fetch`, IPC `net:fetch`), donc
 *  jamais soumis à la politique CORS du renderer — voir les commentaires historiques dans
 *  coverCache.ts/lyricsService.ts/useAnimatedAlbumCover.ts/SettingsPage.tsx : plusieurs hôtes
 *  tiers (scraping Apple Music, API m8tec, LRCLIB) ne renvoient pas d'en-tête CORS pour notre
 *  origine. Signature volontairement compatible `typeof fetch` pour rester un remplacement
 *  direct partout où un `fetch` est injecté (ex: `checkAnimatedArtworkHealth(url, fetchImpl)`). */
export const electronFetch: typeof fetch = async (input, init) => {
  const api = window.resonia;
  if (!api) throw new Error("electronFetch utilisé hors environnement Electron");

  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const headers = init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined;
  // Seuls des corps textuels sont nécessaires ici (aucun des appelants actuels n'envoie de
  // binaire) : pas la peine de gérer FormData/Blob/ArrayBuffer côté pont IPC pour l'instant.
  const body = typeof init?.body === "string" ? init.body : undefined;

  const result = await api.netFetch(url, { method: init?.method, headers, body });
  // Le typage `BodyInit` du DOM n'unifie pas toujours proprement avec le `Uint8Array` reçu par
  // IPC (Buffer côté process principal) selon la version de lib TS — c'est bien un
  // ArrayBufferView valide à l'exécution, seule la résolution de surcharge est en cause.
  return new Response(result.body as unknown as BodyInit, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });
};
