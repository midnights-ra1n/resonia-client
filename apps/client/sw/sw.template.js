/* Service worker de la version WEB de Resonia (jamais enregistré sur bureau : l'app y est déjà
 * servie depuis le disque). Généré au build par `serviceWorkerPlugin` (vite.config.ts), qui
 * remplace les deux marqueurs ci-dessous par la version du build et la liste de ses fichiers.
 *
 * But : un démarrage instantané, même réseau lent ou coupé. Toute l'interface (HTML, JS, CSS,
 * polices, icônes) est mise en cache à l'installation, puis servie depuis ce cache — le réseau
 * n'est plus sur le chemin du lancement. Ne concerne QUE les fichiers de l'app : aucune requête
 * vers le serveur Navidrome (API, flux audio, pochettes) n'est interceptée, elles ont leurs
 * propres caches (voir lib/audio/cache et lib/image/coverCache). */

const VERSION = "__SW_VERSION__";
const PRECACHE = __SW_PRECACHE__;
const CACHE_PREFIX = "resonia-shell-";
const CACHE_NAME = CACHE_PREFIX + VERSION;
// Versions conservées : la courante + la précédente. Un onglet encore ouvert sur l'ancienne
// version peut ainsi toujours charger ses pages à la demande (chunks de l'ancien build, déjà
// absents du serveur) après la mise à jour.
const KEPT_VERSIONS = 2;
const VERSIONS_KEY = "resonia-shell-versions";

const scopeUrl = new URL(self.registration.scope);
const indexUrl = new URL("index.html", scopeUrl).href;
const assetsPath = new URL("assets/", scopeUrl).pathname;
const precacheUrls = new Set(PRECACHE.map((path) => new URL(path, scopeUrl).href));

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Fichier par fichier : un échec isolé (fichier retiré entre-temps) ne doit pas bloquer
      // toute l'installation. `cache: "reload"` : jamais une copie périmée du cache HTTP.
      await Promise.all(
        [...precacheUrls].map((url) =>
          fetch(url, { cache: "reload" })
            .then((res) => (res.ok ? cache.put(url, res) : undefined))
            .catch(() => undefined),
        ),
      );
      // Nouvelle version active tout de suite : la prochaine ouverture de l'app l'utilise.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Historique des versions installées (dans un cache dédié, seul stockage dispo ici).
      const meta = await caches.open(VERSIONS_KEY);
      const stored = await meta.match("versions");
      const versions = stored ? await stored.json() : [];
      const next = [VERSION, ...versions.filter((v) => v !== VERSION)].slice(0, KEPT_VERSIONS);
      await meta.put("versions", new Response(JSON.stringify(next)));

      const keep = new Set(next.map((v) => CACHE_PREFIX + v));
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

/** Cache d'abord (version courante puis précédente), réseau en repli — mis en cache au passage
 *  s'il s'agit d'un fichier de l'app (chunk chargé à la demande non précaché, ex: hls.js). */
async function cacheFirst(request, cacheKey) {
  const cached = await caches.match(cacheKey, { ignoreSearch: false });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE_NAME);
    void cache.put(cacheKey, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Jamais les requêtes vers un autre hôte (serveur Navidrome, Last.fm, LRCLIB...).
  if (url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname)) return;

  // Navigation (ouverture de l'app, rechargement, lien direct vers une page) : l'app est une SPA,
  // toute route est servie par index.html — depuis le cache, sans attendre le réseau.
  // `/rest/` exclu : un Navidrome servi derrière le même domaine que l'app reste joignable.
  if (request.mode === "navigate" && !url.pathname.startsWith("/rest/")) {
    event.respondWith(
      caches.match(indexUrl).then((cached) => cached ?? fetch(request)),
    );
    return;
  }

  if (precacheUrls.has(url.href) || url.pathname.startsWith(assetsPath)) {
    event.respondWith(cacheFirst(request, url.href));
  }
});
