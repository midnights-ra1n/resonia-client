# Graph Report - resonia-client  (2026-08-22)

## Corpus Check
- 153 files · ~192,164 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 963 nodes · 1850 edges · 141 communities (38 shown, 103 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- UI Pages & Menus
- Cover Art & Settings
- Audio Cache Store
- Gapless Audio Engine
- Player Store & Media Session
- Subsonic API Client
- Client Dependencies
- Client Dev Dependencies
- App Shell & i18n
- Navidrome Native Auth
- Audio Engine Test Mocks
- App TS Config
- Tauri App Config
- Blob Storage Layer
- Node TS Config
- Root Workspace Package
- Turbo Build Pipeline
- CLAUDE.md Project Notes
- Cache Store Tests
- API Client Package Config
- Prefetch Scheduler
- Most Played Albums
- Tauri Capabilities
- Animated Artwork Client
- Last.fm Popular Songs
- Tauri Icons & Branding
- Client README Notes
- Context Menu Panel
- Core Package Config
- UI Package Config
- README Feature List
- Search Result Section
- Home Song Row
- TS Project References
- Default Cover Icon
- Favicon Icon
- Favicon Logo Mark
- Resonia Logo Asset
- Spotify Album View Mock
- Spotify Album View Mock
- Spotify Album View Mock
- Spotify Album View Mock
- Spotify Album View Mock
- Spotify Album View Mock
- Spotify Album View Mock
- Spotify Album View Mock
- Spotify Artist View Mock
- Spotify Artist View Mock
- Spotify Artist View Mock
- Spotify Artist View Mock
- Spotify Artist View Mock
- Spotify Artist View Mock
- Spotify Artist View Mock
- Spotify Artist View Mock
- Spotify Artist View Mock 2
- Spotify Artist View Mock 2
- Spotify Artist View Mock 2
- Spotify Artist View Mock 2
- Spotify Artist View Mock 2
- Spotify Artist View Mock 2
- Spotify Artist View Mock 2
- Spotify Artist View Mock 2
- Spotify Artist View Mock 2
- Spotify Artist View Mock 3
- Spotify Artist View Mock 3
- Spotify Artist View Mock 3
- Spotify Artist View Mock 3
- Spotify Artist View Mock 3
- Spotify Artist View Mock 3
- Spotify Artist View Mock 3
- Spotify Connect View Mock
- Spotify Connect View Mock
- Spotify Connect View Mock
- Spotify Connect View Mock
- Spotify Connect View Mock
- Spotify Connect View Mock
- Spotify Connect View Mock
- Spotify Connect View Mock
- Spotify Connect View Mock
- Spotify Connect View Mock
- Spotify Fullscreen View Mock
- Spotify Fullscreen View Mock
- Spotify Fullscreen View Mock
- Spotify Fullscreen View Mock
- Spotify Fullscreen View Mock
- Spotify Fullscreen View Mock
- Spotify Fullscreen View Mock
- Spotify Lyrics View Mock
- Spotify Lyrics View Mock
- Spotify Lyrics View Mock
- Spotify Lyrics View Mock
- Spotify Lyrics View Mock
- Spotify Lyrics View Mock
- Spotify Lyrics View Mock
- Spotify Lyrics View Mock
- Spotify Player View Mock
- Spotify Player View Mock
- Spotify Player View Mock
- Spotify Player View Mock
- Spotify Player View Mock
- Spotify Player View Mock
- Spotify Player View Mock
- Spotify Queue View Mock
- Spotify Queue View Mock
- Spotify Queue View Mock
- Spotify Queue View Mock
- Spotify Queue View Mock
- Spotify Queue View Mock
- Spotify Queue View Mock
- Spotify Search View Mock
- Spotify Search View Mock
- Spotify Search View Mock
- Spotify Search View Mock
- Spotify Search View Mock
- Spotify Search View Mock
- Spotify Search View Mock
- Spotify Search View Mock
- Spotify Search View Mock
- Spotify Single View Mock
- Spotify Single View Mock
- Spotify Single View Mock
- Spotify Single View Mock
- Spotify Single View Mock
- Spotify Single View Mock
- Spotify Single View Mock
- Spotify Single View Mock
- Spotify Single View Mock
- Resonia Client Manifest
- PNPM Workspace Glob
- PNPM Workspace Glob
- Design Inspiration Source
- Resonia Music Player

## God Nodes (most connected - your core abstractions)
1. `useServersStore` - 48 edges
2. `useTranslation()` - 45 edges
3. `getClientForServer()` - 45 edges
4. `usePlayerStore` - 40 edges
5. `GaplessEngine` - 35 edges
6. `SubsonicClient` - 33 edges
7. `CacheStore` - 26 edges
8. `AlbumPage()` - 19 edges
9. `compilerOptions` - 18 edges
10. `TrackDownloader` - 17 edges

## Surprising Connections (you probably didn't know these)
- `AddToPlaylistSubmenuProps` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/components/menu/AddToPlaylistSubmenu.tsx → packages/api-client/src/subsonic/client.ts
- `CreatePlaylistModalProps` --references--> `PlaylistSummary`  [EXTRACTED]
  apps/client/src/app/layout/CreatePlaylistModal.tsx → packages/api-client/src/subsonic/types.ts
- `RenamePlaylistModalProps` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/app/layout/RenamePlaylistModal.tsx → packages/api-client/src/subsonic/client.ts
- `BuildAlbumMenuItemsParams` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/components/menu/buildAlbumMenuItems.tsx → packages/api-client/src/subsonic/client.ts
- `BuildPlaylistMenuItemsParams` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/components/menu/buildPlaylistMenuItems.tsx → packages/api-client/src/subsonic/client.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Audio Engine Invariants** — claude_gapless_playback, claude_preload_next_tracks, claude_audio_cache, claude_transition_control [EXTRACTED 1.00]

## Communities (141 total, 103 thin omitted)

### Community 0 - "UI Pages & Menus"
Cohesion: 0.05
Nodes (85): CreatePlaylistModal(), handleSubmit(), PlaylistSidebarItem(), PlaylistSidebarItemProps, RenamePlaylistModal(), navLinks, Sidebar(), SessionGate() (+77 more)

### Community 1 - "Cover Art & Settings"
Cohesion: 0.06
Nodes (67): platformFetch(), ResolvedAnimatedCover, resolveMasterUrl(), searchKeyFor(), searchResultCache, useAnimatedAlbumCover(), CACHE_LIMIT_OPTIONS_GB, fillBarColor() (+59 more)

### Community 2 - "Audio Cache Store"
Cohesion: 0.05
Nodes (32): CacheStore, createOpfsWriter(), formatMb(), opfsDelete(), opfsFileSize(), opfsReadAll(), requestPersistentStorage(), store (+24 more)

### Community 3 - "Gapless Audio Engine"
Cohesion: 0.09
Nodes (16): DecodedTrack, ActiveBuffer, ActiveNative, BufferPlayback, DecodedTrack, describeMediaError(), GaplessEngine, PendingNext (+8 more)

### Community 4 - "Player Store & Media Session"
Cohesion: 0.09
Nodes (35): AppLayout(), PlayerBar(), formatTime(), PlayerSectionCenter(), PlayerSectionLeft(), PlayerSectionRight(), DropPosition, formatDuration() (+27 more)

### Community 5 - "Subsonic API Client"
Cohesion: 0.07
Nodes (21): CreatePlaylistModalProps, RenamePlaylistModalProps, fetchAlbumTracks(), fetchPlaylistTracks(), PlaylistCardProps, generateSalt(), generateToken(), SubsonicApiError (+13 more)

### Community 6 - "Client Dependencies"
Cohesion: 0.05
Nodes (41): dependencies, @chakra-ui/react, lucide-react, react, react-dom, react-router-dom, @resonia/api-client, tailwindcss (+33 more)

### Community 7 - "Client Dev Dependencies"
Cohesion: 0.06
Nodes (31): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, jsdom, @tauri-apps/cli (+23 more)

### Community 8 - "App Shell & i18n"
Cohesion: 0.15
Nodes (17): src/main.tsx (app entry point), App(), router, DownloadsPage(), StatsPage(), detectBrowserLocale(), I18nContext, I18nContextValue (+9 more)

### Community 9 - "Navidrome Native Auth"
Cohesion: 0.12
Nodes (18): LoginPage(), handleSubmit(), ARTWORK_UPLOAD_PATH(), nativeLogin(), uploadPlaylistArtwork(), decryptPassword(), EncryptedPassword, encryptPassword() (+10 more)

### Community 10 - "Audio Engine Test Mocks"
Cohesion: 0.10
Nodes (9): decodedTrack(), FakeAudioBufferSourceNode, FakeAudioContext, FakeAudioElement, FakeAudioNode, FakeAudioParam, FakeGainNode, installWebAudioMocks() (+1 more)

### Community 11 - "App TS Config"
Cohesion: 0.08
Nodes (23): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+15 more)

### Community 12 - "Tauri App Config"
Cohesion: 0.09
Nodes (22): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+14 more)

### Community 13 - "Blob Storage Layer"
Cohesion: 0.16
Nodes (10): createBlobStore(), createOpfsBlobStore(), getFileHandle(), getRootDir(), safeName(), createTauriFsBlobStore(), pathFor(), safeName() (+2 more)

### Community 14 - "Node TS Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+11 more)

### Community 15 - "Root Workspace Package"
Cohesion: 0.11
Nodes (17): description, devDependencies, eslint, prettier, turbo, typescript, eslint, turbo (+9 more)

### Community 16 - "Turbo Build Pipeline"
Cohesion: 0.13
Nodes (14): ^build, dist/**, dependsOn, outputs, cache, persistent, outputs, $schema (+6 more)

### Community 17 - "CLAUDE.md Project Notes"
Cohesion: 0.15
Nodes (14): Reusable Audio Data Cache, Audio Engine, Desktop Client, Gapless Playback, Navidrome, Preload Next 3 Tracks, Resonia, Rust (+6 more)

### Community 18 - "Cache Store Tests"
Cohesion: 0.15
Nodes (3): FakeTrackDownloader, opfsDeleted, storageState

### Community 19 - "API Client Package Config"
Cohesion: 0.17
Nodes (11): dependencies, spark-md5, devDependencies, @types/spark-md5, main, name, private, type (+3 more)

### Community 21 - "Most Played Albums"
Cohesion: 0.27
Nodes (5): AlbumCard(), AlbumCardProps, MostPlayedAlbums(), MostPlayedAlbumsProps, Album

### Community 22 - "Tauri Capabilities"
Cohesion: 0.20
Nodes (9): description, identifier, permissions, $schema, windows, fs:allow-appcache-read-recursive, fs:allow-appcache-write-recursive, main (+1 more)

### Community 23 - "Animated Artwork Client"
Cohesion: 0.31
Nodes (8): AnimatedArtworkSearchResponse, AnimatedArtworkSearchResult, AnimatedArtworkSources, extractMappedMp4Url(), parseStreamVariants(), pickSmallestCompatibleVariant(), resolveAnimatedArtworkSources(), StreamVariant

### Community 24 - "Last.fm Popular Songs"
Cohesion: 0.29
Nodes (6): normalize(), loadFromLastfm(), run(), getLastfmTopTracks(), LastfmTopTrack, LastfmTopTracksResponse

### Community 25 - "Tauri Icons & Branding"
Cohesion: 0.38
Nodes (7): src-tauri (Tauri desktop backend), 128x128.png (Tauri app icon), 128x128@2x.png (Resonia app icon, retina), 32x32.png (Tauri app icon, small size), Resonia brand icon design (green rounded-square, white R monogram), Resonia brand icon (letter 'R' mark), Resonia Tauri desktop application

### Community 26 - "Client README Notes"
Cohesion: 0.33
Nodes (6): eslint-plugin-react-dom, eslint-plugin-react-x, @vitejs/plugin-react (Oxc), @vitejs/plugin-react-swc (SWC), React Compiler (not enabled, dev/build perf impact), Vite + React + TypeScript template

### Community 28 - "Core Package Config"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 29 - "UI Package Config"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 30 - "README Feature List"
Cohesion: 0.33
Nodes (6): Docker deployment (ghcr.io/midnights-ra1n/resonia-client), Synchronized/unsynchronized lyrics support (feature, done), MPV player backend (feature, done), resonia-client (desktop client for Navidrome/OpenSubsonic), Smart playlist editor (Navidrome) (feature, done), Web player backend (feature, done)

## Knowledge Gaps
- **315 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+310 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **103 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useTranslation()` connect `UI Pages & Menus` to `Cover Art & Settings`, `Player Store & Media Session`, `App Shell & i18n`, `Navidrome Native Auth`, `Most Played Albums`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `usePlayerStore` connect `Player Store & Media Session` to `UI Pages & Menus`, `App Shell & i18n`, `Gapless Audio Engine`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `CacheStore` connect `Audio Cache Store` to `Cover Art & Settings`, `Player Store & Media Session`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _315 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Pages & Menus` be split into smaller, more focused modules?**
  _Cohesion score 0.054139433551198254 - nodes in this community are weakly interconnected._
- **Should `Cover Art & Settings` be split into smaller, more focused modules?**
  _Cohesion score 0.05651176133103844 - nodes in this community are weakly interconnected._
- **Should `Audio Cache Store` be split into smaller, more focused modules?**
  _Cohesion score 0.051929824561403506 - nodes in this community are weakly interconnected._