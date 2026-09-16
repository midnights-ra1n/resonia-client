import { lazy, Suspense } from "react";
import { createBrowserRouter, createHashRouter } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";

const HomePage = lazy(() => import("../features/home/HomePage").then((m) => ({ default: m.HomePage })));
const StatsPage = lazy(() => import("../features/stats/StatsPage").then((m) => ({ default: m.StatsPage })));
const DownloadsPage = lazy(() =>
  import("../features/downloads/DownloadsPage").then((m) => ({ default: m.DownloadsPage })),
);
const SettingsPage = lazy(() =>
  import("../features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const SearchPage = lazy(() => import("../features/search/SearchPage").then((m) => ({ default: m.SearchPage })));
const FavoritesPage = lazy(() =>
  import("../features/favorites/FavoritesPage").then((m) => ({ default: m.FavoritesPage })),
);
const AlbumPage = lazy(() => import("../features/album/AlbumPage").then((m) => ({ default: m.AlbumPage })));
const ArtistPage = lazy(() => import("../features/artist/ArtistPage").then((m) => ({ default: m.ArtistPage })));
const PlaylistPage = lazy(() =>
  import("../features/playlist/PlaylistPage").then((m) => ({ default: m.PlaylistPage })),
);

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
