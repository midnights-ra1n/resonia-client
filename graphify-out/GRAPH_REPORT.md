# Graph Report - resonia-client  (2026-08-23)

## Corpus Check
- 156 files · ~195,500 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 997 nodes · 1978 edges · 149 communities (46 shown, 103 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Playlist UI Components
- App Shell & Routing
- UI Prop Types & Fetchers
- Gapless Audio Engine
- Client Dependencies (package.json)
- Animated Cover Resolution & Cache
- Dev Tooling & Linting
- OPFS Blob Storage
- Gapless Engine Tests
- TS App Compiler Config
- Native Auth & Secrets
- Tauri App Config
- Audio Cache Store
- TS Node Compiler Config
- Audio Quality & Platform Settings
- Settings Page & Cache Controls
- Monorepo Root Package Config
- i18n Context & Translation
- Cover Art Cache
- Turborepo Task Config
- Animated Cover Cache
- Project Vision & Engine Invariants
- Track Downloader
- Cache Store Tests
- Range Fetcher & OPFS Writer
- Storage Adapters (local/Tauri)
- Hashing Dependency (spark-md5)
- Prefetch Scheduler Tests
- Prefetch Scheduler
- Most Played Albums UI
- Tauri Capabilities/Permissions
- Last.fm Integration
- Prefetch Queue & Audio Debug Log
- Desktop App Icons & Branding
- Vite/React Build Plugins
- Context Menu Panel
- Download Progress Types
- Package Manifest (workspace member)
- Package Manifest (workspace member)
- Project Feature Roadmap
- Song Row UI
- Root TS Project References
- Default Cover Icon (SVG)
- Resonia Favicon Icon (favicon.svg)
- Resonia 'R' Logo Mark
- Resonia App Logo
- Action Bar (play button, add-to-library, shuffle,
- Album Header (large cover art, gradient
- Dark Theme Design Pattern (black background,
- Bottom Now-Playing Bar (playback controls, seek
- Spotify Album View Screenshot
- Left Sidebar (Bibliotheque/Library with playlists list)
- Top Navigation Bar (logo, home, search,
- Track List (numbered rows: title, explicit
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Horizontal scrollable album cover grid with
- Artist header bar (play button, artist
- Artist View 2 Screenshot (Spotify -
- 'Avec Jul' section - playlists featuring
- Discographie section with filter tabs (Sorties
- 'En tournee' (on tour) section showing
- Bottom global playback control bar (shuffle,
- Left sidebar Bibliotheque (library) panel with
- Top navigation bar (home icon, search
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Bottom Persistent Player Bar
- Connect Device-Picker Panel
- Left Sidebar (Bibliotheque/Library with Playlists)
- "Plus de contenus de Jul" Artist
- "Aucun autre appareil detecte" Empty State
- Now Playing Hero Header (album art
- Connect View Screenshot (Spotify Web Player)
- "Ce navigateur web" Active Device Entry
- Top Navigation Bar (search, home, premium
- Single Track List Row (Borussia by
- Centered large album/video artwork panel
- Blurred dark-blue ambient background derived from
- Top header bar with playlist title
- Fullscreen now-playing layout pattern
- Bottom mini-player transport controls bar
- Fullscreen_view.png (reference screenshot)
- "Vidéos similaires" horizontal thumbnail row
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- 'A suivre' (Up Next) scrollable list
- Bottom playback bar with mini cover
- 'File d'attente' (Queue) right-side slide-out panel
- Left 'Bibliotheque' (Library) sidebar with playlists
- Main center now-playing hero panel with
- Queue_view.png (Spotify Queue view reference screens...
- 'Titre en cours de lecture' (Now
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Unlabeled Fragment
- Action Toolbar (play, add to app,
- Gradient Hero Header Banner (cover art
- Left Sidebar (Bibliotheque / Playlists panel)
- "Plus de contenus de" Artist Discography
- Bottom Now-Playing Transport Bar
- Release Info Block (release date, copyright/phonogram
- Spotify Single/Track View Layout Screenshot
- Top Navigation Bar (logo, home, search,
- Track Listing Table (# / Titre
- resonia-client
- apps/* workspace glob
- packages/* workspace glob
- Spotify web UI (design inspiration reference
- resonia-client (Spotify-inspired music player web cl...

## God Nodes (most connected - your core abstractions)
1. `useServersStore` - 52 edges
2. `getClientForServer()` - 49 edges
3. `useTranslation()` - 47 edges
4. `usePlayerStore` - 44 edges
5. `GaplessEngine` - 38 edges
6. `SubsonicClient` - 33 edges
7. `CacheStore` - 26 edges
8. `AlbumPage()` - 19 edges
9. `AlbumSummary` - 19 edges
10. `compilerOptions` - 18 edges

## Surprising Connections (you probably didn't know these)
- `CreatePlaylistModalProps` --references--> `PlaylistSummary`  [EXTRACTED]
  apps/client/src/app/layout/CreatePlaylistModal.tsx → packages/api-client/src/subsonic/types.ts
- `RenamePlaylistModalProps` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/app/layout/RenamePlaylistModal.tsx → packages/api-client/src/subsonic/client.ts
- `AddToPlaylistSubmenuProps` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/components/menu/AddToPlaylistSubmenu.tsx → packages/api-client/src/subsonic/client.ts
- `BuildPlaylistMenuItemsParams` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/components/menu/buildPlaylistMenuItems.tsx → packages/api-client/src/subsonic/client.ts
- `BuildTrackMenuItemsParams` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/components/menu/buildTrackMenuItems.tsx → packages/api-client/src/subsonic/client.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Audio Engine Invariants** — claude_gapless_playback, claude_preload_next_tracks, claude_audio_cache, claude_transition_control [EXTRACTED 1.00]

## Communities (149 total, 103 thin omitted)

### Community 0 - "Playlist UI Components"
Cohesion: 0.06
Nodes (83): CreatePlaylistModal(), handleSubmit(), PlaylistSidebarItem(), PlaylistSidebarItemProps, RenamePlaylistModal(), navLinks, Sidebar(), SessionGate() (+75 more)

### Community 1 - "App Shell & Routing"
Cohesion: 0.07
Nodes (41): src/main.tsx (app entry point), App(), AppLayout(), handleKeyDown(), isTypingTarget(), router, DownloadsPage(), PlayerBar() (+33 more)

### Community 2 - "UI Prop Types & Fetchers"
Cohesion: 0.06
Nodes (33): CreatePlaylistModalProps, RenamePlaylistModalProps, AddToPlaylistSubmenuProps, BuildAlbumMenuItemsParams, fetchAlbumTracks(), fetchPlaylistTracks(), AlbumCarouselProps, AlbumCardProps (+25 more)

### Community 3 - "Gapless Audio Engine"
Cohesion: 0.09
Nodes (16): DecodedTrack, ActiveBuffer, ActiveNative, BufferPlayback, DecodedTrack, describeMediaError(), GaplessEngine, PendingNext (+8 more)

### Community 4 - "Client Dependencies (package.json)"
Cohesion: 0.05
Nodes (41): dependencies, @chakra-ui/react, lucide-react, react, react-dom, react-router-dom, @resonia/api-client, tailwindcss (+33 more)

### Community 5 - "Animated Cover Resolution & Cache"
Cohesion: 0.11
Nodes (32): platformFetch(), ResolvedAnimatedCover, resolveMasterUrl(), resolveSourcesCached(), searchKeyFor(), searchResultCache, useAnimatedAlbumCover(), clearAnimatedCoverSearchCache() (+24 more)

### Community 6 - "Dev Tooling & Linting"
Cohesion: 0.06
Nodes (31): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, jsdom, @tauri-apps/cli (+23 more)

### Community 7 - "OPFS Blob Storage"
Cohesion: 0.13
Nodes (14): formatMb(), requestPersistentStorage(), store, getPlatform(), createBlobStore(), createOpfsBlobStore(), getFileHandle(), getRootDir() (+6 more)

### Community 8 - "Gapless Engine Tests"
Cohesion: 0.10
Nodes (9): decodedTrack(), FakeAudioBufferSourceNode, FakeAudioContext, FakeAudioElement, FakeAudioNode, FakeAudioParam, FakeGainNode, installWebAudioMocks() (+1 more)

### Community 9 - "TS App Compiler Config"
Cohesion: 0.08
Nodes (23): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+15 more)

### Community 10 - "Native Auth & Secrets"
Cohesion: 0.13
Nodes (15): handleSubmit(), ARTWORK_UPLOAD_PATH(), nativeLogin(), uploadPlaylistArtwork(), decryptPassword(), encryptPassword(), getOrCreateKey(), CachedToken (+7 more)

### Community 11 - "Tauri App Config"
Cohesion: 0.09
Nodes (22): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+14 more)

### Community 12 - "Audio Cache Store"
Cohesion: 0.20
Nodes (4): CacheStore, opfsDelete(), CacheEntryMeta, cacheKeyFor()

### Community 13 - "TS Node Compiler Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+11 more)

### Community 14 - "Audio Quality & Platform Settings"
Cohesion: 0.18
Nodes (16): AUDIO_QUALITIES, AudioQuality, DEFAULT_QUALITY_ID, FORMAT_MIME, getAvailableQualities(), getQualityById(), isFormatPlayable(), setAnimatedCoverCacheMaxBytes() (+8 more)

### Community 15 - "Settings Page & Cache Controls"
Cohesion: 0.20
Nodes (17): clearAnimatedCoverResolutionCache(), AnimatedArtworkHealth, CACHE_LIMIT_OPTIONS_GB, fillBarColor(), formatBytes(), isValidAnimatedArtworkUrl(), LOCALE_LABELS, platformFetch() (+9 more)

### Community 16 - "Monorepo Root Package Config"
Cohesion: 0.11
Nodes (17): description, devDependencies, eslint, prettier, turbo, typescript, eslint, turbo (+9 more)

### Community 17 - "i18n Context & Translation"
Cohesion: 0.24
Nodes (12): detectBrowserLocale(), I18nContext, I18nContextValue, I18nProvider(), getByPath(), interpolate(), resolveTranslation(), translations (+4 more)

### Community 18 - "Cover Art Cache"
Cohesion: 0.28
Nodes (14): CacheEntryMeta, cacheKeyFor(), enforceLimit(), fetchForCache(), getCachedCoverUrl(), loadAndCacheCover(), readCachedCover(), readMeta() (+6 more)

### Community 19 - "Turborepo Task Config"
Cohesion: 0.13
Nodes (14): ^build, dist/**, dependsOn, outputs, cache, persistent, outputs, $schema (+6 more)

### Community 20 - "Animated Cover Cache"
Cohesion: 0.26
Nodes (12): CacheEntryMeta, cacheKeyFor(), enforceLimit(), fetchForCache(), getCachedAnimatedCoverUrl(), loadAndCacheAnimatedCover(), readCachedCover(), scheduleSizeNotify() (+4 more)

### Community 21 - "Project Vision & Engine Invariants"
Cohesion: 0.15
Nodes (14): Reusable Audio Data Cache, Audio Engine, Desktop Client, Gapless Playback, Navidrome, Preload Next 3 Tracks, Resonia, Rust (+6 more)

### Community 23 - "Cache Store Tests"
Cohesion: 0.15
Nodes (3): FakeTrackDownloader, opfsDeleted, storageState

### Community 24 - "Range Fetcher & OPFS Writer"
Cohesion: 0.24
Nodes (9): createOpfsWriter(), opfsFileSize(), EndOfStreamError, fetchRange(), fetchRangeOnce(), isTransient(), RangeChunk, sleep() (+1 more)

### Community 25 - "Storage Adapters (local/Tauri)"
Cohesion: 0.27
Nodes (4): storage, localStorageAdapter, tauriStoreAdapter, StorageAdapter

### Community 26 - "Hashing Dependency (spark-md5)"
Cohesion: 0.17
Nodes (11): dependencies, spark-md5, devDependencies, @types/spark-md5, main, name, private, type (+3 more)

### Community 27 - "Prefetch Scheduler Tests"
Cohesion: 0.18
Nodes (6): opfsReadAll(), FakeTask, protectedKeysHistory, requestedOrder, tasks, ChunkListener

### Community 29 - "Most Played Albums UI"
Cohesion: 0.27
Nodes (5): AlbumCard(), AlbumCardProps, MostPlayedAlbums(), MostPlayedAlbumsProps, Album

### Community 30 - "Tauri Capabilities/Permissions"
Cohesion: 0.20
Nodes (9): description, identifier, permissions, $schema, windows, fs:allow-appcache-read-recursive, fs:allow-appcache-write-recursive, main (+1 more)

### Community 31 - "Last.fm Integration"
Cohesion: 0.29
Nodes (6): normalize(), loadFromLastfm(), run(), getLastfmTopTracks(), LastfmTopTrack, LastfmTopTracksResponse

### Community 32 - "Prefetch Queue & Audio Debug Log"
Cohesion: 0.38
Nodes (4): QueueSlot, UpcomingTrack, debugLog(), isEnabled()

### Community 33 - "Desktop App Icons & Branding"
Cohesion: 0.38
Nodes (7): src-tauri (Tauri desktop backend), 128x128.png (Tauri app icon), 128x128@2x.png (Resonia app icon, retina), 32x32.png (Tauri app icon, small size), Resonia brand icon design (green rounded-square, white R monogram), Resonia brand icon (letter 'R' mark), Resonia Tauri desktop application

### Community 34 - "Vite/React Build Plugins"
Cohesion: 0.33
Nodes (6): eslint-plugin-react-dom, eslint-plugin-react-x, @vitejs/plugin-react (Oxc), @vitejs/plugin-react-swc (SWC), React Compiler (not enabled, dev/build perf impact), Vite + React + TypeScript template

### Community 36 - "Download Progress Types"
Cohesion: 0.33
Nodes (4): CACHE_FORMAT_VERSION, CacheKeyParts, DownloadProgress, ProgressListener

### Community 37 - "Package Manifest (workspace member)"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 38 - "Package Manifest (workspace member)"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 39 - "Project Feature Roadmap"
Cohesion: 0.33
Nodes (6): Docker deployment (ghcr.io/midnights-ra1n/resonia-client), Synchronized/unsynchronized lyrics support (feature, done), MPV player backend (feature, done), resonia-client (desktop client for Navidrome/OpenSubsonic), Smart playlist editor (Navidrome) (feature, done), Web player backend (feature, done)

## Knowledge Gaps
- **320 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+315 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **103 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `usePlayerStore` connect `App Shell & Routing` to `Playlist UI Components`, `Gapless Audio Engine`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `useTranslation()` connect `Playlist UI Components` to `App Shell & Routing`, `Most Played Albums UI`, `i18n Context & Translation`, `Settings Page & Cache Controls`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _320 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Playlist UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.055623100303951366 - nodes in this community are weakly interconnected._
- **Should `App Shell & Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.06892655367231638 - nodes in this community are weakly interconnected._
- **Should `UI Prop Types & Fetchers` be split into smaller, more focused modules?**
  _Cohesion score 0.06019871420222092 - nodes in this community are weakly interconnected._
- **Should `Gapless Audio Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.08766233766233766 - nodes in this community are weakly interconnected._