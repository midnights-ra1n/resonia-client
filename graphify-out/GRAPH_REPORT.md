# Graph Report - resonia-client  (2026-09-14)

## Corpus Check
- 201 files · ~234,828 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1414 nodes · 3184 edges · 187 communities (72 shown, 115 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 44 edges (avg confidence: 0.61)
- Token cost: 0 input · 173,073 output

## Community Hubs (Navigation)
- Download Manager UI
- Gapless Audio Engine Core
- Playlist/Album Menu Actions
- Playback Controls & Marquee Text
- Create Playlist & Album Data Hooks
- Playlist Sidebar Items
- Audio Debug Panel
- App Routing & Entry Point
- Album Page Playback Actions
- Tauri App Configuration
- Gapless Engine Test Suite
- Audio LRU Cache Store
- Client Runtime Dependencies
- Client Dev Tooling Dependencies
- Native Login & Password Vault
- Client TS Compiler Config
- Update Notifier & Cache Settings
- Monorepo Root Package Config
- Sidebar Navigation
- Decoded Buffer Cache & Shuffle Order
- Node TS Compiler Config
- Favorites & Search Pages
- Track Downloader
- Cover Art Cache
- Animated Artwork Settings
- Animated Album Cover Resolution
- OS Media Session Integration
- Playlist Page Row Actions
- Release Build Rationale Notes
- Lyrics Service Fetching
- Blob Storage Backends
- Pitch Menu Fader
- Dominant Color Cache
- HTTP Range Fetcher
- Turborepo Task Pipeline
- Tauri Filesystem Permissions
- Resonia Concept Overview
- App Layout Keyboard Shortcuts
- Audio Quality Options
- Cache Store Test Suite
- Synced Lyrics View
- Storage Adapter Abstraction
- API Client Package
- m8tec Animated Artwork Client
- Queue Panel Drag & Drop
- Prefetch Scheduler
- Tauri Rust Entry Point
- iTunes Search Client
- Client NPM Scripts
- Most Played Albums Widget
- Context Menu Positioning
- Prefetch Scheduler Test Suite
- Carousel Scroll Controls
- Track/Album/Playlist Menu Icons
- Player Bar Transport Controls
- OPFS Cache Store I/O
- LRCLIB Lyrics Client
- Last.fm Top Tracks
- Vite/React Build Tooling
- Cache Type Definitions
- Beta Tauri Updater Config
- core Package Manifest
- ui Package Manifest
- Product Feature/Deployment Notes
- Version Bump Script
- client Package Manifest
- Song Row Component
- Root TS Project References
- Vite Build Config
- Bump Version Script
- Material Symbols Icon Dependency
- Tauri HTTP Plugin
- Tauri Process Plugin
- ESLint React Refresh Plugin
- React Type Definitions
- TypeScript Compiler Dependency
- typescript-eslint Dependency
- CI Lint & Test Jobs
- Default Cover Icon
- Resonia Favicon Icon
- Resonia 'R' Logo Mark
- Resonia App Icon
- Resonia App Icon
- Resonia App Icon
- Resonia App Logo
- Action Bar
- Album Header
- Dark Theme Design Pattern
- Bottom Now-Playing Bar
- Spotify Album View Screenshot
- Left Sidebar
- Top Navigation Bar
- Track List
- Artist Action Bar
- Artist Hero Banner
- Artist Pick Panel
- Spotify Artist View Screenshot
- Bottom Playback Bar
- Left Library Sidebar
- Popular Tracks List
- Top Navigation Bar
- Horizontal scrollable album cover grid with t...
- Artist header bar
- Artist View 2 Screenshot
- Avec Jul' section - playlists featuring the a...
- Discographie section with filter tabs
- En tournee
- Bottom global playback control bar
- Left sidebar Bibliotheque
- Top navigation bar
- Apparaît sur
- Circular artist card pattern
- Les fans aiment aussi
- Site footer with 'Societe', 'Communautes', 'L...
- Artist View 3 Screenshot
- Square album/single card pattern
- Sticky mini-header bar
- Bottom Persistent Player Bar
- Connect Device-Picker Panel
- Left Sidebar
- Plus de contenus de Jul" Artist Content Shelf
- Aucun autre appareil detecte" Empty State wit...
- Now Playing Hero Header
- Connect View Screenshot
- Ce navigateur web" Active Device Entry
- Top Navigation Bar
- Single Track List Row
- Centered large album/video artwork panel
- Blurred dark-blue ambient background derived...
- Top header bar with playlist title and icon c...
- Fullscreen now-playing layout pattern
- Bottom mini-player transport controls bar
- Fullscreen_view.png
- Vidéos similaires" horizontal thumbnail row
- Active Lyric Line Highlight
- Album-art-derived Teal/Dark Gradient Background
- Design Inspiration Reference for Resonia Clie...
- Left Library Sidebar
- Full-height Synced Lyrics Panel
- Spotify Lyrics View Screenshot
- Bottom Playback Control Bar
- Top Navigation Bar
- Dark theme, minimal three-column bottom bar l...
- Now Playing Bar
- Playback Controls
- Seek Bar with elapsed/remaining time labels
- Track Info Panel
- Utility Controls
- Volume Slider
- A suivre
- Bottom playback bar with mini cover art, trac...
- File d'attente
- Left 'Bibliotheque
- Main center now-playing hero panel with large...
- Queue_view.png
- Titre en cours de lecture
- Artist Result Row
- Bottom Playback Control Bar
- Category Filter Pills
- Genre Playlist Carousel
- Left Sidebar Library Panel
- Search Result List Rows
- Spotify Search View Screenshot
- Top Navigation Bar
- Top Result Card
- Action Toolbar
- Gradient Hero Header Banner
- Left Sidebar
- Plus de contenus de" Artist Discography Carousel
- Bottom Now-Playing Transport Bar
- Release Info Block
- Spotify Single/Track View Layout Screenshot
- Top Navigation Bar
- Track Listing Table
- CI: build job
- resonia-client
- apps/* workspace glob
- packages/* workspace glob
- Spotify web UI
- resonia-client

## God Nodes (most connected - your core abstractions)
1. `useServersStore` - 75 edges
2. `getClientForServer()` - 68 edges
3. `usePlayerStore` - 66 edges
4. `useTranslation()` - 65 edges
5. `GaplessEngine` - 48 edges
6. `DownloadStore` - 45 edges
7. `SubsonicClient` - 44 edges
8. `Track` - 33 edges
9. `CacheStore` - 30 edges
10. `PlaylistPage()` - 29 edges

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
- **CI quality gate: independent lint/test/build checks per PR** — github_workflows_ci_lint, github_workflows_ci_test, github_workflows_ci_build [EXTRACTED 1.00]
- **Release (beta) pipeline: version resolution, desktop matrix build, docker image, gated publish, updater pointer** — github_workflows_release_beta_resolveversion, github_workflows_release_beta_release, github_workflows_release_beta_dockerweb, github_workflows_release_beta_publishrelease, github_workflows_release_beta_publishbetapointer [EXTRACTED 1.00]
- **Release (stable) pipeline: version resolution, desktop matrix build, docker image, gated publish** — github_workflows_release_stable_resolveversion, github_workflows_release_stable_release, github_workflows_release_stable_dockerweb, github_workflows_release_stable_publishrelease [EXTRACTED 1.00]

## Communities (187 total, 115 thin omitted)

### Community 0 - "Download Manager UI"
Cohesion: 0.06
Nodes (27): Download, BuildTrackMenuItemsParams, DownloadProgressRow(), EMPTY_PROGRESS, PendingDownloadItem, DownloadsIndicator(), LikeButtonProps, getQualityById() (+19 more)

### Community 1 - "Gapless Audio Engine Core"
Cohesion: 0.08
Nodes (18): debugLog(), DecodedTrack, ActiveBuffer, ActiveNative, BufferPlayback, createAudioContext(), DecodedTrack, describeMediaError() (+10 more)

### Community 2 - "Playlist/Album Menu Actions"
Cohesion: 0.05
Nodes (32): CreatePlaylistModalProps, RenamePlaylistModalProps, AddToPlaylistSubmenuProps, BuildAlbumMenuItemsParams, fetchAlbumTracks(), fetchPlaylistTracks(), AlbumCarouselProps, AlbumCardProps (+24 more)

### Community 3 - "Playback Controls & Marquee Text"
Cohesion: 0.14
Nodes (27): Play, InfoModal(), InfoModalProps, MarqueeText(), MarqueeTextProps, buildAlbumMenuItems(), buildTrackMenuItems(), ContextMenu() (+19 more)

### Community 4 - "Create Playlist & Album Data Hooks"
Cohesion: 0.15
Nodes (24): CreatePlaylistModal(), handleSubmit(), SimilarAlbumsTitle, ArtistPage(), handlePlay(), toTrack(), useArtist(), PopularSongsSource (+16 more)

### Community 5 - "Playlist Sidebar Items"
Cohesion: 0.11
Nodes (22): PlaylistSidebarItem(), PlaylistSidebarItemProps, RenamePlaylistModal(), SessionGate(), SessionStatus, ConfirmDeleteModal(), ConfirmDeleteModalProps, Check (+14 more)

### Community 6 - "Audio Debug Panel"
Cohesion: 0.10
Nodes (32): Pulse, Radio, BandwidthHistoryChart(), DebugPanel(), DecodeTab(), EventLog(), formatBytes(), formatKey() (+24 more)

### Community 7 - "App Routing & Entry Point"
Cohesion: 0.09
Nodes (24): src/main.tsx (app entry point), App(), AlbumPage, ArtistPage, DownloadsPage, FavoritesPage, HomePage, PlaylistPage (+16 more)

### Community 8 - "Album Page Playback Actions"
Cohesion: 0.10
Nodes (25): CircleNotch, Pause, Shuffle, AlbumPage(), handleDownloadAlbum(), handlePlayAlbum(), handleTrackClick(), toTrack() (+17 more)

### Community 9 - "Tauri App Configuration"
Cohesion: 0.07
Nodes (28): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+20 more)

### Community 10 - "Gapless Engine Test Suite"
Cohesion: 0.10
Nodes (9): decodedTrack(), FakeAudioBufferSourceNode, FakeAudioContext, FakeAudioElement, FakeAudioNode, FakeAudioParam, FakeGainNode, installWebAudioMocks() (+1 more)

### Community 11 - "Audio LRU Cache Store"
Cohesion: 0.16
Nodes (5): CacheStore, metaEntryKey(), ChunkListener, CacheEntryMeta, cacheKeyFor()

### Community 12 - "Client Runtime Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, hls.js, react, react-dom, react-router-dom, @resonia/api-client, tailwindcss, @tailwindcss/vite (+17 more)

### Community 13 - "Client Dev Tooling Dependencies"
Cohesion: 0.08
Nodes (25): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, globals, jsdom, @tauri-apps/cli, @types/node (+17 more)

### Community 14 - "Native Login & Password Vault"
Cohesion: 0.12
Nodes (17): handleSubmit(), ARTWORK_UPLOAD_PATH(), nativeLogin(), uploadPlaylistArtwork(), decryptPassword(), EncryptedPassword, encryptPassword(), getOrCreateKey() (+9 more)

### Community 15 - "Client TS Compiler Config"
Cohesion: 0.08
Nodes (24): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+16 more)

### Community 16 - "Update Notifier & Cache Settings"
Cohesion: 0.12
Nodes (16): Status, UpdateNotifier(), setAudioDebugEnabled(), setCoverCacheMaxBytes(), AppUpdate, checkForUpdate(), RawUpdateMetadata, relaunchApp() (+8 more)

### Community 17 - "Monorepo Root Package Config"
Cohesion: 0.09
Nodes (22): description, devDependencies, eslint, prettier, turbo, typescript, eslint, turbo (+14 more)

### Community 18 - "Sidebar Navigation"
Cohesion: 0.15
Nodes (17): navLinks, CaretDown, ChartBar, Disc, Folder, GearSix, Heart, House (+9 more)

### Community 19 - "Decoded Buffer Cache & Shuffle Order"
Cohesion: 0.20
Nodes (15): DecodedBufferCache, setNowPlayingPlaybackState(), linearOrder(), reshuffleUpcoming(), shuffleIndices(), applyPitchToEngineThrottled(), cancelThrottledPitch(), decodedCacheKey() (+7 more)

### Community 20 - "Node TS Compiler Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+11 more)

### Community 21 - "Favorites & Search Pages"
Cohesion: 0.18
Nodes (16): FavoritesPage(), handlePlayAll(), handleTrackClick(), toTrack(), useLikedSongs(), unlike(), SearchPage(), useSearch() (+8 more)

### Community 22 - "Track Downloader"
Cohesion: 0.14
Nodes (3): TrackDownloader, DownloadPriority, BlobStore

### Community 23 - "Cover Art Cache"
Cohesion: 0.22
Nodes (18): CacheEntryMeta, cacheKeyFor(), clearCoverCache(), coverFetchQueue, currentCoverCacheSize(), enforceLimit(), fetchForCache(), getCachedCoverUrl() (+10 more)

### Community 24 - "Animated Artwork Settings"
Cohesion: 0.22
Nodes (15): clearAnimatedCoverResolutionCache(), AnimatedArtworkHealth, CACHE_LIMIT_OPTIONS_GB, fillBarColor(), formatBytes(), isValidAnimatedArtworkUrl(), LOCALE_LABELS, platformFetch() (+7 more)

### Community 25 - "Animated Album Cover Resolution"
Cohesion: 0.21
Nodes (15): appleMusicUrlCache, appleMusicUrlCacheKeyFor(), platformFetch(), ResolvedAnimatedCover, resolveMasterUrl(), resolveMasterUrlViaAppleMusicUrl(), searchKeyFor(), searchResultCache (+7 more)

### Community 26 - "OS Media Session Integration"
Cohesion: 0.25
Nodes (15): applyActionHandlers(), clearMediaSessionPositionState(), isSupported(), MediaSessionHandlers, MediaSessionTrackInfo, registerMediaSessionHandlers(), resetMediaSession(), setMediaSessionPlaybackState() (+7 more)

### Community 27 - "Playlist Page Row Actions"
Cohesion: 0.14
Nodes (10): PlaylistPage(), handleDownloadPlaylist(), handlePlayPlaylist(), handleTrackClick(), toTrack(), sortPlaylistEntries(), usePlaylist(), Listener (+2 more)

### Community 28 - "Release Build Rationale Notes"
Cohesion: 0.22
Nodes (17): lib/audio/qualityOptions.ts (forces AAC 256kbps on web platform), lib/update/updateService.ts (reads release body for in-app release notes), apps/client/src-tauri/tauri.beta.conf.json (beta build config), Fixed-tag "beta" release as stable updater endpoint pointer, macOS builds restricted to Apple Silicon (arm64) only, pkgbuild relocation disabled to force /Applications install location, Draft-until-all-targets-succeed release strategy, Release (beta): docker-web job (+9 more)

### Community 29 - "Lyrics Service Fetching"
Cohesion: 0.20
Nodes (15): cache, fetchFromLrcLib(), fetchFromNavidrome(), inflight, loadLyrics(), LyricsLine, LyricsTrackInfo, PersistedLyrics (+7 more)

### Community 30 - "Blob Storage Backends"
Cohesion: 0.21
Nodes (9): createBlobStore(), createOpfsBlobStore(), getFileHandle(), getRootDir(), safeName(), createTauriFsBlobStore(), pathFor(), safeName() (+1 more)

### Community 31 - "Pitch Menu Fader"
Cohesion: 0.16
Nodes (14): Bug, ClockCounterClockwise, Microphone, Plug, SpeakerHigh, SpeakerX, clamp(), PitchFader() (+6 more)

### Community 32 - "Dominant Color Cache"
Cohesion: 0.24
Nodes (14): keyFor(), Resolved, useCachedDominantColor(), averageColorFromCanvas(), cacheKeyFor(), extractColor(), extractViaImageBitmap(), extractViaImageElement() (+6 more)

### Community 33 - "HTTP Range Fetcher"
Cohesion: 0.21
Nodes (9): ChunkTimeoutError, EndOfStreamError, fetchRange(), fetchRangeOnce(), isTransient(), RangeChunk, sleep(), ChunkEvent (+1 more)

### Community 34 - "Turborepo Task Pipeline"
Cohesion: 0.13
Nodes (14): ^build, dist/**, dependsOn, outputs, cache, persistent, outputs, $schema (+6 more)

### Community 35 - "Tauri Filesystem Permissions"
Cohesion: 0.14
Nodes (13): description, identifier, permissions, $schema, windows, fs:allow-appcache-read-recursive, fs:allow-appcache-write-recursive, fs:allow-appdata-read-recursive (+5 more)

### Community 36 - "Resonia Concept Overview"
Cohesion: 0.15
Nodes (14): Reusable Audio Data Cache, Audio Engine, Desktop Client, Gapless Playback, Navidrome, Preload Next 3 Tracks, Resonia, Rust (+6 more)

### Community 37 - "App Layout Keyboard Shortcuts"
Cohesion: 0.22
Nodes (9): AppLayout(), handleKeyDown(), isTypingTarget(), ArrowLeft, ArrowRight, WifiSlash, useDebouncedValue(), OnlineState (+1 more)

### Community 38 - "Audio Quality Options"
Cohesion: 0.22
Nodes (10): AnimatedAlbumCoverVideo(), AnimatedAlbumCoverVideoProps, AUDIO_QUALITIES, AudioQuality, DEFAULT_QUALITY_ID, FORMAT_MIME, getAvailableQualities(), isFormatPlayable() (+2 more)

### Community 39 - "Cache Store Test Suite"
Cohesion: 0.15
Nodes (3): FakeTrackDownloader, opfsDeleted, storageState

### Community 40 - "Synced Lyrics View"
Cohesion: 0.27
Nodes (11): easeOutCubic(), ensureContrastForWhiteText(), findActiveLineIndex(), LyricsView(), step(), tick(), perceivedLuminance(), ResolvedLyrics (+3 more)

### Community 41 - "Storage Adapter Abstraction"
Cohesion: 0.27
Nodes (4): storage, localStorageAdapter, tauriStoreAdapter, StorageAdapter

### Community 42 - "API Client Package"
Cohesion: 0.17
Nodes (11): dependencies, spark-md5, devDependencies, @types/spark-md5, main, name, private, type (+3 more)

### Community 43 - "m8tec Animated Artwork Client"
Cohesion: 0.21
Nodes (11): AnimatedArtworkHealthFailureReason, AnimatedArtworkHealthResult, AnimatedArtworkSearchResponse, AnimatedArtworkSearchResult, AnimatedArtworkStatusResponse, DEFAULT_ANIMATED_ARTWORK_BASE_URL, normalizeTitle(), searchAnimatedArtwork() (+3 more)

### Community 44 - "Queue Panel Drag & Drop"
Cohesion: 0.24
Nodes (8): Sidebar(), DotsSixVertical, DropPosition, formatDuration(), QueueItem(), QueueList(), QueuePanel(), useScrollingClass()

### Community 46 - "Tauri Rust Entry Point"
Cohesion: 0.24
Nodes (10): apply_kde_gtk_theme_workaround(), apply_pipewire_latency_workaround(), apply_webkitgtk_perf_workarounds(), check_for_update(), run(), Option, Result, String (+2 more)

### Community 47 - "iTunes Search Client"
Cohesion: 0.33
Nodes (10): findAlbumInArtistCatalog(), findArtistId(), findExactAlbumMatch(), ItunesArtistResult, ItunesSearchResponse, ItunesSearchResult, normalizeForComparison(), resolveAppleMusicAlbumUrl() (+2 more)

### Community 48 - "Client NPM Scripts"
Cohesion: 0.20
Nodes (10): scripts, build, dev, lint, preview, tauri, tauri:build, tauri:dev (+2 more)

### Community 49 - "Most Played Albums Widget"
Cohesion: 0.27
Nodes (5): AlbumCard(), AlbumCardProps, MostPlayedAlbums(), MostPlayedAlbumsProps, Album

### Community 50 - "Context Menu Positioning"
Cohesion: 0.20
Nodes (5): MenuPanel(), SubmenuPanel(), useClampedPosition(), useClampedSubmenuPosition(), recompute()

### Community 51 - "Prefetch Scheduler Test Suite"
Cohesion: 0.20
Nodes (6): QueueSlot, FakeTask, protectedKeysHistory, requestedOrder, tasks, UpcomingTrack

### Community 52 - "Carousel Scroll Controls"
Cohesion: 0.25
Nodes (5): CaretLeft, CaretRight, AlbumCarousel(), ResultSection(), ResultSectionProps

### Community 53 - "Track/Album/Playlist Menu Icons"
Cohesion: 0.25
Nodes (7): Info, ListPlus, PencilSimple, Trash, User, BuildPlaylistMenuItemsParams, PlaylistLike

### Community 54 - "Player Bar Transport Controls"
Cohesion: 0.28
Nodes (7): Repeat, SkipBack, SkipForward, PlayerBar(), formatTime(), PlayerSectionCenter(), ProgressBar()

### Community 55 - "OPFS Cache Store I/O"
Cohesion: 0.33
Nodes (5): audioCacheBlobStore, formatMb(), opfsDelete(), opfsReadAll(), requestPersistentStorage()

### Community 56 - "LRCLIB Lyrics Client"
Cohesion: 0.33
Nodes (7): fetchExact(), fetchLyricsFromLrcLib(), LRCLIB_USER_AGENT, LrcLibApiTrack, LrcLibResult, searchClosest(), toResult()

### Community 57 - "Last.fm Top Tracks"
Cohesion: 0.29
Nodes (6): normalize(), loadFromLastfm(), run(), getLastfmTopTracks(), LastfmTopTrack, LastfmTopTracksResponse

### Community 58 - "Vite/React Build Tooling"
Cohesion: 0.33
Nodes (6): eslint-plugin-react-dom, eslint-plugin-react-x, @vitejs/plugin-react (Oxc), @vitejs/plugin-react-swc (SWC), React Compiler (not enabled, dev/build perf impact), Vite + React + TypeScript template

### Community 59 - "Cache Type Definitions"
Cohesion: 0.33
Nodes (4): CACHE_FORMAT_VERSION, CacheKeyParts, DownloadProgress, ProgressListener

### Community 60 - "Beta Tauri Updater Config"
Cohesion: 0.33
Nodes (5): plugins, updater, $schema, endpoints, https://github.com/midnights-ra1n/resonia-client/releases/download/beta/latest.json

### Community 61 - "core Package Manifest"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 62 - "ui Package Manifest"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 63 - "Product Feature/Deployment Notes"
Cohesion: 0.33
Nodes (6): Docker deployment (ghcr.io/midnights-ra1n/resonia-client), Synchronized/unsynchronized lyrics support (feature, done), MPV player backend (feature, done), resonia-client (desktop client for Navidrome/OpenSubsonic), Smart playlist editor (Navidrome) (feature, done), Web player backend (feature, done)

### Community 64 - "Version Bump Script"
Cohesion: 0.33
Nodes (3): cargoTomlPath, rootPackageJsonPath, tauriConfPath

### Community 65 - "client Package Manifest"
Cohesion: 0.40
Nodes (4): name, private, type, version

## Knowledge Gaps
- **385 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+380 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **115 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `usePlayerStore` connect `Decoded Buffer Cache & Shuffle Order` to `Dominant Color Cache`, `Gapless Audio Engine Core`, `Playback Controls & Marquee Text`, `Create Playlist & Album Data Hooks`, `Playlist Sidebar Items`, `App Layout Keyboard Shortcuts`, `Audio Debug Panel`, `Album Page Playback Actions`, `Synced Lyrics View`, `App Routing & Entry Point`, `Queue Panel Drag & Drop`, `Favorites & Search Pages`, `Player Bar Transport Controls`, `Cover Art Cache`, `OS Media Session Integration`, `Playlist Page Row Actions`, `Lyrics Service Fetching`, `Pitch Menu Fader`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `CacheStore` connect `Audio LRU Cache Store` to `Audio Debug Panel`, `Update Notifier & Cache Settings`, `Prefetch Scheduler Test Suite`, `Decoded Buffer Cache & Shuffle Order`, `Track Downloader`, `OPFS Cache Store I/O`, `Animated Artwork Settings`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _385 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Download Manager UI` be split into smaller, more focused modules?**
  _Cohesion score 0.05945945945945946 - nodes in this community are weakly interconnected._
- **Should `Gapless Audio Engine Core` be split into smaller, more focused modules?**
  _Cohesion score 0.08077260755048288 - nodes in this community are weakly interconnected._
- **Should `Playlist/Album Menu Actions` be split into smaller, more focused modules?**
  _Cohesion score 0.05357142857142857 - nodes in this community are weakly interconnected._
- **Should `Playback Controls & Marquee Text` be split into smaller, more focused modules?**
  _Cohesion score 0.1419607843137255 - nodes in this community are weakly interconnected._