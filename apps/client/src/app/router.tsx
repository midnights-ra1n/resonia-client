import { lazy, Suspense } from "react";
import { createBrowserRouter, createHashRouter } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";

// Chargeurs des pages, partagés entre `lazy()` et `preloadRoutes()`.
const loadHome = () => import("../features/home/HomePage").then((m) => ({ default: m.HomePage }));
const loadStats = () => import("../features/stats/StatsPage").then((m) => ({ default: m.StatsPage }));
const loadDownloads = () => import("../features/downloads/DownloadsPage").then((m) => ({ default: m.DownloadsPage }));
const loadSettings = () => import("../features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage }));
const loadSearch = () => import("../features/search/SearchPage").then((m) => ({ default: m.SearchPage }));
const loadFavorites = () => import("../features/favorites/FavoritesPage").then((m) => ({ default: m.FavoritesPage }));
const loadAlbum = () => import("../features/album/AlbumPage").then((m) => ({ default: m.AlbumPage }));
const loadArtist = () => import("../features/artist/ArtistPage").then((m) => ({ default: m.ArtistPage }));
const loadPlaylist = () => import("../features/playlist/PlaylistPage").then((m) => ({ default: m.PlaylistPage }));

const HomePage = lazy(loadHome);
const StatsPage = lazy(loadStats);
const DownloadsPage = lazy(loadDownloads);
const SettingsPage = lazy(loadSettings);
const SearchPage = lazy(loadSearch);
const FavoritesPage = lazy(loadFavorites);
const AlbumPage = lazy(loadAlbum);
const ArtistPage = lazy(loadArtist);
const PlaylistPage = lazy(loadPlaylist);

/** Charge en arrière-plan le code de toutes les pages, une fois l'app affichée et le navigateur
 *  inactif : la première ouverture de chaque page est ensuite instantanée (aucun aller-retour
 *  réseau ou disque au clic). Quelques centaines de Ko, une seule fois par lancement. */
export function preloadRoutes(): void {
  const run = () => {
    for (const load of [loadAlbum, loadPlaylist, loadArtist, loadSearch, loadFavorites, loadSettings, loadDownloads, loadStats]) {
      load().catch(() => {});
    }
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

// Suspense minimal (pas de spinner) : les pages sont sur la même route déjà rendue par
// AppLayout (sidebar, player bar...), un fallback visible créerait un flash inutile sur
// des chunks qui se chargent en quelques ms une fois en cache navigateur.
function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={null}>{element}</Suspense>;
}

const routes = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: withSuspense(<HomePage />) },
      { path: "stats", element: withSuspense(<StatsPage />) },
      { path: "downloads", element: withSuspense(<DownloadsPage />) },
      { path: "settings", element: withSuspense(<SettingsPage />) },
      { path: "search", element: withSuspense(<SearchPage />) },
      { path: "favorites", element: withSuspense(<FavoritesPage />) },
      { path: "albums/:id", element: withSuspense(<AlbumPage />) },
      { path: "artists/:id", element: withSuspense(<ArtistPage />) },
      { path: "playlists/:id", element: withSuspense(<PlaylistPage />) },
    ],
  },
];

// `createBrowserRouter` (API History HTML5) exige une vraie origine http(s) servant n'importe
// quelle sous-route avec le même index.html — vrai en web et en dev Electron (serveur Vite sur
// http://localhost), mais PAS pour un `.app` empaqueté : `mainWindow.loadFile(...)` charge
// `index.html` via `file://`, où `pushState`/`replaceState` vers un chemin different
// (ex: file:///.../dist/albums/42) pointe vers un fichier qui n'existe pas sur le disque —
// d'où les pages "cassées" au premier changement de route. `createHashRouter` encode la route
// dans le fragment (`#/albums/42`), jamais envoyé au système de fichiers, donc toujours résolu
// vers le même `index.html` local quel que soit l'endroit dans l'app.
export const router =
  typeof window !== "undefined" && window.location.protocol === "file:"
    ? createHashRouter(routes)
    : createBrowserRouter(routes);
