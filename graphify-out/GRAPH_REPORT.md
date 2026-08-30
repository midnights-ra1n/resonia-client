# Graph Report - resonia-client  (2026-08-26)

## Corpus Check
- 163 files · ~202,192 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1034 nodes · 2095 edges · 151 communities (49 shown, 102 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.62)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Track Download Cache Store
- Gapless Audio Engine
- App Layout & Player Bar
- Playlist Modals & Carousels
- Info Modal & Marquee Text
- Client Package Dependencies
- Session Gate & Album Page
- App Routing & Album Cards
- Client Dev Tooling (ESLint/Vite)
- Playlist Sidebar & Modals
- Gapless Engine Tests
- TypeScript App Config
- Native Login & Password Vault
- Tauri App Configuration
- Blob Store Abstraction
- Artist Popular Songs & Settings
- TypeScript Node Config
- Animated Album Cover Resolution
- Playlist Page Interactions
- Cover Art Cache
- Monorepo Root Package
- App Entry & Router
- Artist/Search Cards & Pages
- Turborepo Pipeline Config
- Settings Page & Artwork Health
- Project README Concepts
- Animated Cover Video & Quality
- Cache Store Tests
- Home Page & Result Sections
- Storage Adapters (Local/Tauri)
- Blob Store Package Deps
- Prefetch Scheduler
- iTunes Search Client
- Tauri Filesystem Permissions
- Animated Artwork Search Client
- Album Carousel Component
- Tauri Desktop Backend & Icons
- Vite/React Plugin Config
- Context Menu Panel
- Package Metadata
- Package Metadata (Secondary)
- Feature/Deployment Notes
- Song Row Component
- TypeScript Project References
- Default Cover Icon Asset
- Favicon Asset
- Resonia Logo Mark
- Resonia App Logo Asset
- Spotify Album Action Bar (ref)
- Spotify Album Header (ref)
- Spotify Dark Theme Pattern (ref)
- Spotify Now-Playing Bar (ref)
- Spotify Album View Screenshot (ref)
- Spotify Library Sidebar (ref)
- Spotify Top Navbar (ref)
- Spotify Track List (ref)
- Artist View: Action Bar (ref)
- Artist View: Hero Banner (ref)
- Artist View: Pick Panel (ref)
- Artist View 1 Screenshot (ref)
- Artist View: Bottom Player (ref)
- Artist View: Library Sidebar (ref)
- Artist View: Popular Tracks (ref)
- Artist View: Top Navbar (ref)
- Album Cover Grid Pattern (ref)
- Artist Header Bar (ref)
- Artist View 2 Screenshot (ref)
- "Avec Jul" Playlists Section (ref)
- Discography Filter Tabs (ref)
- "En tournee" Concerts Section (ref)
- Global Playback Bar (ref)
- Library Sidebar Panel (ref)
- Top Navbar w/ Premium CTA (ref)
- Artist View 3: Appears On (ref)
- Artist View 3: Circular Cards (ref)
- Artist View 3: Fans Also Like (ref)
- Artist View 3: Footer (ref)
- Artist View 3 Screenshot (ref)
- Artist View 3: Square Cards (ref)
- Artist View 3: Sticky Header (ref)
- Bottom Persistent Player (ref)
- Connect Device-Picker Panel (ref)
- Library Sidebar w/ Playlists (ref)
- "Plus de contenus" Shelf (ref)
- Connect Empty State (ref)
- Now Playing Hero Header (ref)
- Connect View Screenshot (ref)
- Active Device Entry (ref)
- Top Navbar Search/Premium (ref)
- Single Track List Row (ref)
- Centered Artwork Panel (ref)
- Ambient Blurred Background (ref)
- Playlist Title Header Bar (ref)
- Fullscreen Now-Playing Layout (ref)
- Mini-Player Transport Bar (ref)
- Fullscreen View Screenshot (ref)
- "Videos similaires" Row (ref)
- Lyrics View: Active Line (ref)
- Lyrics View: Ambient BG (ref)
- Lyrics View: Design Inspiration (ref)
- Lyrics View: Library Sidebar (ref)
- Lyrics View: Lyrics Panel (ref)
- Lyrics View Screenshot (ref)
- Lyrics View: Playback Bar (ref)
- Lyrics View: Top Navbar (ref)
- Player View: Dark Theme (ref)
- Player View: Now Playing Bar (ref)
- Player View: Playback Controls (ref)
- Player View: Seek Bar (ref)
- Player View: Track Info Panel (ref)
- Player View: Utility Controls (ref)
- Player View: Volume Slider (ref)
- "A suivre" Up Next List (ref)
- Bottom Playback Bar w/ Queue (ref)
- Queue Slide-Out Panel (ref)
- Library Sidebar (Queue view) (ref)
- Now-Playing Hero w/ Tracklist (ref)
- Queue View Screenshot (ref)
- Now Playing Queue Header (ref)
- Search: Artist Result Row (ref)
- Search: Bottom Player Bar (ref)
- Search: Category Filter Pills (ref)
- Search: Genre Carousel (ref)
- Search: Library Sidebar (ref)
- Search: Result List Rows (ref)
- Search View Screenshot (ref)
- Search: Top Navbar (ref)
- Search: Top Result Card (ref)
- Track View: Action Toolbar (ref)
- Track View: Hero Banner (ref)
- Track View: Library Sidebar (ref)
- Track View: Discography Carousel (ref)
- Track View: Transport Bar (ref)
- Track View: Release Info Block (ref)
- Single/Track View Screenshot (ref)
- Track View: Top Navbar (ref)
- Track View: Listing Table (ref)
- resonia-client Root
- Apps Workspace Glob
- Packages Workspace Glob
- Spotify Design Inspiration Ref
- resonia-client Project Identity

## God Nodes (most connected - your core abstractions)
1. `useServersStore` - 56 edges
2. `getClientForServer()` - 51 edges
3. `useTranslation()` - 49 edges
4. `usePlayerStore` - 48 edges
5. `GaplessEngine` - 41 edges
6. `SubsonicClient` - 39 edges
7. `CacheStore` - 26 edges
8. `PlaylistPage()` - 25 edges
9. `AlbumPage()` - 21 edges
10. `AlbumSummary` - 19 edges

## Surprising Connections (you probably didn't know these)
- `CreatePlaylistModalProps` --references--> `PlaylistSummary`  [EXTRACTED]
  apps/client/src/app/layout/CreatePlaylistModal.tsx → packages/api-client/src/subsonic/types.ts
- `RenamePlaylistModalProps` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/app/layout/RenamePlaylistModal.tsx → packages/api-client/src/subsonic/client.ts
- `AddToPlaylistSubmenuProps` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/components/menu/AddToPlaylistSubmenu.tsx → packages/api-client/src/subsonic/client.ts
- `BuildAlbumMenuItemsParams` --references--> `SubsonicClient`  [EXTRACTED]
  apps/client/src/components/menu/buildAlbumMenuItems.tsx → packages/api-client/src/subsonic/client.ts
- `BuildAlbumMenuItemsParams` --references--> `AlbumSummary`  [EXTRACTED]
  apps/client/src/components/menu/buildAlbumMenuItems.tsx → packages/api-client/src/subsonic/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Audio Engine Invariants** — claude_gapless_playback, claude_preload_next_tracks, claude_audio_cache, claude_transition_control [EXTRACTED 1.00]

## Communities (151 total, 102 thin omitted)

### Community 0 - "Track Download Cache Store"
Cohesion: 0.05
Nodes (30): CacheStore, createOpfsWriter(), formatMb(), opfsDelete(), opfsFileSize(), opfsReadAll(), requestPersistentStorage(), store (+22 more)

### Community 1 - "Gapless Audio Engine"
Cohesion: 0.08
Nodes (18): debugLog(), isEnabled(), DecodedTrack, ActiveBuffer, ActiveNative, BufferPlayback, DecodedTrack, describeMediaError() (+10 more)

### Community 2 - "App Layout & Player Bar"
Cohesion: 0.07
Nodes (45): AppLayout(), handleKeyDown(), isTypingTarget(), PlayerBar(), formatTime(), PlayerSectionCenter(), ProgressBar(), PlayerSectionLeft() (+37 more)

### Community 3 - "Playlist Modals & Carousels"
Cohesion: 0.07
Nodes (22): RenamePlaylistModalProps, AddToPlaylistSubmenuProps, fetchPlaylistTracks(), RandomSongCardProps, RandomSongsCarousel(), RandomSongsCarouselProps, TrackResultRowProps, generateSalt() (+14 more)

### Community 4 - "Info Modal & Marquee Text"
Cohesion: 0.13
Nodes (27): InfoModal(), InfoModalProps, MarqueeText(), MarqueeTextProps, buildAlbumMenuItems(), BuildAlbumMenuItemsParams, fetchAlbumTracks(), BuildPlaylistMenuItemsParams (+19 more)

### Community 5 - "Client Package Dependencies"
Cohesion: 0.05
Nodes (41): dependencies, hls.js, lucide-react, react, react-dom, react-router-dom, @resonia/api-client, tailwindcss (+33 more)

### Community 6 - "Session Gate & Album Page"
Cohesion: 0.17
Nodes (20): SessionGate(), SessionStatus, AlbumCarousel(), useAlbum(), useArtistAlbums(), run(), SimilarAlbumsTitle, useSimilarAlbums() (+12 more)

### Community 7 - "App Routing & Album Cards"
Cohesion: 0.12
Nodes (19): App(), router, AlbumCard(), AlbumCardProps, MostPlayedAlbums(), MostPlayedAlbumsProps, detectBrowserLocale(), I18nContext (+11 more)

### Community 8 - "Client Dev Tooling (ESLint/Vite)"
Cohesion: 0.06
Nodes (31): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, jsdom, @tauri-apps/cli (+23 more)

### Community 9 - "Playlist Sidebar & Modals"
Cohesion: 0.15
Nodes (14): CreatePlaylistModal(), handleSubmit(), PlaylistSidebarItem(), PlaylistSidebarItemProps, RenamePlaylistModal(), navLinks, Sidebar(), ConfirmDeleteModal() (+6 more)

### Community 10 - "Gapless Engine Tests"
Cohesion: 0.10
Nodes (9): decodedTrack(), FakeAudioBufferSourceNode, FakeAudioContext, FakeAudioElement, FakeAudioNode, FakeAudioParam, FakeGainNode, installWebAudioMocks() (+1 more)

### Community 11 - "TypeScript App Config"
Cohesion: 0.08
Nodes (23): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+15 more)

### Community 12 - "Native Login & Password Vault"
Cohesion: 0.13
Nodes (15): handleSubmit(), ARTWORK_UPLOAD_PATH(), nativeLogin(), uploadPlaylistArtwork(), decryptPassword(), encryptPassword(), getOrCreateKey(), CachedToken (+7 more)

### Community 13 - "Tauri App Configuration"
Cohesion: 0.09
Nodes (22): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+14 more)

### Community 14 - "Blob Store Abstraction"
Cohesion: 0.16
Nodes (10): createBlobStore(), createOpfsBlobStore(), getFileHandle(), getRootDir(), safeName(), createTauriFsBlobStore(), pathFor(), safeName() (+2 more)

### Community 15 - "Artist Popular Songs & Settings"
Cohesion: 0.14
Nodes (17): normalize(), PopularSongsSource, useArtistPopularSongs(), loadFromLastfm(), run(), setCoverCacheMaxBytes(), applyCacheMaxBytes(), DEFAULT_CACHE_MAX_BYTES (+9 more)

### Community 16 - "TypeScript Node Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+11 more)

### Community 17 - "Animated Album Cover Resolution"
Cohesion: 0.21
Nodes (15): appleMusicUrlCache, appleMusicUrlCacheKeyFor(), platformFetch(), ResolvedAnimatedCover, resolveMasterUrl(), resolveMasterUrlViaAppleMusicUrl(), searchKeyFor(), searchResultCache (+7 more)

### Community 18 - "Playlist Page Interactions"
Cohesion: 0.16
Nodes (12): PlaylistPage(), handlePlayPlaylist(), handleTrackClick(), toTrack(), sortPlaylistEntries(), useTrackListSelection(), clearSelection(), ensureSelected() (+4 more)

### Community 19 - "Cover Art Cache"
Cohesion: 0.24
Nodes (16): ResolvedCover, CacheEntryMeta, cacheKeyFor(), clearCoverCache(), currentCoverCacheSize(), enforceLimit(), fetchForCache(), getCachedCoverUrl() (+8 more)

### Community 20 - "Monorepo Root Package"
Cohesion: 0.11
Nodes (17): description, devDependencies, eslint, prettier, turbo, typescript, eslint, turbo (+9 more)

### Community 21 - "App Entry & Router"
Cohesion: 0.17
Nodes (12): src/main.tsx (app entry point), AlbumPage(), handlePlayAlbum(), handleTrackClick(), toTrack(), formatAlbumDuration(), formatTrackDuration(), ArtistPage() (+4 more)

### Community 22 - "Artist/Search Cards & Pages"
Cohesion: 0.19
Nodes (12): CreatePlaylistModalProps, ArtistCard(), ArtistCardProps, PlaylistCardProps, SearchPage(), EMPTY_RESULTS, SearchResults, useSearch() (+4 more)

### Community 23 - "Turborepo Pipeline Config"
Cohesion: 0.13
Nodes (14): ^build, dist/**, dependsOn, outputs, cache, persistent, outputs, $schema (+6 more)

### Community 24 - "Settings Page & Artwork Health"
Cohesion: 0.25
Nodes (13): clearAnimatedCoverResolutionCache(), AnimatedArtworkHealth, CACHE_LIMIT_OPTIONS_GB, fillBarColor(), formatBytes(), isValidAnimatedArtworkUrl(), LOCALE_LABELS, platformFetch() (+5 more)

### Community 25 - "Project README Concepts"
Cohesion: 0.15
Nodes (14): Reusable Audio Data Cache, Audio Engine, Desktop Client, Gapless Playback, Navidrome, Preload Next 3 Tracks, Resonia, Rust (+6 more)

### Community 26 - "Animated Cover Video & Quality"
Cohesion: 0.22
Nodes (10): AnimatedAlbumCoverVideo(), AnimatedAlbumCoverVideoProps, AUDIO_QUALITIES, AudioQuality, DEFAULT_QUALITY_ID, FORMAT_MIME, getAvailableQualities(), isFormatPlayable() (+2 more)

### Community 27 - "Cache Store Tests"
Cohesion: 0.15
Nodes (3): FakeTrackDownloader, opfsDeleted, storageState

### Community 28 - "Home Page & Result Sections"
Cohesion: 0.23
Nodes (7): HomePage(), useHomePlaylists(), PlaylistCard(), ResultSection(), ResultSectionProps, AlbumListType, useAlbumList()

### Community 29 - "Storage Adapters (Local/Tauri)"
Cohesion: 0.27
Nodes (4): storage, localStorageAdapter, tauriStoreAdapter, StorageAdapter

### Community 30 - "Blob Store Package Deps"
Cohesion: 0.17
Nodes (11): dependencies, spark-md5, devDependencies, @types/spark-md5, main, name, private, type (+3 more)

### Community 32 - "iTunes Search Client"
Cohesion: 0.33
Nodes (10): findAlbumInArtistCatalog(), findArtistId(), findExactAlbumMatch(), ItunesArtistResult, ItunesSearchResponse, ItunesSearchResult, normalizeForComparison(), resolveAppleMusicAlbumUrl() (+2 more)

### Community 33 - "Tauri Filesystem Permissions"
Cohesion: 0.20
Nodes (9): description, identifier, permissions, $schema, windows, fs:allow-appcache-read-recursive, fs:allow-appcache-write-recursive, main (+1 more)

### Community 34 - "Animated Artwork Search Client"
Cohesion: 0.27
Nodes (9): AnimatedArtworkSearchResponse, AnimatedArtworkSearchResult, AnimatedArtworkStatusResponse, DEFAULT_ANIMATED_ARTWORK_BASE_URL, normalizeTitle(), searchAnimatedArtwork(), searchAnimatedArtworkByUrl(), searchEndpointFor() (+1 more)

### Community 35 - "Album Carousel Component"
Cohesion: 0.25
Nodes (5): AlbumCarouselProps, AlbumCard(), AlbumCardProps, AlbumResultRowProps, AlbumSummary

### Community 36 - "Tauri Desktop Backend & Icons"
Cohesion: 0.38
Nodes (7): src-tauri (Tauri desktop backend), 128x128.png (Tauri app icon), 128x128@2x.png (Resonia app icon, retina), 32x32.png (Tauri app icon, small size), Resonia brand icon design (green rounded-square, white R monogram), Resonia brand icon (letter 'R' mark), Resonia Tauri desktop application

### Community 37 - "Vite/React Plugin Config"
Cohesion: 0.33
Nodes (6): eslint-plugin-react-dom, eslint-plugin-react-x, @vitejs/plugin-react (Oxc), @vitejs/plugin-react-swc (SWC), React Compiler (not enabled, dev/build perf impact), Vite + React + TypeScript template

### Community 39 - "Package Metadata"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 40 - "Package Metadata (Secondary)"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 41 - "Feature/Deployment Notes"
Cohesion: 0.33
Nodes (6): Docker deployment (ghcr.io/midnights-ra1n/resonia-client), Synchronized/unsynchronized lyrics support (feature, done), MPV player backend (feature, done), resonia-client (desktop client for Navidrome/OpenSubsonic), Smart playlist editor (Navidrome) (feature, done), Web player backend (feature, done)

## Knowledge Gaps
- **321 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+316 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **102 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CacheStore` connect `Track Download Cache Store` to `Settings Page & Artwork Health`, `App Layout & Player Bar`, `Artist Popular Songs & Settings`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `usePlayerStore` connect `App Layout & Player Bar` to `Gapless Audio Engine`, `Album Carousel Component`, `Info Modal & Marquee Text`, `Session Gate & Album Page`, `App Routing & Album Cards`, `Playlist Sidebar & Modals`, `Playlist Page Interactions`, `App Entry & Router`, `Home Page & Result Sections`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _321 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Track Download Cache Store` be split into smaller, more focused modules?**
  _Cohesion score 0.05257312106627175 - nodes in this community are weakly interconnected._
- **Should `Gapless Audio Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.0819252432155658 - nodes in this community are weakly interconnected._
- **Should `App Layout & Player Bar` be split into smaller, more focused modules?**
  _Cohesion score 0.07350608143839238 - nodes in this community are weakly interconnected._
- **Should `Playlist Modals & Carousels` be split into smaller, more focused modules?**
  _Cohesion score 0.06717687074829932 - nodes in this community are weakly interconnected._