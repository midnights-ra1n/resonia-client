import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
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

export const router = createBrowserRouter([
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
]);
