import { createBrowserRouter } from "react-router-dom";
import { DownloadsPage } from "../features/downloads/DownloadsPage";
import { HomePage } from "../features/home/HomePage";
import { SearchPage } from "../features/search/SearchPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { StatsPage } from "../features/stats/StatsPage";
import { AppLayout } from "./layout/AppLayout";

import { AlbumPage } from "../features/album/AlbumPage";
import { ArtistPage } from "../features/artist/ArtistPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "stats", element: <StatsPage /> },
      { path: "downloads", element: <DownloadsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "albums/:id", element: <AlbumPage /> },
      { path: "artists/:id", element: <ArtistPage /> },
    ],
  },
]);
