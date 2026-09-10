# Graph Report - resonia-client  (2026-09-10)

## Corpus Check
- 172 files · ~210,301 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1095 nodes · 2303 edges · 154 communities (48 shown, 106 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.56)
- Token cost: 132,606 input · 0 output

## Community Hubs (Navigation)
- Playlist & Album UI
- Playlist Sidebar & Modals
- App Layout & Player Bar
- Card & Carousel Props
- Gapless Audio Engine
- Frontend Dependencies
- Debug/Network Panel
- Dev Tooling Dependencies
- Animated Cover Resolution
- OPFS Blob Storage
- Gapless Engine Tests
- TS App Compiler Config
- Favorites & Playlist Page
- Tauri App Config
- Audio Cache Store
- TS Node Compiler Config
- App Shell & Session Gate
- Client Package Metadata
- OPFS Range Fetching
- i18n Translation System
- Track Downloader
- Cover Image Cache
- Turbo Build Pipeline
- Resonia Engine Invariants
- Animated Cover Video & Quality
- Prefetch Scheduler Types
- Cache Store Tests
- Settings Page & Artwork Health
- Storage Adapter Abstraction
- spark-md5 Dependency
- Prefetch Scheduler
- Apple Music Album Resolver
- Most Played Albums UI
- Tauri FS Permissions
- Navidrome Native Client
- Prefetch Scheduler Tests
- Vite React Plugins
- Context Menu Panel
- Package Metadata
- Package Metadata
- Resonia Feature Roadmap
- Song Row Component
- TS Project References
- Default Cover Icon Asset
- Favicon Asset
- Resonia Logo Mark
- App Icon 128x2x
- App Icon 128
- App Icon 32
- Resonia App Logo
- Spotify Action Bar Reference
- Spotify Album Header Reference
- Spotify Dark Theme Reference
- Spotify Now-Playing Bar Reference
- Spotify Album View Screenshot
- Spotify Sidebar Reference
- Spotify Top Nav Reference
- Spotify Track List Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify Album Grid Reference
- Spotify Artist Header Reference
- Spotify Artist View Screenshot
- Spotify Artist Playlists Reference
- Spotify Discography Reference
- Spotify Tour Dates Reference
- Spotify Playback Bar Reference
- Spotify Sidebar Reference
- Spotify Top Nav Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify Player Bar Reference
- Spotify Device Picker Reference
- Spotify Sidebar Reference
- Spotify Artist Shelf Reference
- Spotify Empty State Reference
- Spotify Now Playing Hero Reference
- Spotify Connect View Screenshot
- Spotify Active Device Reference
- Spotify Top Nav Reference
- Spotify Track Row Reference
- Spotify Artwork Panel Reference
- Spotify Ambient Background Reference
- Spotify Header Bar Reference
- Spotify Fullscreen Layout Reference
- Spotify Mini Player Reference
- Spotify Fullscreen Screenshot
- Spotify Related Videos Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify Up Next Reference
- Spotify Player Bar Reference
- Spotify Queue Panel Reference
- Spotify Sidebar Reference
- Spotify Now Playing Hero Reference
- Spotify Queue Screenshot
- Spotify Now Playing Section Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify UI Reference
- Spotify Toolbar Reference
- Spotify Hero Banner Reference
- Spotify Sidebar Reference
- Spotify Discography Carousel Reference
- Spotify Playback Bar Reference
- Spotify Release Info Reference
- Spotify Track View Screenshot
- Spotify Top Nav Reference
- Spotify Track Listing Reference
- Resonia Repo Root
- Apps Workspace Glob
- Packages Workspace Glob
- Spotify Design Inspiration
- Resonia Client Overview
- Resonia App Icon Diamond

## God Nodes (most connected - your core abstractions)
1. `useServersStore` - 65 edges
2. `getClientForServer()` - 59 edges
3. `usePlayerStore` - 55 edges
4. `useTranslation()` - 53 edges
5. `GaplessEngine` - 45 edges
6. `SubsonicClient` - 42 edges
7. `CacheStore` - 29 edges
8. `PlaylistPage()` - 25 edges
9. `AlbumPage()` - 21 edges
10. `Track` - 20 edges

## Surprising Connections (you probably didn't know these)
- `AddToPlaylistSubmenuProps` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/components/menu/AddToPlaylistSubmenu.tsx → packages/api-client/src/subsonic/client.ts
- `CreatePlaylistModalProps` --references--> `PlaylistSummary`  [EXTRACTED]
  apps/client/src/app/layout/CreatePlaylistModal.tsx → packages/api-client/src/subsonic/types.ts
- `RenamePlaylistModalProps` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/app/layout/RenamePlaylistModal.tsx → packages/api-client/src/subsonic/client.ts
- `BuildAlbumMenuItemsParams` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/components/menu/buildAlbumMenuItems.tsx → packages/api-client/src/subsonic/client.ts
- `BuildAlbumMenuItemsParams` --references--> `AlbumSummary`  [EXTRACTED]
  apps/client/src/components/menu/buildAlbumMenuItems.tsx → packages/api-client/src/subsonic/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Audio Engine Invariants** — claude_gapless_playback, claude_preload_next_tracks, claude_audio_cache, claude_transition_control [EXTRACTED 1.00]

## Communities (154 total, 106 thin omitted)

### Community 0 - "Playlist & Album UI"
Cohesion: 0.06
Nodes (66): src/main.tsx (app entry point), CreatePlaylistModal(), handleSubmit(), AlbumCarousel(), AlbumPage(), handlePlayAlbum(), handleTrackClick(), toTrack() (+58 more)

### Community 1 - "Playlist Sidebar & Modals"
Cohesion: 0.08
Nodes (44): PlaylistSidebarItem(), PlaylistSidebarItemProps, RenamePlaylistModal(), ConfirmDeleteModal(), ConfirmDeleteModalProps, InfoModal(), InfoModalProps, MarqueeText() (+36 more)

### Community 2 - "App Layout & Player Bar"
Cohesion: 0.07
Nodes (49): AppLayout(), handleKeyDown(), isTypingTarget(), navLinks, Sidebar(), PitchMenu(), trackFillGradient(), PlayerBar() (+41 more)

### Community 3 - "Card & Carousel Props"
Cohesion: 0.06
Nodes (32): CreatePlaylistModalProps, RenamePlaylistModalProps, fetchAlbumTracks(), AlbumCarouselProps, AlbumCardProps, RandomSongCardProps, RandomSongsCarousel(), RandomSongsCarouselProps (+24 more)

### Community 4 - "Gapless Audio Engine"
Cohesion: 0.08
Nodes (17): debugLog(), DecodedTrack, ActiveBuffer, ActiveNative, BufferPlayback, DecodedTrack, describeMediaError(), GaplessEngine (+9 more)

### Community 5 - "Frontend Dependencies"
Cohesion: 0.05
Nodes (41): dependencies, hls.js, lucide-react, react, react-dom, react-router-dom, @resonia/api-client, tailwindcss (+33 more)

### Community 6 - "Debug/Network Panel"
Cohesion: 0.11
Nodes (30): BandwidthHistoryChart(), DebugPanel(), DecodeTab(), EventLog(), formatBytes(), formatKey(), formatRate(), LiveChunkStrip() (+22 more)

### Community 7 - "Dev Tooling Dependencies"
Cohesion: 0.06
Nodes (31): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, jsdom, @tauri-apps/cli (+23 more)

### Community 8 - "Animated Cover Resolution"
Cohesion: 0.13
Nodes (24): appleMusicUrlCache, appleMusicUrlCacheKeyFor(), platformFetch(), ResolvedAnimatedCover, resolveMasterUrl(), resolveMasterUrlViaAppleMusicUrl(), searchKeyFor(), searchResultCache (+16 more)

### Community 9 - "OPFS Blob Storage"
Cohesion: 0.13
Nodes (14): formatMb(), requestPersistentStorage(), store, getPlatform(), createBlobStore(), createOpfsBlobStore(), getFileHandle(), getRootDir() (+6 more)

### Community 10 - "Gapless Engine Tests"
Cohesion: 0.10
Nodes (9): decodedTrack(), FakeAudioBufferSourceNode, FakeAudioContext, FakeAudioElement, FakeAudioNode, FakeAudioParam, FakeGainNode, installWebAudioMocks() (+1 more)

### Community 11 - "TS App Compiler Config"
Cohesion: 0.08
Nodes (23): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+15 more)

### Community 12 - "Favorites & Playlist Page"
Cohesion: 0.13
Nodes (17): FavoritesPage(), handlePlayAll(), handleTrackClick(), toTrack(), unlike(), PlaylistPage(), handlePlayPlaylist(), handleTrackClick() (+9 more)

### Community 13 - "Tauri App Config"
Cohesion: 0.09
Nodes (22): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+14 more)

### Community 14 - "Audio Cache Store"
Cohesion: 0.20
Nodes (5): CacheStore, metaEntryKey(), opfsDelete(), opfsReadAll(), CacheEntryMeta

### Community 15 - "TS Node Compiler Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+11 more)

### Community 16 - "App Shell & Session Gate"
Cohesion: 0.16
Nodes (14): App(), router, SessionGate(), SessionStatus, setAudioDebugEnabled(), setCoverCacheMaxBytes(), applyCacheMaxBytes(), DEFAULT_CACHE_MAX_BYTES (+6 more)

### Community 17 - "Client Package Metadata"
Cohesion: 0.11
Nodes (17): description, devDependencies, eslint, prettier, turbo, typescript, eslint, turbo (+9 more)

### Community 18 - "OPFS Range Fetching"
Cohesion: 0.20
Nodes (10): createOpfsWriter(), opfsFileSize(), EndOfStreamError, fetchRange(), fetchRangeOnce(), isTransient(), RangeChunk, sleep() (+2 more)

### Community 19 - "i18n Translation System"
Cohesion: 0.24
Nodes (12): detectBrowserLocale(), I18nContext, I18nContextValue, I18nProvider(), getByPath(), interpolate(), resolveTranslation(), translations (+4 more)

### Community 20 - "Track Downloader"
Cohesion: 0.16
Nodes (3): TrackDownloader, DownloadPriority, ProgressListener

### Community 21 - "Cover Image Cache"
Cohesion: 0.28
Nodes (15): CacheEntryMeta, cacheKeyFor(), clearCoverCache(), currentCoverCacheSize(), enforceLimit(), fetchForCache(), getCachedCoverUrl(), loadAndCacheCover() (+7 more)

### Community 22 - "Turbo Build Pipeline"
Cohesion: 0.13
Nodes (14): ^build, dist/**, dependsOn, outputs, cache, persistent, outputs, $schema (+6 more)

### Community 23 - "Resonia Engine Invariants"
Cohesion: 0.15
Nodes (14): Reusable Audio Data Cache, Audio Engine, Desktop Client, Gapless Playback, Navidrome, Preload Next 3 Tracks, Resonia, Rust (+6 more)

### Community 24 - "Animated Cover Video & Quality"
Cohesion: 0.22
Nodes (10): AnimatedAlbumCoverVideo(), AnimatedAlbumCoverVideoProps, AUDIO_QUALITIES, AudioQuality, DEFAULT_QUALITY_ID, FORMAT_MIME, getAvailableQualities(), isFormatPlayable() (+2 more)

### Community 25 - "Prefetch Scheduler Types"
Cohesion: 0.17
Nodes (7): QueueSlot, UpcomingTrack, ChunkListener, CACHE_FORMAT_VERSION, cacheKeyFor(), CacheKeyParts, DownloadProgress

### Community 26 - "Cache Store Tests"
Cohesion: 0.15
Nodes (3): FakeTrackDownloader, opfsDeleted, storageState

### Community 27 - "Settings Page & Artwork Health"
Cohesion: 0.27
Nodes (11): clearAnimatedCoverResolutionCache(), AnimatedArtworkHealth, CACHE_LIMIT_OPTIONS_GB, fillBarColor(), formatBytes(), isValidAnimatedArtworkUrl(), LOCALE_LABELS, platformFetch() (+3 more)

### Community 28 - "Storage Adapter Abstraction"
Cohesion: 0.27
Nodes (4): storage, localStorageAdapter, tauriStoreAdapter, StorageAdapter

### Community 29 - "spark-md5 Dependency"
Cohesion: 0.17
Nodes (11): dependencies, spark-md5, devDependencies, @types/spark-md5, main, name, private, type (+3 more)

### Community 31 - "Apple Music Album Resolver"
Cohesion: 0.33
Nodes (10): findAlbumInArtistCatalog(), findArtistId(), findExactAlbumMatch(), ItunesArtistResult, ItunesSearchResponse, ItunesSearchResult, normalizeForComparison(), resolveAppleMusicAlbumUrl() (+2 more)

### Community 32 - "Most Played Albums UI"
Cohesion: 0.27
Nodes (5): AlbumCard(), AlbumCardProps, MostPlayedAlbums(), MostPlayedAlbumsProps, Album

### Community 33 - "Tauri FS Permissions"
Cohesion: 0.20
Nodes (9): description, identifier, permissions, $schema, windows, fs:allow-appcache-read-recursive, fs:allow-appcache-write-recursive, main (+1 more)

### Community 34 - "Navidrome Native Client"
Cohesion: 0.25
Nodes (4): NavidromeAuthResult, NavidromeNativeClient, NavidromeSong, NavidromeSongTags

### Community 35 - "Prefetch Scheduler Tests"
Cohesion: 0.29
Nodes (4): FakeTask, protectedKeysHistory, requestedOrder, tasks

### Community 36 - "Vite React Plugins"
Cohesion: 0.33
Nodes (6): eslint-plugin-react-dom, eslint-plugin-react-x, @vitejs/plugin-react (Oxc), @vitejs/plugin-react-swc (SWC), React Compiler (not enabled, dev/build perf impact), Vite + React + TypeScript template

### Community 38 - "Package Metadata"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 39 - "Package Metadata"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 40 - "Resonia Feature Roadmap"
Cohesion: 0.33
Nodes (6): Docker deployment (ghcr.io/midnights-ra1n/resonia-client), Synchronized/unsynchronized lyrics support (feature, done), MPV player backend (feature, done), resonia-client (desktop client for Navidrome/OpenSubsonic), Smart playlist editor (Navidrome) (feature, done), Web player backend (feature, done)

## Knowledge Gaps
- **331 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+326 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **106 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `usePlayerStore` connect `App Layout & Player Bar` to `Playlist & Album UI`, `Playlist Sidebar & Modals`, `Gapless Audio Engine`, `Debug/Network Panel`, `Favorites & Playlist Page`, `App Shell & Session Gate`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `CacheStore` connect `Audio Cache Store` to `App Layout & Player Bar`, `Debug/Network Panel`, `App Shell & Session Gate`, `Track Downloader`, `Prefetch Scheduler Types`, `Settings Page & Artwork Health`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _331 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Playlist & Album UI` be split into smaller, more focused modules?**
  _Cohesion score 0.056493884682585906 - nodes in this community are weakly interconnected._
- **Should `Playlist Sidebar & Modals` be split into smaller, more focused modules?**
  _Cohesion score 0.08425925925925926 - nodes in this community are weakly interconnected._
- **Should `App Layout & Player Bar` be split into smaller, more focused modules?**
  _Cohesion score 0.06606990622335891 - nodes in this community are weakly interconnected._
- **Should `Card & Carousel Props` be split into smaller, more focused modules?**
  _Cohesion score 0.05505952380952381 - nodes in this community are weakly interconnected._