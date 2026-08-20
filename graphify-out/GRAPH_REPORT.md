# Graph Report - resonia-client  (2026-08-21)

## Corpus Check
- 136 files · ~182,086 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 842 nodes · 1441 edges · 144 communities (41 shown, 103 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- App Shell & Playlist Management
- App Bootstrap & Settings
- Gapless Audio Engine Core
- Player UI & Layout
- Client Runtime Dependencies (package.json)
- Subsonic API Client & Playlist Cards
- Client Dev Tooling Dependencies
- Gapless Engine Tests & Mocks
- TypeScript App Config
- Tauri App Config
- TypeScript Node Config
- Audio Cache Store
- Artist Photo Resolution (Apple Music)
- Root Monorepo Config
- OPFS Cache Storage
- Track Downloader
- Turborepo Pipeline Config
- CLAUDE.md Project Invariants
- Cache Store Tests
- Cover Art Cache
- API Client Package Config
- Auth & Password Vault
- Prefetch Scheduler
- Most Played Albums UI
- Prefetch Debug Logging
- Range Fetcher
- Tauri Capabilities Config
- Navidrome Native Client
- Prefetch Scheduler Tests
- Desktop App Icons (Resonia Brand)
- Client README (Vite Template Notes)
- Core Package Config
- UI Package Config
- Root README (Feature List)
- Search Result Section UI
- SongRow.tsx
- tsconfig.json
- default-cover.svg
- favicon.svg
- favicon.svg (2)
- resonia.png
- Album_view.png
- Album_view.png (2)
- Album_view.png (3)
- Album_view.png (4)
- Album_view.png (5)
- Album_view.png (6)
- Album_view.png (7)
- Album_view.png (8)
- community_56
- community_57
- community_58
- community_59
- community_60
- community_61
- community_62
- community_63
- Artist_view_2.png
- Artist_view_2.png (2)
- Artist_view_2.png (3)
- Artist_view_2.png (4)
- Artist_view_2.png (5)
- Artist_view_2.png (6)
- Artist_view_2.png (7)
- Artist_view_2.png (8)
- Artist_view_2.png (9)
- community_73
- community_74
- community_75
- community_76
- community_77
- community_78
- community_79
- Connect_view.png
- Connect_view.png (2)
- Connect_view.png (3)
- Connect_view.png (4)
- Connect_view.png (5)
- Connect_view.png (6)
- Connect_view.png (7)
- Connect_view.png (8)
- Connect_view.png (9)
- Connect_view.png (10)
- Fullscreen_view.png
- Fullscreen_view.png (2)
- Fullscreen_view.png (3)
- Fullscreen_view.png (4)
- Fullscreen_view.png (5)
- Fullscreen_view.png (6)
- Fullscreen_view.png (7)
- community_97
- community_98
- community_99
- community_100
- community_101
- community_102
- community_103
- community_104
- community_105
- community_106
- community_107
- community_108
- community_109
- community_110
- community_111
- Queue_view.png
- Queue_view.png (2)
- Queue_view.png (3)
- Queue_view.png (4)
- Queue_view.png (5)
- Queue_view.png (6)
- Queue_view.png (7)
- community_119
- community_120
- community_121
- community_122
- community_123
- community_124
- community_125
- community_126
- community_127
- Single_view.png
- Single_view.png (2)
- Single_view.png (3)
- Single_view.png (4)
- Single_view.png (5)
- Single_view.png (6)
- Single_view.png (7)
- Single_view.png (8)
- Single_view.png (9)
- Cargo.toml
- pnpm-workspace.yaml
- pnpm-workspace.yaml (2)
- Artist_view_2.png (10)
- Artist_view_3.png

## God Nodes (most connected - your core abstractions)
1. `useServersStore` - 44 edges
2. `getClientForServer()` - 41 edges
3. `usePlayerStore` - 39 edges
4. `GaplessEngine` - 33 edges
5. `useTranslation()` - 31 edges
6. `CacheStore` - 21 edges
7. `SubsonicClient` - 21 edges
8. `compilerOptions` - 18 edges
9. `TrackDownloader` - 17 edges
10. `AlbumPage()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `AlbumCarouselProps` --references--> `AlbumSummary`  [EXTRACTED]
  apps/client/src/features/album/AlbumCarousel.tsx → packages/api-client/src/subsonic/types.ts
- `AlbumCardProps` --references--> `AlbumSummary`  [EXTRACTED]
  apps/client/src/features/home/AlbumCard.tsx → packages/api-client/src/subsonic/types.ts
- `ArtistCardProps` --references--> `ArtistSummary`  [EXTRACTED]
  apps/client/src/features/search/ArtistCard.tsx → packages/api-client/src/subsonic/types.ts
- `PlaylistCardProps` --references--> `PlaylistSummary`  [EXTRACTED]
  apps/client/src/features/search/PlaylistCard.tsx → packages/api-client/src/subsonic/types.ts
- `TrackResultRowProps` --references--> `SongDTO`  [EXTRACTED]
  apps/client/src/features/search/TrackResultRow.tsx → packages/api-client/src/subsonic/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Audio Engine Invariants** — claude_gapless_playback, claude_preload_next_tracks, claude_audio_cache, claude_transition_control [EXTRACTED 1.00]

## Communities (144 total, 103 thin omitted)

### Community 0 - "App Shell & Playlist Management"
Cohesion: 0.06
Nodes (73): src/main.tsx (app entry point), CreatePlaylistModal(), handleSubmit(), CreatePlaylistModalProps, PlaylistSidebarItem(), PlaylistSidebarItemProps, navLinks, Sidebar() (+65 more)

### Community 1 - "App Bootstrap & Settings"
Cohesion: 0.08
Nodes (31): App(), router, SessionGate(), SessionStatus, LOCALE_LABELS, SettingsPage(), AUDIO_QUALITIES, AudioQuality (+23 more)

### Community 2 - "Gapless Audio Engine Core"
Cohesion: 0.10
Nodes (15): DecodedTrack, ActiveBuffer, ActiveNative, BufferPlayback, DecodedTrack, GaplessEngine, PendingNext, TrackState (+7 more)

### Community 3 - "Player UI & Layout"
Cohesion: 0.09
Nodes (34): AppLayout(), PlayerBar(), formatTime(), PlayerSectionCenter(), PlayerSectionLeft(), PlayerSectionRight(), DropPosition, formatDuration() (+26 more)

### Community 4 - "Client Runtime Dependencies (package.json)"
Cohesion: 0.05
Nodes (39): dependencies, @chakra-ui/react, lucide-react, react, react-dom, react-router-dom, @resonia/api-client, tailwindcss (+31 more)

### Community 5 - "Subsonic API Client & Playlist Cards"
Cohesion: 0.08
Nodes (17): PlaylistCardProps, generateSalt(), generateToken(), SubsonicApiError, SubsonicClient, SubsonicClientConfig, buildStreamUrl(), StreamUrlContext (+9 more)

### Community 6 - "Client Dev Tooling Dependencies"
Cohesion: 0.06
Nodes (31): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, jsdom, @tauri-apps/cli (+23 more)

### Community 7 - "Gapless Engine Tests & Mocks"
Cohesion: 0.10
Nodes (9): decodedTrack(), FakeAudioBufferSourceNode, FakeAudioContext, FakeAudioElement, FakeAudioNode, FakeAudioParam, FakeGainNode, installWebAudioMocks() (+1 more)

### Community 8 - "TypeScript App Config"
Cohesion: 0.08
Nodes (23): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+15 more)

### Community 9 - "Tauri App Config"
Cohesion: 0.09
Nodes (22): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+14 more)

### Community 10 - "TypeScript Node Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+11 more)

### Community 11 - "Audio Cache Store"
Cohesion: 0.22
Nodes (3): CacheStore, CacheEntryMeta, cacheKeyFor()

### Community 12 - "Artist Photo Resolution (Apple Music)"
Cohesion: 0.19
Nodes (15): photoCache, probeImageLoads(), resolveDesktopArtwork(), useArtistPhoto(), AppleMusicArtistArtwork, AppleMusicArtistMatch, extractAppleMusicArtistArtwork(), extractTopArtistMatch() (+7 more)

### Community 13 - "Root Monorepo Config"
Cohesion: 0.11
Nodes (17): description, devDependencies, eslint, prettier, turbo, typescript, eslint, turbo (+9 more)

### Community 14 - "OPFS Cache Storage"
Cohesion: 0.24
Nodes (13): createOpfsWriter(), getFileHandle(), getRootDir(), opfsDelete(), opfsFileSize(), opfsReadAll(), safeName(), ChunkEvent (+5 more)

### Community 16 - "Turborepo Pipeline Config"
Cohesion: 0.13
Nodes (14): ^build, dist/**, dependsOn, outputs, cache, persistent, outputs, $schema (+6 more)

### Community 17 - "CLAUDE.md Project Invariants"
Cohesion: 0.15
Nodes (14): Reusable Audio Data Cache, Audio Engine, Desktop Client, Gapless Playback, Navidrome, Preload Next 3 Tracks, Resonia, Rust (+6 more)

### Community 18 - "Cache Store Tests"
Cohesion: 0.15
Nodes (3): FakeTrackDownloader, opfsDeleted, storageState

### Community 19 - "Cover Art Cache"
Cohesion: 0.38
Nodes (10): ResolvedCover, CacheEntryMeta, cacheKeyFor(), enforceLimit(), getCachedCoverUrl(), loadAndCacheCover(), readMeta(), syntheticRequestFor() (+2 more)

### Community 20 - "API Client Package Config"
Cohesion: 0.17
Nodes (11): dependencies, spark-md5, devDependencies, @types/spark-md5, main, name, private, type (+3 more)

### Community 21 - "Auth & Password Vault"
Cohesion: 0.33
Nodes (8): LoginPage(), handleSubmit(), ARTWORK_UPLOAD_PATH(), nativeLogin(), uploadPlaylistArtwork(), decryptPassword(), encryptPassword(), getOrCreateKey()

### Community 23 - "Most Played Albums UI"
Cohesion: 0.27
Nodes (5): AlbumCard(), AlbumCardProps, MostPlayedAlbums(), MostPlayedAlbumsProps, Album

### Community 24 - "Prefetch Debug Logging"
Cohesion: 0.32
Nodes (5): PREFETCH_PERCENTAGES, QueueSlot, UpcomingTrack, debugLog(), isEnabled()

### Community 25 - "Range Fetcher"
Cohesion: 0.36
Nodes (6): EndOfStreamError, fetchRange(), fetchRangeOnce(), isTransient(), RangeChunk, sleep()

### Community 26 - "Tauri Capabilities Config"
Cohesion: 0.25
Nodes (7): description, identifier, permissions, $schema, windows, main, store:default

### Community 27 - "Navidrome Native Client"
Cohesion: 0.29
Nodes (4): NavidromeAuthResult, NavidromeNativeClient, NavidromeSong, NavidromeSongTags

### Community 28 - "Prefetch Scheduler Tests"
Cohesion: 0.29
Nodes (4): FakeTask, protectedKeysHistory, requestedOrder, tasks

### Community 29 - "Desktop App Icons (Resonia Brand)"
Cohesion: 0.38
Nodes (7): src-tauri (Tauri desktop backend), 128x128.png (Tauri app icon), 128x128@2x.png (Resonia app icon, retina), 32x32.png (Tauri app icon, small size), Resonia brand icon design (green rounded-square, white R monogram), Resonia brand icon (letter 'R' mark), Resonia Tauri desktop application

### Community 30 - "Client README (Vite Template Notes)"
Cohesion: 0.33
Nodes (6): eslint-plugin-react-dom, eslint-plugin-react-x, @vitejs/plugin-react (Oxc), @vitejs/plugin-react-swc (SWC), React Compiler (not enabled, dev/build perf impact), Vite + React + TypeScript template

### Community 31 - "Core Package Config"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 32 - "UI Package Config"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 33 - "Root README (Feature List)"
Cohesion: 0.33
Nodes (6): Docker deployment (ghcr.io/midnights-ra1n/resonia-client), Synchronized/unsynchronized lyrics support (feature, done), MPV player backend (feature, done), resonia-client (desktop client for Navidrome/OpenSubsonic), Smart playlist editor (Navidrome) (feature, done), Web player backend (feature, done)

## Knowledge Gaps
- **299 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+294 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **103 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `usePlayerStore` connect `Player UI & Layout` to `App Shell & Playlist Management`, `App Bootstrap & Settings`, `Gapless Audio Engine Core`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `CacheStore` connect `Audio Cache Store` to `Prefetch Debug Logging`, `Player UI & Layout`, `OPFS Cache Storage`, `Track Downloader`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _299 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Shell & Playlist Management` be split into smaller, more focused modules?**
  _Cohesion score 0.05515170670037927 - nodes in this community are weakly interconnected._
- **Should `App Bootstrap & Settings` be split into smaller, more focused modules?**
  _Cohesion score 0.07918552036199095 - nodes in this community are weakly interconnected._
- **Should `Gapless Audio Engine Core` be split into smaller, more focused modules?**
  _Cohesion score 0.0963265306122449 - nodes in this community are weakly interconnected._
- **Should `Player UI & Layout` be split into smaller, more focused modules?**
  _Cohesion score 0.09042553191489362 - nodes in this community are weakly interconnected._